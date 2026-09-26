'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { RoleGate } from './RoleGate';

const navItem = (href: string, label: string, active: boolean) => (
  <Link
    key={href}
    href={href}
    className={`block rounded-md px-3 py-2 text-sm ${
      active ? 'bg-brand-light font-medium text-brand' : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    {label}
  </Link>
);

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex w-full shrink-0 print:hidden flex-col border-b border-gray-200 bg-white md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-medium text-white">
          G
        </div>
        <span className="text-sm font-medium">GHG platform</span>
      </div>

      <nav className="flex flex-1 gap-1 overflow-x-auto p-3 md:block md:space-y-1">
        {navItem('/dashboard', 'Dashboard', pathname === '/dashboard')}
        {navItem('/report', 'Inventory report', pathname === '/report')}
        {navItem('/reduction', 'Reduce: targets & plan', pathname === '/reduction')}
        {navItem('/scope3-screening', 'Scope 3 screening', pathname === '/scope3-screening')}
        <RoleGate allow={['admin', 'data_entry']}>
          {navItem('/activity-data', 'Activity data', pathname === '/activity-data')}
          {navItem('/activity-data/import', 'Import data', pathname === '/activity-data/import')}
        </RoleGate>
        <RoleGate allow={['verifier']}>
          {navItem('/admin/audit-logs', 'Audit logs', pathname === '/admin/audit-logs')}
        </RoleGate>

        <RoleGate allow={['admin']}>
          <p className="mt-4 px-3 text-xs font-medium uppercase tracking-wide text-gray-400">Admin</p>
          {navItem('/admin/reporting-periods', 'Reporting periods', pathname === '/admin/reporting-periods')}
          {navItem('/admin/emission-factors', 'Emission factors', pathname === '/admin/emission-factors')}
          {navItem('/admin/facilities', 'Facilities', pathname === '/admin/facilities')}
          {navItem('/admin/users', 'Users', pathname === '/admin/users')}
          {navItem('/admin/audit-logs', 'Audit logs', pathname === '/admin/audit-logs')}
        </RoleGate>
      </nav>

      <div className="border-t border-gray-200 p-3">
        <div className="mb-2 px-1">
          <p className="truncate text-sm font-medium">{user?.fullName}</p>
          <p className="truncate text-xs capitalize text-gray-500">{user?.role.replace('_', ' ')}</p>
        </div>
        <button onClick={logout} className="btn-secondary w-full text-left">
          Sign out
        </button>
      </div>
    </aside>
  );
}
