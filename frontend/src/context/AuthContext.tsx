import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Api, ApiError, TokenStorage } from '@/api/api';
import { t } from '@/i18n/i18n';
import type { User } from '@/types/api.types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (tokens: { access_token: string; refresh_token: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const devLog = (msg: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) console.log('%c[Auth]', 'color:#4caf50;font-weight:bold', msg, ...args);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const me = await Api.me();
      setUser(me);
      devLog('user loaded', me.email);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        TokenStorage.clear();
        devLog('token invalid (401) — cleared');
      } else {
        devLog('refreshUser failed (network/server error) — keeping current session');
      }
    }
  }, []);

  useEffect(() => {
    if (TokenStorage.getAccess()) {
      devLog('token found — loading user…');
      refreshUser().finally(() => setLoading(false));
    } else {
      devLog('no token — guest');
      setLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    const handler = () => {
      devLog('session expired event received');
      setUser(null);
      setSessionExpired(true);
    };
    window.addEventListener('auth:session-expired', handler);
    return () => window.removeEventListener('auth:session-expired', handler);
  }, []);

  const login = async (tokens: { access_token: string; refresh_token: string }) => {
    TokenStorage.save(tokens);
    await refreshUser();
    devLog('logged in');
  };

  const logout = () => {
    TokenStorage.clear();
    setUser(null);
    devLog('logged out');
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
      {sessionExpired && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: '36px 40px',
            maxWidth: 360, width: '90%', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>
              {t('auth.session_expired_title')}
            </h2>
            <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14 }}>
              {t('auth.session_expired_desc')}
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => { setSessionExpired(false); window.location.href = '/'; }}
            >
              {t('auth.session_expired_btn')}
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
