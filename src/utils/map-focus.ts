// Hands an incident from another tab to the Map tab: "show this one". The whole incident
// is passed (not just an id) so the map can show it even if its filters would hide it.

import { router } from 'expo-router';

import type { Incident } from '@/api/incidents';

type Listener = (incident: Incident) => void;

const listeners = new Set<Listener>();
let pending: Incident | null = null;

/** Switches to the Map tab, centered on `incident` with its popup open. */
export function showOnMap(incident: Incident) {
  router.navigate('/');
  if (listeners.size === 0) {
    pending = incident; // the map isn't mounted yet; it picks this up when it subscribes
    return;
  }
  listeners.forEach((listener) => listener(incident));
}

/** For the Map tab. Returns an unsubscribe function. */
export function subscribeToMapFocus(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const incident = pending;
    pending = null;
    // Deliver after the subscribing effect returns, not during it.
    queueMicrotask(() => listener(incident));
  }
  return () => {
    listeners.delete(listener);
  };
}
