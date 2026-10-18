/**
 * Map tab: an interactive map that shows the user's location. Long-pressing the map
 * opens a form to report an incident (title, description, type); saving it adds a
 * pin. Incidents live in memory only for now (no database yet).
 */

import * as Location from 'expo-location'; // phone GPS + permission pop-up
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Mirrors the incidents table: type can only be 'crime' or 'fire'.
type IncidentType = 'crime' | 'fire';

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: 'crime', label: 'Crime' },
  { value: 'fire', label: 'Fire' },
];

// One reported incident. Field names match the table columns where they exist;
// the database will supply the real id, status and created_at later.
type Incident = {
  id: string;
  coordinate: LatLng;
  title: string;
  description: string;
  type: IncidentType;
};

// Where the map starts (downtown Toronto) before we know where the user is.
const DEFAULT_REGION: Region = {
  latitude: 43.6532,
  longitude: -79.3832,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  // null = still asking, true = allowed, false = denied.
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  // Incidents shown on the map. In memory only, so they're lost when the app closes.
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // Where the user long-pressed. While this is set, the form is open.
  const [pendingCoordinate, setPendingCoordinate] = useState<LatLng | null>(null);

  // Form fields.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<IncidentType | null>(null);

  // Title and type are required (they're NOT NULL in the table); description is optional.
  const canSubmit = title.trim().length > 0 && type !== null;

  const closeForm = () => {
    setPendingCoordinate(null);
    setTitle('');
    setDescription('');
    setType(null);
  };

  const submitIncident = () => {
    if (!pendingCoordinate || !canSubmit || type === null) return;
    setIncidents((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        coordinate: pendingCoordinate,
        title: title.trim(),
        description: description.trim(),
        type,
      },
    ]);
    closeForm();
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
            coordinate={incident.coordinate}
            title={incident.title}
            description={incident.description || undefined}
            pinColor={incident.type === 'fire' ? 'orange' : 'blue'}
          />
        ))}
      </MapView>

      {permissionGranted === false && (
        <ThemedView type="backgroundElement" style={styles.banner}>
          <ThemedText type="small">
            Location access is off. Enable it in Settings to see where you are.
          </ThemedText>
        </ThemedView>
      )}

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
        {incidents.length > 0 && (
          <Pressable
            onPress={() => setIncidents([])}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Clear pins</ThemedText>
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

            <ThemedView style={styles.actions}>
              <Pressable
                onPress={closeForm}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundElement },
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
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Add to map
                </ThemedText>
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
  banner: {
    position: 'absolute',
    top: Spacing.six,
    left: Spacing.three,
    right: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
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
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center', // centers the card vertically
    padding: Spacing.three,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
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
    paddingVertical: Spacing.three,
    borderRadius: 12,
    borderWidth: 2,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: 12,
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