/**
 * Map tab: an interactive map that shows the user's location and the incidents near the
 * map's center, refreshed every 30 seconds. The Filters dropdown (top left) narrows the
 * pins with the same filters as the Incidents tab. Long-pressing the map opens a form
 * to report an incident (title, description, type); saving it writes the incident to
 * the database through the API and adds a pin.
 */

import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location'; // phone GPS + permission pop-up
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import {
  createIncident,
  searchIncidents,
  voteIncident,
  type Incident,
  type IncidentType,
} from '@/api/incidents';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filtersToSearch,
  IncidentFilterRows,
  type IncidentFilters,
} from '@/components/incidents/incident-filters';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { displayDescription } from '@/utils/incident-text';
import { getCurrentCoords } from '@/utils/location';

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: 'crime', label: 'Crime' },
  { value: 'fire', label: 'Fire' },
];

// Where the map starts (downtown Toronto) before we know where the user is.
const DEFAULT_REGION: Region = {
  latitude: 43.6532,
  longitude: -79.3832,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// e.g. "123 Queen St W, Toronto". Null when the lookup found nothing usable.
function formatAddress(address: Location.LocationGeocodedAddress | undefined): string | null {
  if (!address) return null;
  if (address.formattedAddress) return address.formattedAddress; // Android only
  const street = [address.streetNumber, address.street].filter(Boolean).join(' ');
  const parts = [street || address.name, address.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

// e.g. "12 min ago · Oct 17, 3:42 PM".
function formatReportedTime(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  const relative =
    minutes < 1
      ? 'Just now'
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 24 * 60
          ? `${Math.floor(minutes / 60)} h ago`
          : `${Math.floor(minutes / (24 * 60))} d ago`;
  const absolute = date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${relative} · ${absolute}`;
}

const POLL_INTERVAL_MS = 30_000;
// With Vicinity set to Anywhere, pins load within this distance of the map's center.
const MAP_AREA_RADIUS_M = 25_000;

export default function MapScreen() {
  const theme = useTheme();
  const { markSignedOut } = useSession();
  const mapRef = useRef<MapView>(null);

  // The tab bar sits over the map, plus the home-indicator area under it on newer phones.
  const insets = useSafeAreaInsets();
  const aboveTabBar = { bottom: insets.bottom };

  // null = still asking, true = allowed, false = denied.
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  // Incidents matching the filters, replaced on every successful fetch.
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filters, setFilters] = useState<IncidentFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = activeFilterCount(filters);

  // A ref, not state: moving the map shouldn't re-render, only change where we fetch.
  const centerRef = useRef<LatLng>(DEFAULT_REGION);

  // Latest known user position, and whether the map is currently centered on it (the
  // location button is filled while it is, as in Apple Maps).
  const userLocationRef = useRef<LatLng | null>(null);
  const [centeredOnUser, setCenteredOnUser] = useState(false);
  // Lets a slow response be dropped if a newer request was started after it.
  const latestRequestRef = useRef(0);

  const loadIncidents = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    try {
      // A Vicinity filter is measured from the user, like the Incidents tab; otherwise
      // load what's around the part of the map being looked at.
      const userCoords = filters.radiusM ? await getCurrentCoords() : null;
      const origin = userCoords ?? {
        lat: centerRef.current.latitude,
        lng: centerRef.current.longitude,
      };
      const nearby = await searchIncidents({
        ...origin,
        radiusM: filters.radiusM || MAP_AREA_RADIUS_M,
        ...filtersToSearch(filters),
      });
      if (requestId !== latestRequestRef.current) return;
      setIncidents(nearby);
      setLoadError(null);
    } catch (e) {
      if (requestId !== latestRequestRef.current) return;
      // Login expired or was revoked: back to the sign-in screen.
      if (e instanceof ApiError && e.status === 401) return markSignedOut();
      // Keep the pins we already have; the next poll retries.
      setLoadError(e instanceof Error ? e.message : 'Could not load incidents.');
    }
  }, [filters, markSignedOut]);

  // Fetch now and every 30s while the Map tab is focused; stop when leaving it.
  useFocusEffect(
    useCallback(() => {
      loadIncidents();
      const timer = setInterval(loadIncidents, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [loadIncidents])
  );

  // The pin the user tapped. While this is set, its card with the vote buttons is shown.
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  // Street addresses by incident id, so reopening a pin doesn't geocode again.
  // null = looked up but nothing found; missing = not looked up yet.
  const [addresses, setAddresses] = useState<Record<string, string | null>>({});
  const selectedId = selectedIncident?.id;
  const selectedAddress = selectedId ? addresses[selectedId] : undefined;

  useEffect(() => {
    // Imported calls carry their own cross streets; geocoding their intersection point
    // would invent a house number that implies a precise address.
    if (!selectedIncident || selectedIncident.locationText || selectedAddress !== undefined) return;
    const { id, lat, lng } = selectedIncident;
    Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
      .then((results) => setAddresses((prev) => ({ ...prev, [id]: formatAddress(results[0]) })))
      // Leave the address blank; tapping the pin again retries.
      .catch((e) => console.warn('Could not look up address', e));
  }, [selectedIncident, selectedAddress]);

  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const selectIncident = (incident: Incident | null) => {
    setSelectedIncident(incident);
    setVoteError(null);
  };

  // "Not there" marks the incident inactive in the database; its pin disappears on the
  // next poll. "Still there" is recorded but leaves the incident as is.
  const vote = async (incident: Incident, stillThere: boolean) => {
    setVoting(true);
    setVoteError(null);
    try {
      await voteIncident(incident.id, stillThere);
      setSelectedIncident(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return markSignedOut();
      // 404: someone else already resolved it. The next poll removes the pin.
      if (e instanceof ApiError && e.status === 404) return setSelectedIncident(null);
      setVoteError(e instanceof Error ? e.message : 'Could not send your vote.');
    } finally {
      setVoting(false);
    }
  };

  // Where the user long-pressed. While this is set, the form is open.
  const [pendingCoordinate, setPendingCoordinate] = useState<LatLng | null>(null);

  // Form fields.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<IncidentType | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Title and type are required (the API accepts a blank title, so the form enforces it).
  const canSubmit = title.trim().length > 0 && type !== null && !submitting;

  const closeForm = () => {
    if (submitting) return;
    setPendingCoordinate(null);
    setTitle('');
    setDescription('');
    setType(null);
    setSubmitError(null);
  };

  // Only adds the pin once the API confirms the save; on failure the form stays open
  // with the user's input so they can retry.
  const submitIncident = async () => {
    if (!pendingCoordinate || !canSubmit || type === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await createIncident({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        lat: pendingCoordinate.latitude,
        lng: pendingCoordinate.longitude,
      });
      // Show it right away instead of waiting for the next poll.
      setIncidents((prev) => [...prev.filter((i) => i.id !== saved.id), saved]);
      setSubmitting(false);
      setPendingCoordinate(null);
      setTitle('');
      setDescription('');
      setType(null);
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ApiError && e.status === 401) return markSignedOut();
      setSubmitError(e instanceof Error ? e.message : 'Could not save the incident.');
    }
  };

  // Read the phone's GPS position and glide the map to it.
  const centerOnUser = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      userLocationRef.current = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        600
      );
    } catch (e) {
      console.warn('Could not get location', e);
    }
  }, []);

  // On first load: ask for permission, then center on the user if allowed.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermissionGranted(granted);
      if (granted) centerOnUser();
    })();
  }, [centerOnUser]);

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.backgroundElement, color: theme.text },
  ];

  return (
    <ThemedView style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={permissionGranted === true}
        showsCompass
        onUserLocationChange={(e) => {
          // Keep the position fresh as the user moves (only fires with showsUserLocation).
          const coordinate = e.nativeEvent?.coordinate;
          if (coordinate) userLocationRef.current = coordinate;
        }}
        onRegionChangeComplete={(region) => {
          // Fires once a pan, zoom or animateToRegion ends: load pins for the new area.
          centerRef.current = { latitude: region.latitude, longitude: region.longitude };
          // Centered = the user is within 5% of the visible span from the middle.
          const user = userLocationRef.current;
          setCenteredOnUser(
            user !== null &&
              Math.abs(user.latitude - region.latitude) < region.latitudeDelta * 0.05 &&
              Math.abs(user.longitude - region.longitude) < region.longitudeDelta * 0.05
          );
          loadIncidents();
        }}
        onPress={(e) => {
          // On iOS a marker tap also reaches the map; only a tap on empty map closes the card.
          if (e.nativeEvent?.action === 'marker-press') return;
          selectIncident(null);
        }}
        onLongPress={(e) => {
          // Copy the coordinate out of the event right away: React Native clears "e"
          // after this handler returns, so it can't be read later.
          const coordinate = e.nativeEvent?.coordinate;
          if (!coordinate) return;
          setPendingCoordinate(coordinate); // opens the form
        }}>
        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            coordinate={{ latitude: incident.lat, longitude: incident.lng }}
            pinColor={incident.type === 'fire' ? 'orange' : 'blue'}
            opacity={incident.status === 'inactive' ? 0.45 : 1}
            onPress={() => selectIncident(incident)}
          />
        ))}
      </MapView>

      <View style={styles.topLeft}>
        <Pressable
          onPress={() => setFiltersOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="Filter incidents"
          accessibilityState={{ expanded: filtersOpen }}
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold">
            Filters{filterCount > 0 ? ` (${filterCount})` : ''} {filtersOpen ? '▴' : '▾'}
          </ThemedText>
        </Pressable>

        {filtersOpen && (
          <ThemedView type="backgroundElement" style={styles.filterPanel}>
            <IncidentFilterRows filters={filters} onChange={setFilters} />
            <View style={styles.filterActions}>
              <Pressable
                onPress={() => setFilters(DEFAULT_FILTERS)}
                disabled={filterCount === 0}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundSelected },
                  filterCount === 0 && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">Reset</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setFiltersOpen(false)}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.text },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Done
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        )}
      </View>

      <ThemedView style={[styles.banners, filtersOpen && styles.hidden]}>
        {permissionGranted === false && (
          <ThemedView type="backgroundElement" style={styles.banner}>
            <ThemedText type="small">
              Location access is off. Enable it in Settings to see where you are.
            </ThemedText>
          </ThemedView>
        )}
        {loadError && (
          <ThemedView type="backgroundElement" style={styles.banner}>
            <ThemedText type="small" style={styles.error}>
              Couldn&apos;t load incidents: {loadError}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      {selectedIncident && (
        <ThemedView type="backgroundElement" style={[styles.incidentCard, aboveTabBar]}>
          <ThemedView type="backgroundElement" style={styles.incidentHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {selectedIncident.type === 'fire' ? 'Fire' : 'Crime'}
            </ThemedText>
            <Pressable
              onPress={() => selectIncident(null)}
              hitSlop={12}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Close
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedText type="smallBold" style={styles.incidentTitle}>
            {selectedIncident.title || 'Untitled incident'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Reported {formatReportedTime(selectedIncident.createdAt)}
          </ThemedText>
          {selectedIncident.locationText ? (
            <ThemedText type="small" themeColor="textSecondary">
              {selectedIncident.locationPrecision === 'exact' ? '' : 'Near '}
              {selectedIncident.locationText}
            </ThemedText>
          ) : (
            selectedAddress && (
              <ThemedText type="small" themeColor="textSecondary">
                {selectedAddress}
              </ThemedText>
            )
          )}
          {selectedIncident.description && (
            <ThemedText type="small" themeColor="textSecondary">
              {displayDescription(selectedIncident)}
            </ThemedText>
          )}
          {selectedIncident.confirms !== undefined && (
            <ThemedText type="small" themeColor="textSecondary">
              {selectedIncident.confirms} still there · {selectedIncident.denies ?? 0} not there
            </ThemedText>
          )}

          {voteError && (
            <ThemedText type="small" style={styles.error}>
              {voteError}
            </ThemedText>
          )}

          {selectedIncident.status === 'inactive' ? (
            <ThemedText type="smallBold" themeColor="textSecondary">
              Resolved: reported as no longer there.
            </ThemedText>
          ) : (
            <ThemedView type="backgroundElement" style={styles.voteRow}>
              <Pressable
                onPress={() => vote(selectedIncident, false)}
                disabled={voting}
                style={({ pressed }) => [
                  styles.voteButton,
                  { backgroundColor: theme.backgroundSelected },
                  voting && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">Not there</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => vote(selectedIncident, true)}
                disabled={voting}
                style={({ pressed }) => [
                  styles.voteButton,
                  { backgroundColor: theme.text },
                  voting && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                {voting ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: theme.background }}>
                    Still there
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          )}
        </ThemedView>
      )}

      <ThemedView style={[styles.controls, aboveTabBar, selectedIncident && styles.hidden]}>
        {permissionGranted && (
          <Pressable
            onPress={centerOnUser}
            accessibilityRole="button"
            accessibilityLabel="My location"
            style={({ pressed }) => [
              styles.locationButton,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            {/* The navigation arrow, as in Apple Maps: filled while centered on the user.
                Android's icon set has no filled variant, so it turns blue there instead. */}
            <SymbolView
              name={{
                ios: centeredOnUser ? 'location.fill' : 'location',
                android: 'near_me',
                web: 'near_me',
              }}
              tintColor={centeredOnUser && Platform.OS !== 'ios' ? '#007AFF' : theme.text}
              size={22}
            />
          </Pressable>
        )}
      </ThemedView>

      {/* Incident form: a dimmed backdrop with a card in the center of the screen.
          onRequestClose handles the Android back button. */}
      <Modal
        visible={pendingCoordinate !== null}
        transparent
        animationType="fade"
        onRequestClose={closeForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.backdrop}>
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Report an incident</ThemedText>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold">Type</ThemedText>
              <ThemedView style={styles.typeRow}>
                {INCIDENT_TYPES.map((option) => {
                  const selected = type === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setType(option.value)}
                      style={[
                        styles.typeButton,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: selected ? theme.text : 'transparent',
                        },
                      ]}>
                      <ThemedText type="smallBold">{option.label}</ThemedText>
                    </Pressable>
                  );
                })}
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold">Title</ThemedText>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What happened?"
                placeholderTextColor={theme.textSecondary}
                maxLength={100}
                style={inputStyle}
              />
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold">Description (optional)</ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Add any details"
                placeholderTextColor={theme.textSecondary}
                maxLength={500}
                multiline
                textAlignVertical="top"
                style={[inputStyle, styles.multiline]}
              />
            </ThemedView>

            {submitError && (
              <ThemedText type="small" style={styles.error}>
                {submitError}
              </ThemedText>
            )}

            <ThemedView style={styles.actions}>
              <Pressable
                onPress={closeForm}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundElement },
                  submitting && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={submitIncident}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.text },
                  !canSubmit && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                {submitting ? (
                  // The first request after the database idles can take ~15s.
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: theme.background }}>
                    Add to map
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topLeft: {
    position: 'absolute',
    top: Spacing.six,
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'flex-start',
    gap: Spacing.two,
    zIndex: 1, // the open panel sits above the banners and pin card
    pointerEvents: 'box-none', // only the button and panel take touches
  },
  filterButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  filterPanel: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  banners: {
    position: 'absolute',
    // Below the Filters button.
    top: Spacing.six + Spacing.six,
    left: Spacing.three,
    right: Spacing.three,
    gap: Spacing.two,
    backgroundColor: 'transparent',
    pointerEvents: 'none', // let map gestures pass through
  },
  banner: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  controls: {
    position: 'absolute',
    right: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-end',
    backgroundColor: 'transparent',
  },
  hidden: {
    display: 'none',
  },
  incidentCard: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incidentTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  voteRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  voteButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  error: {
    color: '#d33',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center', // centers the card vertically
    padding: Spacing.three,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  typeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    fontSize: 16,
  },
  multiline: {
    minHeight: 96,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});