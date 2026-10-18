import { deleteItem, getItem, setItem } from '@/api/storage';

const REGION = process.env.EXPO_PUBLIC_COGNITO_REGION ?? 'us-east-2';
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;
const ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;
const SESSION_KEY = 'insight.session';
// Refresh a little early so a token never expires mid-request.
const REFRESH_MARGIN_MS = 60_000;

/** `code` is Cognito's error type, e.g. UsernameExistsException, NotAuthorizedException, CodeMismatchException. */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthenticationResult {
  AccessToken: string;
  RefreshToken?: string;
  ExpiresIn: number;
}

async function cognito<T>(target: string, body: Record<string, unknown>): Promise<T> {
  if (!CLIENT_ID) throw new Error('EXPO_PUBLIC_COGNITO_CLIENT_ID is not set');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify({ ClientId: CLIENT_ID, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthError(
      String(data.__type ?? 'UnknownError').split('#').pop()!,
      data.message ?? `auth request failed (${response.status})`,
    );
  }
  return data as T;
}

async function saveSession(result: AuthenticationResult, fallbackRefreshToken?: string): Promise<Session> {
  const session: Session = {
    accessToken: result.AccessToken,
    // Refreshing returns no new refresh token; keep the one we have.
    refreshToken: result.RefreshToken ?? fallbackRefreshToken ?? '',
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  };
  await setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

async function loadSession(): Promise<Session | null> {
  const raw = await getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** Creates the account and emails a verification code. Follow with confirmSignUp. */
export async function signUp(email: string, password: string): Promise<void> {
  await cognito('SignUp', {
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await cognito('ConfirmSignUp', { Username: email, ConfirmationCode: code });
}

export async function resendConfirmationCode(email: string): Promise<void> {
  await cognito('ResendConfirmationCode', { Username: email });
}

/** Throws AuthError (e.g. UserNotConfirmedException if the email isn't verified yet). */
export async function signIn(email: string, password: string): Promise<void> {
  const { AuthenticationResult } = await cognito<{ AuthenticationResult?: AuthenticationResult }>(
    'InitiateAuth',
    { AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: email, PASSWORD: password } },
  );
  if (!AuthenticationResult) throw new AuthError('ChallengeRequired', 'additional sign-in step required');
  await saveSession(AuthenticationResult);
}

export async function signOut(): Promise<void> {
  const session = await loadSession();
  await deleteItem(SESSION_KEY);
  if (session?.refreshToken) {
    // Best effort: the local session is already gone.
    await cognito('RevokeToken', { Token: session.refreshToken }).catch(() => {});
  }
}

export async function isSignedIn(): Promise<boolean> {
  return (await loadSession()) !== null;
}

/** A valid access token for the API, refreshed if needed, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const session = await loadSession();
  if (!session) return null;
  if (session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session.accessToken;

  try {
    const { AuthenticationResult } = await cognito<{ AuthenticationResult: AuthenticationResult }>(
      'InitiateAuth',
      { AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: session.refreshToken } },
    );
    return (await saveSession(AuthenticationResult, session.refreshToken)).accessToken;
  } catch (err) {
    // An expired or revoked refresh token means the user has to sign in again.
    if (err instanceof AuthError && err.code === 'NotAuthorizedException') await deleteItem(SESSION_KEY);
    return null;
  }
}
