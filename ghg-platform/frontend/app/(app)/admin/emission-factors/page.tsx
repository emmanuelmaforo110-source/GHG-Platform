'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { EmissionFactor, GhgCategory } from '@/lib/types';

export default function EmissionFactorsPage() {
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmissionFactor | null>(null);
  const [overrideValue, setOverrideValue] = useState('');
  const [categories, setCategories] = useState<GhgCategory[]>([]);
  const [adding, setAdding] = useState(false);
  const emptyNew = {
    categoryId: '', factorName: '', value: '', per: '', validYear: String(new Date().getFullYear()), source: '',
    co2: '', ch4: '', n2o: '',
  };
  const [newFactor, setNewFactor] = useState(emptyNew);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setFactors(await api.get<EmissionFactor[]>('/emission-factors'));
  }
  useEffect(() => {
    load();
    api.get<GhgCategory[]>('/emission-factors/categories').then(setCategories).catch(() => undefined);
  }, []);

  async function addFactor(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const gases = [newFactor.co2, newFactor.ch4, newFactor.n2o];
    try {
      await api.post('/emission-factors', {
        categoryId: Number(newFactor.categoryId),
        factorName: newFactor.factorName,
        value: Number(newFactor.value),
        unit: `kg CO2e / ${newFactor.per.trim()}`,
        validYear: Number(newFactor.validYear),
        source: newFactor.source,
        ...(gases.some((g) => g !== '')
          ? { co2PerUnit: Number(newFactor.co2), ch4PerUnit: Number(newFactor.ch4), n2oPerUnit: Number(newFactor.n2o) }
          : {}),
      });
      setNotice(`Added "${newFactor.factorName}".`);
      setNewFactor(emptyNew);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the factor.');
    }
  }

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
      {notice && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      {!adding ? (
        <button type="button" className="btn-secondary" onClick={() => { setAdding(true); setNotice(null); }}>
          Add an emission factor
        </button>
      ) : (
        <form onSubmit={addFactor} className="card space-y-3">
          <p className="text-sm font-medium">New emission factor for your organisation</p>
          <p className="text-xs text-gray-500">
            Use this for a supplier-specific rate, a verified local factor, or a spend-based factor (per USD, TZS …).
            Record where the number comes from.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label>Category</label>
              <select required value={newFactor.categoryId} onChange={(e) => setNewFactor((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Select…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label>Name</label>
              <input type="text" required value={newFactor.factorName} placeholder="e.g. Office supplies (spend-based)"
                onChange={(e) => setNewFactor((f) => ({ ...f, factorName: e.target.value }))} />
            </div>
            <div>
              <label>Value (kg CO2e per unit)</label>
              <input type="number" step="any" min="0" required value={newFactor.value}
                onChange={(e) => setNewFactor((f) => ({ ...f, value: e.target.value }))} />
            </div>
            <div>
              <label>Per unit</label>
              <input type="text" required value={newFactor.per} placeholder="litre, kWh, kg, km, USD, TZS…"
                onChange={(e) => setNewFactor((f) => ({ ...f, per: e.target.value }))} />
            </div>
            <div>
              <label>Year</label>
              <input type="number" required value={newFactor.validYear}
                onChange={(e) => setNewFactor((f) => ({ ...f, validYear: e.target.value }))} />
            </div>
            <div>
              <label>Source</label>
              <input type="text" required value={newFactor.source} placeholder="e.g. Supplier carbon statement 2026"
                onChange={(e) => setNewFactor((f) => ({ ...f, source: e.target.value }))} />
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-gray-600">Optional: split by gas (kg of CO2, CH4 and N2O per unit)</summary>
            <p className="mt-1 text-xs text-gray-500">
              If you give all three, CO2e is calculated from the gases with the reporting period&apos;s AR5 or AR6 values.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {(['co2', 'ch4', 'n2o'] as const).map((g) => (
                <div key={g}>
                  <label>{g.toUpperCase()} (kg / unit)</label>
                  <input type="number" step="any" min="0" value={newFactor[g]}
                    onChange={(e) => setNewFactor((f) => ({ ...f, [g]: e.target.value }))} />
                </div>
              ))}
            </div>
          </details>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add factor</button>
          </div>
        </form>
      )}

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
