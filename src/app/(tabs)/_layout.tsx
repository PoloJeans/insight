import AppTabs from '@/components/app-tabs';

// Open on the Map tab (the index route) even though it's not the first trigger.
export const unstable_settings = { anchor: 'index' };

export default function TabLayout() {
  return <AppTabs />;
}
