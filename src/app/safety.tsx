import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const GUIDELINES: { icon: SymbolViewProps['name']; title: string; body: string }[] = [
  {
    icon: { ios: 'figure.walk.departure', android: 'directions_walk', web: 'directions_walk' },
    title: 'Keep your distance',
    body: 'Never approach a fire or a crime in progress to get a better look. Report from somewhere safe.',
  },
  {
    icon: { ios: 'text.alignleft', android: 'notes', web: 'notes' },
    title: 'Report what you saw',
    body: 'Stick to facts: what, where and when. Avoid guesses about who was involved.',
  },
  {
    icon: { ios: 'person.crop.circle.badge.xmark', android: 'person_off', web: 'person_off' },
    title: 'Protect privacy',
    body: "Don't include names, faces, licence plates or other personal details.",
  },
  {
    icon: { ios: 'checkmark.circle', android: 'task_alt', web: 'task_alt' },
    title: 'Keep the map accurate',
    body: 'If an incident is over, mark it cleared so others are not misled.',
  },
];

export default function SafetyScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.header}>
            <ThemedText type="label" themeColor="accent">
              Safety
            </ThemedText>
            <ThemedText type="title">Report responsibly.</ThemedText>
            <ThemedText themeColor="textSecondary">
              Insight works when reports are accurate and nobody puts themselves at risk.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.list}>
            {GUIDELINES.map((item) => (
              <ThemedView
                key={item.title}
                type="backgroundElement"
                style={[styles.card, { borderColor: theme.border }]}>
                <SymbolView name={item.icon} size={22} tintColor={theme.accent} />
                <ThemedView type="backgroundElement" style={styles.cardText}>
                  <ThemedText type="smallBold">{item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.body}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
            ))}
          </ThemedView>

          <ThemedView
            type="backgroundElement"
            style={[styles.card, styles.emergency, { borderColor: theme.danger }]}>
            <ThemedText type="smallBold" themeColor="danger">
              In an emergency, call 911
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Insight does not contact police or fire services. Reports here are not monitored by
              emergency responders.
            </ThemedText>
            <Button
              label="Call 911"
              variant="danger"
              icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
              onPress={() => Linking.openURL('tel:911')}
            />
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  emergency: {
    flexDirection: 'column',
    gap: Spacing.two,
    borderLeftWidth: 4,
  },
});
