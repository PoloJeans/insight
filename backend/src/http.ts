import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (status: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const handle =
  (fn: Handler): Handler =>
  async (event) => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error(err);
      return json(500, { error: 'internal error' });
    }
  };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// Placeholder identity until Cognito is added: the app sends a stable per-install UUID.
export const userId = (event: APIGatewayProxyEventV2): string => {
  const id = event.headers['x-user-id'];
  if (!isUuid(id)) throw new HttpError(401, 'missing or invalid x-user-id');
  return id;
};

export const body = (event: APIGatewayProxyEventV2): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(event.body ?? '');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  throw new HttpError(400, 'invalid JSON body');
};

export const coords = (lat: unknown, lng: unknown): { lat: number; lng: number } => {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !(lat >= -90 && lat <= 90) ||
    !(lng >= -180 && lng <= 180)
  ) {
    throw new HttpError(400, 'lat/lng out of range');
  }
  return { lat, lng };
};
