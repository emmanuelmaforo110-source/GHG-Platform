'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Facility, UserRole } from '@/lib/types';

interface UserRow {
  id: string; email: string; fullName: string; role: UserRole; isActive: boolean;
  restrictedFacilityId: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'data_entry' as UserRole, restrictedFacilityId: '', temporaryPassword: '' });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [usersRes, facilitiesRes] = await Promise.all([
      api.get<UserRow[]>('/users'),
      api.get<Facility[]>('/facilities'),
    ]);
    setUsers(usersRes);
    setFacilities(facilitiesRes);
  }
  useEffect(() => { load(); }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/users', {
        ...form,
        restrictedFacilityId: form.restrictedFacilityId || undefined,
      });
      setForm({ fullName: '', email: '', role: 'data_entry', restrictedFacilityId: '', temporaryPassword: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite the user.');
    }
  }

  async function deactivate(id: string) {
    await api.patch(`/users/${id}/deactivate`);
    await load();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Users</h1>
        <p className="text-sm text-gray-500">Admin, Data Entry, and Management roles — see the RBAC table in the architecture doc</p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleInvite} className="card grid grid-cols-2 gap-3">
        <div>
          <label>Full name</label>
          <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required />
        </div>
        <div>
          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
        </div>
        <div>
          <label>Role</label>
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
            <option value="admin">Admin</option>
            <option value="data_entry">Data entry</option>
            <option value="management">Management</option>
          </select>
        </div>
        <div>
          <label>Restrict to facility (optional)</label>
          <select value={form.restrictedFacilityId} onChange={(e) => setForm((f) => ({ ...f, restrictedFacilityId: e.target.value }))}>
            <option value="">All facilities</option>
            {facilities.map((fac) => <option key={fac.id} value={fac.id}>{fac.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label>Temporary password</label>
          <input
            type="text"
            value={form.temporaryPassword}
            onChange={(e) => setForm((f) => ({ ...f, temporaryPassword: e.target.value }))}
            placeholder="Shared with the user out of band — they should change it on first login"
            required
          />
        </div>
        <div className="col-span-2 flex justify-end">
          <button type="submit" className="btn-primary">Invite user</button>
        </div>
      </form>

      <div className="card divide-y divide-gray-100">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">{u.fullName} <span className="ml-1 text-xs capitalize text-gray-400">{u.role.replace('_', ' ')}</span></p>
              <p className="text-xs text-gray-400">{u.email}</p>
            </div>
            {u.isActive ? (
              <button className="text-xs text-red-600 hover:underline" onClick={() => deactivate(u.id)}>Deactivate</button>
            ) : (
              <span className="text-xs text-gray-400">Deactivated</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
