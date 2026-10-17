import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'insight.user-id';

let cached: string | null = null;

// Placeholder identity until Cognito: a random UUID generated once per install.
export async function getUserId(): Promise<string> {
  if (cached) return cached;

  const read = () =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.getItem(KEY) ?? null)
      : SecureStore.getItemAsync(KEY);
  const write = async (value: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  };

  let id = await read();
  if (!id) {
    id = Crypto.randomUUID();
    await write(id);
  }
  cached = id;
  return id;
}
