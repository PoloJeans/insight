import { request } from '@/api/client';

/** Registers this device's push token and last-known location for proximity alerts. */
export async function registerDevice(input: {
  pushToken: string;
  lat: number;
  lng: number;
}): Promise<void> {
  await request('PUT', '/devices', { body: input });
}
