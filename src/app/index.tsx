import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STEPS: { icon: SymbolViewProps['name']; title: string; body: string }[] = [
  {
    icon: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
    title: 'Report',
    body: 'Long-press the map where a fire or crime is happening.',
  },
  {
    icon: { ios: 'checkmark.seal', android: 'verified', web: 'verified' },
    title: 'Verify',
    body: 'Confirm an incident is still active, or mark it cleared.',
  },
  {
    icon: { ios: 'eye', android: 'visibility', web: 'visibility' },
    title: 'Stay aware',
    body: 'See active incidents around you before you head out.',
  },
];

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.brandRow}>
            <ThemedView style={[styles.brandMark, { backgroundColor: theme.accent }]}>
              <SymbolView
                name={{ ios: 'shield.lefthalf.filled', android: 'shield', web: 'shield' }}
                size={18}
                tintColor={theme.onAccent}
              />
            </ThemedView>
            <ThemedText type="label">Insight</ThemedText>
          </ThemedView>

          <ThemedView style={styles.hero}>
            <ThemedText type="title">Know what&apos;s happening around you.</ThemedText>
            <ThemedText themeColor="textSecondary">
              Real-time reports of fires and crime from people in your area, verified by the
              community.
            </ThemedText>
          </ThemedView>

          <Button
            label="Open live map"
            icon={{ ios: 'map.fill', android: 'map', web: 'map' }}
            onPress={() => router.navigate('/map')}
          />

          <ThemedView
            type="backgroundElement"
            style={[styles.card, styles.emergency, { borderColor: theme.danger }]}>
            <ThemedView type="backgroundElement" style={styles.cardHeader}>
              <SymbolView
                name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
                size={18}
                tintColor={theme.danger}
              />
              <ThemedText type="smallBold" themeColor="danger">
                Emergency?
              </ThemedText>
            </ThemedView>
            <ThemedText type="small" themeColor="textSecondary">
              Insight is not an emergency service. If anyone is in danger, call 911 first.
            </ThemedText>
            <Button
              label="Call 911"
              variant="danger"
              icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
              onPress={() => Linking.openURL('tel:911')}
            />
          </ThemedView>

          <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
            How it works
          </ThemedText>
          <ThemedView
            type="backgroundElement"
            style={[styles.card, styles.steps, { borderColor: theme.border }]}>
            {STEPS.map((step, i) => (
              <ThemedView
                key={step.title}
                type="backgroundElement"
                style={[
                  styles.step,
                  i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                ]}>
                <ThemedView type="backgroundSelected" style={styles.stepIcon}>
                  <SymbolView name={step.icon} size={18} tintColor={theme.accent} />
                </ThemedView>
                <ThemedView type="backgroundElement" style={styles.stepText}>
                  <ThemedText type="smallBold">{step.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {step.body}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
            ))}
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emergency: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionLabel: {
    marginBottom: -Spacing.two,
  },
  steps: {
    overflow: 'hidden',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: Spacing.half,
  },
});
