'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Facility } from '@/lib/types';

const empty = { name: '', address: '', country: 'Tanzania' };

export default function FacilitiesPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setFacilities(await api.get<Facility[]>('/facilities?includeInactive=true'));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load facilities.'));
  }, []);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      await load();
      if (done) setNotice(done);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => api.post('/facilities', { name: form.name, address: form.address || undefined, country: form.country || undefined }),
      `"${form.name.trim()}" added.`,
    );
    if (ok) setForm(empty);
  }

  function startEdit(f: Facility) {
    setEditingId(f.id);
    setEdit({ name: f.name, address: f.address ?? '', country: f.country ?? '' });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const ok = await run(
      () => api.patch(`/facilities/${editingId}`, { name: edit.name, address: edit.address, country: edit.country }),
      'Changes saved.',
    );
    if (ok) setEditingId(null);
  }

  function toggleActive(f: Facility) {
    const question = f.isActive
      ? `Make "${f.name}" inactive? Its past entries stay in the inventory, but no new entries can be added to it.`
      : `Reactivate "${f.name}" so new entries can be added?`;
    if (!window.confirm(question)) return;
    run(() => api.patch(`/facilities/${f.id}`, { isActive: !f.isActive }), f.isActive ? `"${f.name}" is now inactive.` : `"${f.name}" is active again.`);
  }

  const active = facilities.filter((f) => f.isActive);
  const inactive = facilities.filter((f) => !f.isActive);

  const row = (f: Facility) =>
    editingId === f.id ? (
      <form key={f.id} onSubmit={saveEdit} className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-3">
        <div>
          <label>Name</label>
          <input type="text" required minLength={2} value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} />
        </div>
        <div>
          <label>Address</label>
          <input type="text" value={edit.address} onChange={(e) => setEdit((x) => ({ ...x, address: e.target.value }))} />
        </div>
        <div>
          <label>Country</label>
          <input type="text" value={edit.country} onChange={(e) => setEdit((x) => ({ ...x, country: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-3">
          <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>Save</button>
        </div>
      </form>
    ) : (
      <div key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={`text-sm font-medium ${f.isActive ? '' : 'text-gray-400'}`}>
            {f.name}
            {!f.isActive && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">Inactive</span>}
          </p>
          <p className="text-xs text-gray-500">
            {[f.address, f.country].filter(Boolean).join(', ') || 'No address recorded'} · {f.entryCount ?? 0} entr{f.entryCount === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <button type="button" className="text-blue-700 hover:underline" onClick={() => startEdit(f)}>Edit</button>
          <button type="button" className={f.isActive ? 'text-red-700 hover:underline' : 'text-green-700 hover:underline'} onClick={() => toggleActive(f)} disabled={busy}>
            {f.isActive ? 'Make inactive' : 'Reactivate'}
          </button>
        </div>
      </div>
    );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Facilities</h1>
        <p className="text-sm text-gray-500">
          The offices, branches, sites, warehouses or vehicle fleets whose emissions you record. Every entry belongs to one facility.
          A facility that closes is made inactive rather than deleted, so its past emissions stay in earlier inventories.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      <form onSubmit={add} className="card grid grid-cols-1 gap-3 sm:grid-cols-3">
        <p className="text-sm font-medium sm:col-span-3">Add a facility</p>
        <div>
          <label>Name</label>
          <input type="text" required minLength={2} placeholder="e.g. Arusha branch" value={form.name}
            onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))} />
        </div>
        <div>
          <label>Address (optional)</label>
          <input type="text" value={form.address} onChange={(e) => setForm((x) => ({ ...x, address: e.target.value }))} />
        </div>
        <div>
          <label>Country</label>
          <input type="text" value={form.country} onChange={(e) => setForm((x) => ({ ...x, country: e.target.value }))} />
        </div>
        <div className="flex justify-end sm:col-span-3">
          <button type="submit" className="btn-primary" disabled={busy}>Add facility</button>
        </div>
      </form>

      <div className="card">
        <p className="mb-1 text-sm font-medium">Active ({active.length})</p>
        {active.length === 0 && <p className="py-2 text-sm text-gray-400">No active facilities.</p>}
        <div className="divide-y divide-gray-100">{active.map(row)}</div>
      </div>

      {inactive.length > 0 && (
        <div className="card">
          <p className="mb-1 text-sm font-medium">Inactive ({inactive.length})</p>
          <div className="divide-y divide-gray-100">{inactive.map(row)}</div>
        </div>
      )}
    </div>
  );
}
