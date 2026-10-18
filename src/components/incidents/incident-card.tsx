import { StyleSheet, View } from 'react-native';

import type { Incident } from '@/api/incidents';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { municipalityLabel } from '@/constants/municipalities';
import { Spacing } from '@/constants/theme';

// Same colors as the map pins.
const TYPE_COLORS = { fire: '#F28C28', crime: '#2F6FED' } as const;
const TYPE_LABELS = { fire: 'Fire', crime: 'Crime' } as const;
const SOURCE_LABELS = { tps: 'Toronto Police', tfs: 'Toronto Fire' } as const;

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

/** One incident in a list: type, title, description, where, when, and votes. */
export function IncidentCard({ incident }: { incident: Incident }) {
  const resolved = incident.status === 'inactive';
  const meta = [
    incident.locationText,
    municipalityLabel(incident.municipality) ?? 'Outside Toronto',
    incident.distanceM !== undefined ? formatDistance(incident.distanceM) : null,
    timeAgo(incident.createdAt),
  ].filter(Boolean);

  return (
    <ThemedView type="backgroundElement" style={[styles.card, resolved && styles.resolved]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: TYPE_COLORS[incident.type] }]}>
          <ThemedText type="smallBold" style={styles.badgeText}>
            {TYPE_LABELS[incident.type]}
          </ThemedText>
        </View>
        {resolved && (
          <ThemedText type="smallBold" themeColor="textSecondary">
            Resolved
          </ThemedText>
        )}
        {incident.mine && (
          <ThemedText type="small" themeColor="textSecondary">
            Reported by you
          </ThemedText>
        )}
        {incident.source && incident.source !== 'user' && (
          <ThemedText type="small" themeColor="textSecondary">
            {SOURCE_LABELS[incident.source]}
          </ThemedText>
        )}
      </View>

      <ThemedText type="smallBold" style={styles.title}>
        {incident.title || 'Untitled incident'}
      </ThemedText>
      {incident.description && <ThemedText type="small">{incident.description}</ThemedText>}

      <ThemedText type="small" themeColor="textSecondary">
        {meta.join(' · ')}
      </ThemedText>
      {incident.confirms !== undefined && (
        <ThemedText type="small" themeColor="textSecondary">
          {incident.confirms} still there · {incident.denies ?? 0} not there
          {incident.myVote != null && ` · you said ${incident.myVote ? 'still there' : 'not there'}`}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  resolved: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  badgeText: {
    color: '#fff',
  },
  title: {
    fontSize: 16,
  },
});
