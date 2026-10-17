import { getUserId } from '@/api/user-id';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  options: { query?: Record<string, string | number>; body?: unknown } = {},
): Promise<T> {
  if (!BASE_URL) throw new Error('EXPO_PUBLIC_API_URL is not set');

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-user-id': await getUserId(),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `request failed (${response.status})`);
  }
  return data as T;
}
