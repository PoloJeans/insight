// The incident filters shared by the Incidents tab and the map's filter dropdown.

import { StyleSheet, View } from 'react-native';

import type { IncidentSearch, IncidentType } from '@/api/incidents';
import { FilterChips, type ChipOption } from '@/components/incidents/filter-chips';
import { MUNICIPALITIES, type MunicipalitySlug } from '@/constants/municipalities';
import { Spacing } from '@/constants/theme';

export interface IncidentFilters {
  type: 'all' | IncidentType;
  /** How far back to look, in hours; 0 = any time. */
  sinceHours: number;
  municipality: 'all' | MunicipalitySlug;
  /** Within this many meters of the user; 0 = anywhere. */
  radiusM: number;
  resolved: 'hide' | 'show';
}

export const DEFAULT_FILTERS: IncidentFilters = {
  type: 'all',
  sinceHours: 0,
  municipality: 'all',
  radiusM: 0,
  resolved: 'hide',
};

const HOUR_MS = 60 * 60 * 1000;

const TYPE_OPTIONS: ChipOption<IncidentFilters['type']>[] = [
  { value: 'all', label: 'All' },
  { value: 'fire', label: 'Fire' },
  { value: 'crime', label: 'Crime' },
];

const DATE_OPTIONS: ChipOption<number>[] = [
  { value: 0, label: 'Any time' },
  { value: 24, label: 'Last 24 h' },
  { value: 24 * 7, label: 'Last 7 days' },
  { value: 24 * 30, label: 'Last 30 days' },
];

const MUNICIPALITY_OPTIONS: ChipOption<IncidentFilters['municipality']>[] = [
  { value: 'all', label: 'All' },
  ...MUNICIPALITIES.map((m) => ({ value: m.slug, label: m.label })),
];

const VICINITY_OPTIONS: ChipOption<number>[] = [
  { value: 0, label: 'Anywhere' },
  { value: 1_000, label: 'Within 1 km' },
  { value: 5_000, label: 'Within 5 km' },
  { value: 10_000, label: 'Within 10 km' },
  { value: 25_000, label: 'Within 25 km' },
];

const RESOLVED_OPTIONS: ChipOption<IncidentFilters['resolved']>[] = [
  { value: 'hide', label: 'Hide' },
  { value: 'show', label: 'Show' },
];

/** How many filters differ from the defaults, for a badge on a collapsed filter button. */
export const activeFilterCount = (filters: IncidentFilters): number =>
  (Object.keys(DEFAULT_FILTERS) as (keyof IncidentFilters)[]).filter(
    (key) => filters[key] !== DEFAULT_FILTERS[key]
  ).length;

/** Search params for everything except where to search from (the caller picks the point). */
export const filtersToSearch = (
  filters: IncidentFilters
): Omit<IncidentSearch, 'lat' | 'lng' | 'radiusM'> => ({
  type: filters.type === 'all' ? undefined : filters.type,
  municipality: filters.municipality === 'all' ? undefined : filters.municipality,
  since: filters.sinceHours ? new Date(Date.now() - filters.sinceHours * HOUR_MS) : undefined,
  includeResolved: filters.resolved === 'show',
});

/** The five chip rows: type, date, area, vicinity, resolved. */
export function IncidentFilterRows({
  filters,
  onChange,
}: {
  filters: IncidentFilters;
  onChange: (filters: IncidentFilters) => void;
}) {
  const set =
    <K extends keyof IncidentFilters>(key: K) =>
    (value: IncidentFilters[K]) =>
      onChange({ ...filters, [key]: value });

  return (
    <View style={styles.rows}>
      <FilterChips label="Type" options={TYPE_OPTIONS} value={filters.type} onChange={set('type')} />
      <FilterChips
        label="Date"
        options={DATE_OPTIONS}
        value={filters.sinceHours}
        onChange={set('sinceHours')}
      />
      <FilterChips
        label="Area"
        options={MUNICIPALITY_OPTIONS}
        value={filters.municipality}
        onChange={set('municipality')}
      />
      <FilterChips
        label="Vicinity"
        options={VICINITY_OPTIONS}
        value={filters.radiusM}
        onChange={set('radiusM')}
      />
      <FilterChips
        label="Resolved"
        options={RESOLVED_OPTIONS}
        value={filters.resolved}
        onChange={set('resolved')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: Spacing.two,
  },
});
