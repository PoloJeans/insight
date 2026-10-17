import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
 
// react-native-maps is native-only, so the web build shows a placeholder.
export default function MapScreen() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText themeColor="textSecondary">The map is available on iOS and Android.</ThemedText>
    </ThemedView>
  );
}
 