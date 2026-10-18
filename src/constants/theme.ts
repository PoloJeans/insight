/**
 * Insight design tokens. A restrained black / white / slate palette with a single
 * authoritative blue accent; red is reserved for fire and emergencies.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0F14',
    background: '#F4F5F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6E9EE',
    textSecondary: '#5B6573',
    border: '#DDE1E7',
    accent: '#1D4ED8',
    onAccent: '#FFFFFF',
    danger: '#D92D20',
  },
  dark: {
    text: '#F2F4F7',
    background: '#07090C',
    backgroundElement: '#12161C',
    backgroundSelected: '#1C222B',
    textSecondary: '#8B95A3',
    border: '#232A34',
    accent: '#3B82F6',
    onAccent: '#FFFFFF',
    danger: '#F04438',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
