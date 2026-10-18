// Turns a Toronto Fire location ("DANFORTH AVE, EY" + "LUTTRELL AVE / SIBLEY AVE") into a
// point, using the city's named intersections. Never guesses: if nothing matches cleanly,
// the event gets no pin.
import { formatStreet, isLaneCode, normalizeStreet, splitArea } from './street-names';

export interface Candidate {
  lat: number;
  lng: number;
  /** Inside the former municipality named by the feed's area suffix. */
  inArea: boolean;
}

/** Intersections where any spelling of street A meets any spelling of street B (normalized). */
export type FindIntersections = (
  streetA: string[],
  streetB: string[],
  area: string | null,
) => Promise<Candidate[]>;

export interface ResolvedLocation {
  lat: number;
  lng: number;
  /** e.g. "Danforth Ave between Luttrell Ave & Sibley Ave" */
  text: string;
  method: 'midpoint' | 'intersection' | 'cross-streets';
}

// Two intersections further apart than this aren't "the same block".
const MAX_BLOCK_M = 2_000;
// Repeated matches this close together (ramps, divided roads) count as one place.
const SAME_PLACE_M = 300;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// The feed often drops the direction ("LAWRENCE AVE") where the city always has it
// ("LAWRENCE AVE W"), so a street without one also matches its E/W/N/S versions.
// Wrong guesses are caught by the distance and ambiguity checks below.
// The reverse also happens ("GARDINER XWY E" vs the city's "GARDINER XWY").
const spellings = (street: string) => {
  const name = normalizeStreet(street);
  return / [NSEW]$/.test(name)
    ? [name, name.slice(0, -2)]
    : [name, `${name} E`, `${name} W`, `${name} N`, `${name} S`];
};

// Prefer matches inside the feed's area; fall back to all if none are.
const preferArea = (candidates: Candidate[]) => {
  const inArea = candidates.filter((c) => c.inArea);
  return inArea.length > 0 ? inArea : candidates;
};

// One place, or null if the matches are spread out (an ambiguous street name).
function singlePlace(candidates: Candidate[]): { lat: number; lng: number } | null {
  if (candidates.length === 0) return null;
  const spread = candidates.every((a) => candidates.every((b) => distanceM(a, b) <= SAME_PLACE_M));
  if (!spread) return null;
  return {
    lat: candidates.reduce((sum, c) => sum + c.lat, 0) / candidates.length,
    lng: candidates.reduce((sum, c) => sum + c.lng, 0) / candidates.length,
  };
}

export async function resolveFireLocation(
  primeStreet: string,
  crossStreets: string,
  find: FindIntersections,
): Promise<ResolvedLocation | null> {
  const { street: primeRaw, area } = splitArea(primeStreet);
  // A bare postal prefix ("M8Z") isn't a street.
  const prime = primeRaw && !/^M\d[A-Z]$/.test(primeRaw) ? primeRaw : null;
  const crosses = crossStreets
    .split('/')
    .map((s) => s.replace(/[{}]/g, '').trim())
    .filter((s) => s && !isLaneCode(s));

  const lookup = async (a: string, b: string) =>
    preferArea(await find(spellings(a), spellings(b), area));

  if (prime && crosses.length >= 2) {
    // 1. On the main street between both cross streets: the middle of that block.
    const [ends1, ends2] = await Promise.all([lookup(prime, crosses[0]), lookup(prime, crosses[1])]);
    let best: { a: Candidate; b: Candidate; d: number } | null = null;
    for (const a of ends1)
      for (const b of ends2) {
        const d = distanceM(a, b);
        if (!best || d < best.d) best = { a, b, d };
      }
    if (best && best.d <= MAX_BLOCK_M) {
      return {
        lat: (best.a.lat + best.b.lat) / 2,
        lng: (best.a.lng + best.b.lng) / 2,
        text: `${formatStreet(prime)} between ${formatStreet(crosses[0])} & ${formatStreet(crosses[1])}`,
        method: 'midpoint',
      };
    }
  }

  if (prime) {
    // 2. The main street at one of the cross streets.
    for (const cross of crosses) {
      const place = singlePlace(await lookup(prime, cross));
      if (place) {
        return { ...place, text: `${formatStreet(prime)} & ${formatStreet(cross)}`, method: 'intersection' };
      }
    }
  }

  if (crosses.length >= 2) {
    // 3. The cross streets with each other (covers a blank main street).
    const place = singlePlace(await lookup(crosses[0], crosses[1]));
    if (place) {
      return {
        ...place,
        text: `${formatStreet(crosses[0])} & ${formatStreet(crosses[1])}`,
        method: 'cross-streets',
      };
    }
  }

  return null;
}
