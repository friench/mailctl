import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api, ApiError } from './api';

export interface User {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const u = await api.get<User>('/admin/auth/me');
      setUser(u);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        // network error: keep current state
        // eslint-disable-next-line no-console
        console.warn('Failed to load /admin/auth/me', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<User>('/admin/auth/login', { email, password });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/admin/auth/logout');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
