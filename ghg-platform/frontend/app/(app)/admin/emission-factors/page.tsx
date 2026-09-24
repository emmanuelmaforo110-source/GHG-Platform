'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { EmissionFactor, GhgCategory } from '@/lib/types';

export default function EmissionFactorsPage() {
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmissionFactor | null>(null);
  const [overrideValue, setOverrideValue] = useState('');

  async function load() {
    setFactors(await api.get<EmissionFactor[]>('/emission-factors'));
  }
  useEffect(() => { load(); }, []);

  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await api.post('/emission-factors', {
        categoryId: editing.categoryId,
        factorName: editing.factorName,
        value: Number(overrideValue),
        unit: editing.unit,
        validYear: editing.validYear,
        source: 'Organization-verified (reviewed by Admin)',
      });
      setEditing(null);
      setOverrideValue('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the override.');
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Emission factors</h1>
        <p className="text-sm text-gray-500">
          Global defaults apply automatically. Review one and override it with your organization&apos;s
          verified figure — the override never changes the shared default other tenants use.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {editing && (
        <form onSubmit={saveOverride} className="card space-y-3">
          <p className="text-sm font-medium">Override: {editing.factorName} ({editing.validYear})</p>
          <div className="flex items-end gap-3">
            <div>
              <label>Verified value ({editing.unit})</label>
              <input
                type="number"
                step="any"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary">Save override</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase text-gray-400">
              <th className="py-2 font-normal">Factor</th>
              <th className="py-2 font-normal">Category</th>
              <th className="py-2 font-normal">Value</th>
              <th className="py-2 font-normal">Year</th>
              <th className="py-2 font-normal">Status</th>
              <th className="py-2 font-normal">Source</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {factors.map((f) => (
              <tr key={f.id} className="border-b border-gray-50 align-top">
                <td className="py-2">{f.factorName}</td>
                <td className="py-2 text-gray-500">{f.category.name}</td>
                <td className="py-2 text-gray-500">{f.value} {f.unit}</td>
                <td className="py-2 text-gray-500">{f.validYear}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      f.isReviewed ? 'bg-green-100 text-green-700' : f.isDefault ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {f.isReviewed ? 'Verified' : f.isDefault ? 'Default — review' : 'Custom'}
                  </span>
                </td>
                <td className="max-w-xs py-2 text-xs text-gray-400">{f.source}</td>
                <td className="py-2 text-right">
                  {!f.organizationId && (
                    <button
                      className="text-xs font-medium text-brand hover:underline"
                      onClick={() => { setEditing(f); setOverrideValue(f.value); }}
                    >
                      Review &amp; override
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
