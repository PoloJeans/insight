/**
 * Incidents tab: every incident in the database as a list, newest first, with filters
 * for type, date, former municipality and distance. Reloads when the tab is focused,
 * when a filter changes, and on pull-to-refresh.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { searchIncidents, type Incident, type IncidentType } from '@/api/incidents';
import { FilterChips, type ChipOption } from '@/components/incidents/filter-chips';
import { IncidentCard } from '@/components/incidents/incident-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MUNICIPALITIES, type MunicipalitySlug } from '@/constants/municipalities';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentCoords, type Coords } from '@/utils/location';

// Distances are measured from here when location is off.
const DOWNTOWN_TORONTO: Coords = { lat: 43.6532, lng: -79.3832 };

const HOUR_MS = 60 * 60 * 1000;

const TYPE_OPTIONS: ChipOption<'all' | IncidentType>[] = [
  { value: 'all', label: 'All' },
  { value: 'fire', label: 'Fire' },
  { value: 'crime', label: 'Crime' },
];

// Values are how far back to look, in hours; 0 = any time.
const DATE_OPTIONS: ChipOption<number>[] = [
  { value: 0, label: 'Any time' },
  { value: 24, label: 'Last 24 h' },
  { value: 24 * 7, label: 'Last 7 days' },
  { value: 24 * 30, label: 'Last 30 days' },
];

const MUNICIPALITY_OPTIONS: ChipOption<'all' | MunicipalitySlug>[] = [
  { value: 'all', label: 'All' },
  ...MUNICIPALITIES.map((m) => ({ value: m.slug, label: m.label })),
];

// Radius in meters; 0 = anywhere.
const VICINITY_OPTIONS: ChipOption<number>[] = [
  { value: 0, label: 'Anywhere' },
  { value: 1_000, label: 'Within 1 km' },
  { value: 5_000, label: 'Within 5 km' },
  { value: 10_000, label: 'Within 10 km' },
  { value: 25_000, label: 'Within 25 km' },
];

const RESOLVED_OPTIONS: ChipOption<'hide' | 'show'>[] = [
  { value: 'hide', label: 'Hide' },
  { value: 'show', label: 'Show' },
];

export default function IncidentsScreen() {
  const theme = useTheme();
  const { markSignedOut } = useSession();

  const [type, setType] = useState<'all' | IncidentType>('all');
  const [sinceHours, setSinceHours] = useState(0);
  const [municipality, setMunicipality] = useState<'all' | MunicipalitySlug>('all');
  const [radiusM, setRadiusM] = useState(0);
  const [resolved, setResolved] = useState<'hide' | 'show'>('hide');

  // null = first load still running.
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [usingFallbackLocation, setUsingFallbackLocation] = useState(false);

  // Drops responses for filters that have since changed.
  const latestRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    try {
      const coords = await getCurrentCoords();
      const origin = coords ?? DOWNTOWN_TORONTO;
      const results = await searchIncidents({
        ...origin,
        radiusM: radiusM || undefined,
        type: type === 'all' ? undefined : type,
        municipality: municipality === 'all' ? undefined : municipality,
        since: sinceHours ? new Date(Date.now() - sinceHours * HOUR_MS) : undefined,
        includeResolved: resolved === 'show',
      });
      if (requestId !== latestRequestRef.current) return;
      setIncidents(results);
      setUsingFallbackLocation(coords === null);
      setError(null);
    } catch (e) {
      if (requestId !== latestRequestRef.current) return;
      if (e instanceof ApiError && e.status === 401) return markSignedOut();
      setError(e instanceof Error ? e.message : 'Could not load incidents.');
    }
  }, [type, sinceHours, municipality, radiusM, resolved, markSignedOut]);

  // Runs on focus and again whenever a filter changes (load is recreated).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filters = (
    <View style={styles.filters}>
      <FilterChips label="Type" options={TYPE_OPTIONS} value={type} onChange={setType} />
      <FilterChips label="Date" options={DATE_OPTIONS} value={sinceHours} onChange={setSinceHours} />
      <FilterChips
        label="Area"
        options={MUNICIPALITY_OPTIONS}
        value={municipality}
        onChange={setMunicipality}
      />
      <FilterChips label="Vicinity" options={VICINITY_OPTIONS} value={radiusM} onChange={setRadiusM} />
      <FilterChips label="Resolved" options={RESOLVED_OPTIONS} value={resolved} onChange={setResolved} />
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Incidents</ThemedText>
          {incidents && (
            <ThemedText type="small" themeColor="textSecondary">
              {incidents.length === 200 ? 'Newest 200' : `${incidents.length} found`}
            </ThemedText>
          )}
        </View>
        {filters}
        {usingFallbackLocation && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Location is off, so distances are from downtown Toronto.
          </ThemedText>
        )}
        {error && (
          <ThemedText type="small" style={[styles.note, styles.error]}>
            Couldn&apos;t load incidents: {error}
          </ThemedText>
        )}

        <FlatList
          data={incidents ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <IncidentCard incident={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
          }
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {incidents === null ? 'Loading…' : 'No incidents match these filters.'}
            </ThemedText>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  filters: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  note: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  error: {
    color: '#d33',
  },
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  empty: {
    textAlign: 'center',
    paddingTop: Spacing.five,
  },
});
