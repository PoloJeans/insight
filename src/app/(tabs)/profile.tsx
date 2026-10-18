/**
 * Profile tab: incidents the signed-in user reported and incidents they voted on,
 * active or resolved. Reloads on focus and on pull-to-refresh.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { deleteIncident, getMyIncidents, type Incident } from '@/api/incidents';
import { IncidentCard } from '@/components/incidents/incident-card';
import { SwipeToDelete } from '@/components/incidents/swipe-to-delete';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentCoords } from '@/utils/location';

interface Section {
  key: 'created' | 'voted';
  title: string;
  empty: string;
  data: Incident[];
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { signOut, markSignedOut } = useSession();

  const [mine, setMine] = useState<{ created: Incident[]; voted: Incident[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    try {
      // Location only adds distances, so it's fine if it's off.
      const result = await getMyIncidents((await getCurrentCoords()) ?? undefined);
      if (requestId !== latestRequestRef.current) return;
      setMine(result);
      setError(null);
    } catch (e) {
      if (requestId !== latestRequestRef.current) return;
      if (e instanceof ApiError && e.status === 401) return markSignedOut();
      setError(e instanceof Error ? e.message : 'Could not load your activity.');
    }
  }, [markSignedOut]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Soft delete: the server keeps the row but stops returning it. Resolves to whether the
  // card should disappear.
  const removeReport = async (incident: Incident): Promise<boolean> => {
    try {
      await deleteIncident(incident.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        markSignedOut();
        return false;
      }
      // 404: already deleted (e.g. from another device), so just drop the card.
      if (!(e instanceof ApiError && e.status === 404)) {
        Alert.alert("Couldn't delete", e instanceof Error ? e.message : 'Please try again.');
        return false;
      }
    }
    setMine((prev) =>
      prev && {
        created: prev.created.filter((i) => i.id !== incident.id),
        voted: prev.voted.filter((i) => i.id !== incident.id),
      }
    );
    return true;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sections: Section[] = [
    {
      key: 'created',
      title: 'Reported by you · swipe left to delete',
      empty: 'Long-press the map to report an incident.',
      data: mine?.created ?? [],
    },
    {
      key: 'voted',
      title: 'Your votes',
      empty: 'Tap a pin on the map to say whether it’s still there.',
      data: mine?.voted ?? [],
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Profile</ThemedText>
          <Pressable
            onPress={signOut}
            style={({ pressed }) => [
              styles.signOut,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Sign out</ThemedText>
          </Pressable>
        </View>
        {error && (
          <ThemedText type="small" style={styles.error}>
            Couldn&apos;t load your activity: {error}
          </ThemedText>
        )}

        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={({ item, section }) =>
            // Only your own reports can be deleted.
            section.key === 'created' ? (
              <SwipeToDelete onDelete={() => removeReport(item)}>
                <IncidentCard incident={item} />
              </SwipeToDelete>
            ) : (
              <IncidentCard incident={item} />
            )
          }
          renderSectionHeader={({ section }) => (
            <ThemedView style={styles.sectionHeader}>
              <ThemedText type="smallBold">
                {section.title}
                {mine && ` (${section.data.length})`}
              </ThemedText>
            </ThemedView>
          )}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {mine === null ? 'Loading…' : section.empty}
              </ThemedText>
            ) : null
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  signOut: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    color: '#d33',
    paddingHorizontal: Spacing.three,
  },
  sectionHeader: {
    paddingTop: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
});
