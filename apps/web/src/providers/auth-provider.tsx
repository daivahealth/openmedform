'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import api from '@/lib/api';

interface User {
  id: string;
  email: string;
  /** API returns `fullName`; `name` kept for backwards compatibility. */
  name?: string;
  fullName?: string;
  role?: string;
  tenantId?: string;
  tenantName?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('auth_user');
      }
    }
    setIsLoading(false);
  }, []);

  // Google SSO entry point: the API has already issued a JWT; persist it and
  // hydrate the user profile from /auth/me.
  const loginWithToken = useCallback(async (accessToken: string) => {
    localStorage.setItem('auth_token', accessToken);
    const response = await api.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = response.data;
    localStorage.setItem('auth_user', JSON.stringify(userData));
    setToken(accessToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, loginWithToken, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
