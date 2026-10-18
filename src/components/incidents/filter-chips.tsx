import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ChipOption<T> {
  value: T;
  label: string;
}

/** One labelled, horizontally scrolling row of single-select chips. */
export function FilterChips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: selected ? theme.text : theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  label: {
    width: 84,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
    borderRadius: Spacing.five,
  },
  pressed: {
    opacity: 0.7,
  },
});
