import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  icon?: SymbolViewProps['name'];
};

export function Button({ label, variant = 'primary', icon, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();

  const background = {
    primary: theme.accent,
    secondary: theme.backgroundElement,
    danger: theme.danger,
  }[variant];
  const foreground = variant === 'secondary' ? theme.text : theme.onAccent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background },
        variant === 'secondary' && { borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      {...rest}>
      {icon && <SymbolView name={icon} size={18} tintColor={foreground} />}
      <ThemedText type="smallBold" style={{ color: foreground }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
});
