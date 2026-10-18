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
import { searchIncidents, type Incident } from '@/api/incidents';
import { IncidentCard } from '@/components/incidents/incident-card';
import {
  DEFAULT_FILTERS,
  filtersToSearch,
  IncidentFilterRows,
  type IncidentFilters,
} from '@/components/incidents/incident-filters';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentCoords, type Coords } from '@/utils/location';

// Distances are measured from here when location is off.
const DOWNTOWN_TORONTO: Coords = { lat: 43.6532, lng: -79.3832 };

export default function IncidentsScreen() {
  const theme = useTheme();
  const { markSignedOut } = useSession();

  const [filters, setFilters] = useState<IncidentFilters>(DEFAULT_FILTERS);

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
        radiusM: filters.radiusM || undefined,
        ...filtersToSearch(filters),
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
  }, [filters, markSignedOut]);

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
        <View style={styles.filters}>
          <IncidentFilterRows filters={filters} onChange={setFilters} />
        </View>
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
