import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const navigationTheme = (dark: boolean) => {
  const base = dark ? DarkTheme : DefaultTheme;
  const colors = Colors[dark ? 'dark' : 'light'];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.backgroundElement,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={navigationTheme(colorScheme === 'dark')}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
