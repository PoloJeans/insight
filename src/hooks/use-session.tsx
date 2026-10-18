import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as auth from '@/api/auth';

interface SessionContextValue {
  /** True until the stored session has been read on startup. */
  isLoading: boolean;
  signedIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** For when the API rejects our token (e.g. the refresh token expired). */
  markSignedOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    auth
      .isSignedIn()
      .then(setSignedIn)
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await auth.signIn(email, password);
    setSignedIn(true);
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setSignedIn(false);
  }, []);

  const markSignedOut = useCallback(() => {
    auth.signOut().finally(() => setSignedIn(false));
  }, []);

  const value = useMemo(
    () => ({ isLoading, signedIn, signIn, signOut, markSignedOut }),
    [isLoading, signedIn, signIn, signOut, markSignedOut]
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
