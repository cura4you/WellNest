import { useCallback, useEffect, useMemo, useState } from 'react';
import { loginUser, registerUser, validateStoredAuthSession, secureAccountAction, demoAction } from '../services/authApi';
import { AuthContext } from './authContextObject';

const STORAGE_KEY = 'medivault.auth';

function readStoredSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed?.token && parsed?.user?.role) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  // Starts true so ProtectedRoute can wait for this mount effect to read
  // localStorage before deciding isAuthenticated — otherwise the very first
  // render (user/token still null) reads as logged-out and redirects to
  // login on every hard page load/refresh, even with a valid stored session.
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const session = readStoredSession();
    if (!session || !validateStoredAuthSession(session)) {
      localStorage.removeItem(STORAGE_KEY);
      setInitializing(false);
      return;
    }
    setUser(session.user);
    setToken(session.token);
    setInitializing(false);
  }, []);

  const persistSession = useCallback((sessionUser, sessionToken) => {
    const payload = {
      token: sessionToken,
      user: sessionUser,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setToken('');
  }, []);

  const login = useCallback(async (credentials) => {
    setLoading(true);
    setError('');
    try {
      const result = await loginUser(credentials);
      setUser(result.user);
      setToken(result.token);
      persistSession(result.user, result.token);
      sessionStorage.removeItem('medivault.pre-demo-auth');
      return result.user;
    } catch (err) {
      const nextError = err.message || 'Login failed.';
      setError(nextError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [persistSession]);

  const register = useCallback(async ({ role, data }) => {
    setLoading(true);
    setError('');
    try {
      const result = await registerUser({ role, data });
      if (result.token && result.user) {
        setUser(result.user);
        setToken(result.token);
        persistSession(result.user, result.token);
      sessionStorage.removeItem('medivault.pre-demo-auth');
      }
      return result;
    } catch (err) {
      const nextError = err.message || 'Registration failed.';
      setError(nextError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [persistSession]);

  const acceptSession = useCallback((session) => {
    setUser(session.user); setToken(session.token); persistSession(session.user, session.token);
    return session.user;
  }, [persistSession]);

  const enterDemo = useCallback(async (role) => {
    setLoading(true); setError('');
    try {
      let session;
      if (user?.isGuest && token) {
        try { session = await demoAction('switch', { role }, token); }
        catch (err) { if (![401,409].includes(err.status)) throw err; }
      }
      if (!session) session = await demoAction('start', { role });
      if (user && token && !user.isGuest) sessionStorage.setItem('medivault.pre-demo-auth', JSON.stringify({ user, token }));
      return acceptSession(session);
    } catch (err) { setError(err.message); throw err; } finally { setLoading(false); }
  }, [user, token, acceptSession]);

  const resetDemo = useCallback(async () => {
    setLoading(true);setError('');
    try { return acceptSession(await demoAction('reset', {}, token)); }
    catch (err) { setError(err.message);throw err; } finally { setLoading(false); }
  }, [token, acceptSession]);

  const exitDemo = useCallback(async () => {
    setLoading(true);setError('');
    try {
      try { await demoAction('end', {}, token); } catch (err) { if (err.status !== 401) throw err; }
      let previous;
      try { previous=JSON.parse(sessionStorage.getItem('medivault.pre-demo-auth')||'null'); } catch { /* No prior ordinary session. */ }
      sessionStorage.removeItem('medivault.pre-demo-auth');
      if (previous?.token && previous?.user && !previous.user.isGuest) acceptSession(previous); else clearSession();
      return true;
    } catch (err) { setError(err.message);throw err; } finally { setLoading(false); }
  }, [token, acceptSession, clearSession]);

  const logout = useCallback(async () => {
    setLogoutError('');
    try {
      if (user?.isGuest) return await exitDemo();
      await secureAccountAction('logout', token);
      clearSession();
      return true;
    } catch (err) {
      if (err.status === 401) { clearSession(); return true; }
      setLogoutError('Unable to sign out on the server. Check your connection and try again.');
      return false;
    }
  }, [clearSession, token, user, exitDemo]);

  const updateSessionProfile = useCallback((profile) => {
    if (!user) return;
    const nextUser = { ...user, profile: { ...user.profile, ...profile } };
    setUser(nextUser);
    persistSession(nextUser, token);
  }, [user, token, persistSession]);

  const clearError = useCallback(() => setError(''), []);

  const value = useMemo(
    () => ({
      user,
      token,
      role: user?.role || '',
      isAuthenticated: Boolean(user && token),
      initializing,
      loading,
      error,
      login,
      register,
      logout,
      clearError,
      clearLocalSession: clearSession,
      enterDemo, resetDemo, exitDemo,
      updateSessionProfile,
    }),
    [user, token, initializing, loading, error, login, register, logout, clearError, clearSession, updateSessionProfile, enterDemo, resetDemo, exitDemo]
  );

  return <AuthContext.Provider value={value}>{logoutError && <div className="auth-session-error" role="alert">{logoutError}<button type="button" onClick={() => setLogoutError('')}>Dismiss</button></div>}{children}</AuthContext.Provider>;
}
