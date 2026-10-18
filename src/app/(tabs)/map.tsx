/**
 * Map tab: an interactive map that shows the user's location and the active incidents
 * near the map's center, refreshed every 30 seconds. Long-pressing the map opens a form
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
} from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';

import { ApiError } from '@/api/client';
import {
  createIncident,
  listIncidents,
  type Incident,
  type IncidentType,
} from '@/api/incidents';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

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

const POLL_INTERVAL_MS = 30_000;
// The API's maximum search radius. It also returns at most 200 incidents, nearest first.
const SEARCH_RADIUS_M = 25_000;

export default function MapScreen() {
  const theme = useTheme();
  const { signOut, markSignedOut } = useSession();
  const mapRef = useRef<MapView>(null);

  // null = still asking, true = allowed, false = denied.
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  // Active incidents near the map's center, replaced on every successful fetch.
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A ref, not state: moving the map shouldn't re-render, only change where we fetch.
  const centerRef = useRef<LatLng>(DEFAULT_REGION);
  // Lets a slow response be dropped if a newer request was started after it.
  const latestRequestRef = useRef(0);

  const loadIncidents = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    const { latitude, longitude } = centerRef.current;
    try {
      const nearby = await listIncidents({
        lat: latitude,
        lng: longitude,
        radiusM: SEARCH_RADIUS_M,
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
  }, [markSignedOut]);

  // Fetch now and every 30s while the Map tab is focused; stop when leaving it.
  useFocusEffect(
    useCallback(() => {
      loadIncidents();
      const timer = setInterval(loadIncidents, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [loadIncidents])
  );

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
        onRegionChangeComplete={(region) => {
          // Fires once a pan, zoom or animateToRegion ends: load pins for the new area.
          centerRef.current = { latitude: region.latitude, longitude: region.longitude };
          loadIncidents();
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
            title={incident.title}
            description={incident.description || undefined}
            pinColor={incident.type === 'fire' ? 'orange' : 'blue'}
          />
        ))}
      </MapView>

      <ThemedView style={styles.banners}>
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

      <ThemedView style={styles.controls}>
        {permissionGranted && (
          <Pressable
            onPress={centerOnUser}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">My location</ThemedText>
          </Pressable>
        )}
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold">Sign out</ThemedText>
        </Pressable>
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
  banners: {
    position: 'absolute',
    top: Spacing.six,
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
    bottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-end',
    backgroundColor: 'transparent',
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
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