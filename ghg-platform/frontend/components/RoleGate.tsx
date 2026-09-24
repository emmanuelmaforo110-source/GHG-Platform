'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/lib/types';

/**
 * Client-side mirror of the backend's RolesGuard (Section 4 of the architecture doc).
 * This is a UX convenience only — it hides controls a role can't use so the UI doesn't dangle
 * dead ends in front of people. It is NOT the security boundary; the backend enforces RBAC
 * independently on every request regardless of what this component renders or hides.
 */
export function RoleGate({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...allow)) return null;
  return <>{children}</>;
}
