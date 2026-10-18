import type { Incident } from '@/api/incidents';

// The fire importer writes e.g. "Reported to Toronto Fire · alarm level 3".
const ALARM_LEVEL = /alarm level (\d+)/i;

/** An incident's description for display: Toronto Fire alarm levels become one 🔥 per level. */
export function displayDescription(incident: Pick<Incident, 'description' | 'source'>): string | null {
  if (!incident.description || incident.source !== 'tfs') return incident.description;
  return incident.description.replace(ALARM_LEVEL, (_, level: string) =>
    '🔥'.repeat(Math.min(Number(level), 10))
  );
}
