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

// Decodes the JWT payload client-side so the UI can show the user instantly on page refresh.
// The session is then confirmed with GET /auth/me, which returns the user's current record from the
// database (so role changes and deactivations take effect without re-login). The decoded copy is
// read-only display data, never a trust boundary — the backend verifies the token on every request.
function decodeJwt(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      email: payload.email,
      fullName: payload.fullName ?? payload.email,
      restrictedFacilityId: payload.restrictedFacilityId ?? null,
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
    if (!token) {
      setLoading(false);
      return;
    }
    setUser(decodeJwt(token));
    // Confirm the session with the server; a 401 clears the token and redirects to /login (see api.ts).
    api
      .get<AuthUser>('/auth/me')
      .then((fresh) => setUser(fresh))
      .catch((err) => {
        // Only an auth failure ends the session; a network hiccup keeps the decoded user.
        if (err?.status === 401) setUser(null);
      })
      .finally(() => setLoading(false));
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
