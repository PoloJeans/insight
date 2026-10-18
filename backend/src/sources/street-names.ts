// Street-name helpers shared by the police and fire importers and the intersection loader.

// Toronto Fire suffixes each street with its former municipality, e.g. "DANFORTH AVE, EY".
export const AREA_SLUGS: Record<string, string> = {
  TT: 'old-toronto',
  EY: 'east-york',
  ET: 'etobicoke',
  NY: 'north-york',
  SC: 'scarborough',
  YK: 'york',
};

/** "DANFORTH AVE, EY" -> { street: "DANFORTH AVE", area: "east-york" } */
export function splitArea(raw: string): { street: string; area: string | null } {
  const match = /^(.*?),\s*([A-Z]{2})$/.exec(raw.trim());
  if (!match) return { street: raw.trim(), area: null };
  return { street: match[1].trim(), area: AREA_SLUGS[match[2]] ?? null };
}

/**
 * The form both the fire feed and the city's intersection file are compared in:
 * uppercase, no punctuation, single spaces. "St. Clair Ave W" -> "ST CLAIR AVE W".
 */
export const normalizeStreet = (s: string) =>
  s
    .toUpperCase()
    .replace(/[.'{}]/g, '') // the fire feed sometimes has stray braces: "LOWER SIMCOE ST{/ ..."
    .replace(/\s+/g, ' ')
    .trim()
    // The fire feed's expressway names differ from the city's: "F G GARDINER XY E" vs "GARDINER XWY".
    .replace(/^F G GARDINER\b/, 'GARDINER')
    .replace(/\bXY\b/, 'XWY');

/** Laneway descriptions like "LN W CARROLL N THOMPSON" never match a named intersection. */
export const isLaneCode = (s: string) => /^LN [NSEW] /.test(s.trim().toUpperCase());

// "BROWN'S LINE" -> "Brown's Line" (a plain \b would also capitalize the "s" after the apostrophe),
// while "O'CONNOR DR" -> "O'Connor Dr".
export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b([A-Z])'([a-z])/g, (_, a, b) => `${a}'${b.toUpperCase()}`);

const DIRECTIONS: Record<string, string> = { N: 'north', S: 'south', E: 'east', W: 'west' };

// Laneways are described relative to two streets: "LN N HARBORD E OSSINGTON" is the lane
// north of Harbord and east of Ossington.
export const formatStreet = (street: string) => {
  const lane = /^LN ([NSEW]) (.+) ([NSEW]) (.+)$/.exec(street);
  if (!lane) return titleCase(street);
  const [, dir1, street1, dir2, street2] = lane;
  return `Lane ${DIRECTIONS[dir1]} of ${titleCase(street1)}, ${DIRECTIONS[dir2]} of ${titleCase(street2)}`;
};
