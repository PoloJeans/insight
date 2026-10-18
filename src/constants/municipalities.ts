// Toronto's six former municipalities. Slugs match the backend's municipalities table.
export const MUNICIPALITIES = [
  { slug: 'east-york', label: 'East York' },
  { slug: 'etobicoke', label: 'Etobicoke' },
  { slug: 'north-york', label: 'North York' },
  { slug: 'old-toronto', label: 'Old Toronto' },
  { slug: 'scarborough', label: 'Scarborough' },
  { slug: 'york', label: 'York' },
] as const;

export type MunicipalitySlug = (typeof MUNICIPALITIES)[number]['slug'];

export const municipalityLabel = (slug: MunicipalitySlug | null | undefined): string | null =>
  MUNICIPALITIES.find((m) => m.slug === slug)?.label ?? null;
