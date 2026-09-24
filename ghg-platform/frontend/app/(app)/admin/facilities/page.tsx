'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Facility } from '@/lib/types';

export default function FacilitiesPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setFacilities(await api.get<Facility[]>('/facilities'));
  }
  useEffect(() => { load(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await api.post('/facilities', { name, address });
      setName('');
      setAddress('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the facility.');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Facilities</h1>
        <p className="text-sm text-gray-500">Sites/offices activity data can be attributed to</p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleCreate} className="card flex items-end gap-3">
        <div className="flex-1">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Arusha branch office" />
        </div>
        <div className="flex-1">
          <label>Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
        </div>
        <button type="submit" className="btn-primary">Add</button>
      </form>

      <div className="card divide-y divide-gray-100">
        {facilities.map((f) => (
          <div key={f.id} className="py-2">
            <p className="text-sm font-medium">{f.name}</p>
            {f.address && <p className="text-xs text-gray-400">{f.address}</p>}
          </div>
        ))}
        {facilities.length === 0 && <p className="py-2 text-sm text-gray-400">No facilities yet.</p>}
      </div>
    </div>
  );
}
