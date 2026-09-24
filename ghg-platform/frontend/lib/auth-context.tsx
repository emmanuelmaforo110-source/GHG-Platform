'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, clearToken, getToken } from './api';
import { AuthUser, LoginResponse, UserRole } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The backend doesn't expose a "who am I" endpoint yet (flagged in the architecture doc's open
// items); as a pragmatic MVP stand-in, decode the JWT payload client-side to restore the session
// on page refresh. This is fine because it's the same payload the backend already trusts and
// verifies server-side on every request — the frontend copy is read-only, never a trust boundary.
function decodeJwt(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      email: payload.email,
      fullName: payload.fullName ?? payload.email,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (token) setUser(decodeJwt(token));
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<LoginResponse>('/auth/login', { email: email.trim().toLowerCase(), password });
    setToken(res.accessToken);
    setUser(res.user);
    router.push('/dashboard');
  }

  function logout() {
    clearToken();
    setUser(null);
    router.push('/login');
  }

  function hasRole(...roles: UserRole[]) {
    return !!user && roles.includes(user.role);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
