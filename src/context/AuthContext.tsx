import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, type AuthUser } from '../api/auth';
import { getToken } from '../api/client';
import { fetchAuthMode, onFragmentToken, PASSWORD_MODE, toAuthMode, type AuthMode } from '../api/signIn';

interface AuthState {
  user: AuthUser | null;
  /** True until the sign-in mode is known and a stored session (if any) was checked. */
  loading: boolean;
  error: string | null;
  /** Password form or the host application's sign-in (`GET /api/v1/qcli/auth/mode`). */
  authMode: AuthMode;
  login: (username: string, password: string) => Promise<void>;
  /**
   * Checks again whether the user is signed in (external mode "Retry": the host may have
   * signed the user in, or handed a new token over). Resolves to true when signed in.
   */
  retry: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Restores the session: with a stored token (password sign-in or the host's `#token=` handoff),
 * or in external mode where the host's own session (e.g. a cookie) may authenticate requests.
 */
async function restoreUser(mode: AuthMode): Promise<AuthUser | null> {
  if (!getToken() && mode.mode !== 'external') return null;
  try {
    return await getMe({ quiet: true });
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(PASSWORD_MODE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mode = await fetchAuthMode();
      if (cancelled) return;
      setAuthMode(mode);
      const restored = await restoreUser(mode);
      if (cancelled) return;
      setUser(restored);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const res = await apiLogin(username, password);
      setUser({ username: res.username, authenticatedAt: new Date().toISOString() });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Login failed';
      // The server switched to external sign-in (501 EXTERNAL_AUTH): show the host's sign-in.
      const external = parseExternalAuthError(message);
      if (external) setAuthMode(external);
      setError(message);
      throw e;
    }
  }, []);

  const retry = useCallback(async () => {
    const mode = await fetchAuthMode();
    setAuthMode(mode);
    const restored = await restoreUser(mode);
    setUser(restored);
    return restored !== null;
  }, []);

  // A `#token=` handoff into the open page (main.tsx takes the one present at load): sign in with it
  useEffect(() => onFragmentToken(() => void retry()), [retry]);

  const logout = useCallback(() => {
    setUser(null);
    apiLogout();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, authMode, login, retry, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function parseExternalAuthError(message: string): AuthMode | null {
  try {
    const body = JSON.parse(message) as { code?: unknown; signInUrl?: unknown };
    if (body?.code !== 'EXTERNAL_AUTH') return null;
    return toAuthMode({ mode: 'external', signInUrl: body.signInUrl });
  } catch {
    return null;
  }
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
