import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Fallback view (downtown Toronto) until the phone's location is available
const DEFAULT_REGION: Region = {
  latitude: 43.6532,
  longitude: -79.3832,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [pins, setPins] = useState<LatLng[]>([]);

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

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermissionGranted(granted);
      if (granted) centerOnUser();
    })();
  }, [centerOnUser]);

  return (
    <ThemedView style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={permissionGranted === true}
        showsCompass
        onLongPress={(e) => {
          // Read the coordinate now: the event is released after this handler returns,
          // so it can't be accessed inside the setState updater.
          const coordinate = e.nativeEvent?.coordinate;
          if (!coordinate) return;
          setPins((prev) => [...prev, coordinate]);
        }}>
        {pins.map((coordinate, i) => (
          <Marker
            key={`${coordinate.latitude}-${coordinate.longitude}-${i}`}
            coordinate={coordinate}
            title={`Pin ${i + 1}`}
            description={`${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`}
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
        {pins.length > 0 && (
          <Pressable
            onPress={() => setPins([])}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">Clear pins</ThemedText>
          </Pressable>
        )}
      </ThemedView>
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
});