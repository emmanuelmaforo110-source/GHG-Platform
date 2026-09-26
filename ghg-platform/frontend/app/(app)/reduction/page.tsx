'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MaccChart } from '@/components/MaccChart';
import {
  GhgCategory, INITIATIVE_STATUS_LABELS, InitiativeStatus, ReductionInitiativeRow, ReductionOverview, TargetCoverage,
} from '@/lib/types';

const TARGET_COLORS = ['#7c3aed', '#0891b2', '#be185d'];
const num = (n: number, dp = 2) => n.toLocaleString(undefined, { maximumFractionDigits: dp });

const emptyTarget = { name: '', coverage: 'scope_1_2' as TargetCoverage, targetType: 'absolute', baseYear: '', baseYearValue: '', targetYear: '', reductionPct: '' };
const emptyInitiative = {
  name: '', description: '', scope: 'scope_2', categoryId: '', status: 'planned' as InitiativeStatus,
  startYear: String(new Date().getFullYear() + 1), lifetimeYears: '10', annualReductionTco2e: '',
  capex: '0', annualOpexChange: '0', currency: 'USD', discountRatePct: '10', owner: '',
};

export default function ReductionPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const canEditInitiatives = hasRole('admin', 'data_entry');

  const [overview, setOverview] = useState<ReductionOverview | null>(null);
  const [initiatives, setInitiatives] = useState<ReductionInitiativeRow[]>([]);
  const [categories, setCategories] = useState<GhgCategory[]>([]);
  const [currency, setCurrency] = useState<string | undefined>();
  const [growthPct, setGrowthPct] = useState('0');
  const [targetForm, setTargetForm] = useState(emptyTarget);
  const [initForm, setInitForm] = useState(emptyInitiative);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [showInitForm, setShowInitForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(cur = currency, growth = growthPct) {
    const q = new URLSearchParams();
    if (cur) q.set('currency', cur);
    if (growth) q.set('growthPct', growth);
    const [o, list] = await Promise.all([
      api.get<ReductionOverview>(`/reduction/overview?${q.toString()}`),
      api.get<ReductionInitiativeRow[]>('/reduction/initiatives'),
    ]);
    setOverview(o);
    setInitiatives(list);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load.'));
    api.get<GhgCategory[]>('/emission-factors/categories').then(setCategories).catch(() => undefined);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  };

  async function saveTarget(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api.post('/reduction/targets', {
        name: targetForm.name,
        coverage: targetForm.coverage,
        targetType: targetForm.targetType,
        baseYear: Number(targetForm.baseYear),
        baseYearValue: targetForm.baseYearValue === '' ? undefined : Number(targetForm.baseYearValue),
        targetYear: Number(targetForm.targetYear),
        reductionPct: Number(targetForm.reductionPct),
      });
      setTargetForm(emptyTarget);
      setShowTargetForm(false);
    });
  }

  async function saveInitiative(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: initForm.name,
      description: initForm.description || undefined,
      scope: initForm.scope,
      categoryId: initForm.categoryId ? Number(initForm.categoryId) : undefined,
      status: initForm.status,
      startYear: Number(initForm.startYear),
      lifetimeYears: Number(initForm.lifetimeYears),
      annualReductionTco2e: Number(initForm.annualReductionTco2e),
      capex: Number(initForm.capex || 0),
      annualOpexChange: Number(initForm.annualOpexChange || 0),
      currency: initForm.currency,
      discountRatePct: Number(initForm.discountRatePct || 0),
      owner: initForm.owner || undefined,
    };
    await run(async () => {
      if (editingId) await api.patch(`/reduction/initiatives/${editingId}`, body);
      else await api.post('/reduction/initiatives', body);
      setInitForm(emptyInitiative);
      setEditingId(null);
      setShowInitForm(false);
    });
  }

  function editInitiative(i: ReductionInitiativeRow) {
    setEditingId(i.id);
    setShowInitForm(true);
    setInitForm({
      name: i.name, description: i.description ?? '', scope: i.scope, categoryId: i.categoryId ? String(i.categoryId) : '',
      status: i.status, startYear: String(i.startYear), lifetimeYears: String(i.lifetimeYears),
      annualReductionTco2e: String(Number(i.annualReductionTco2e)), capex: String(Number(i.capex)),
      annualOpexChange: String(Number(i.annualOpexChange)), currency: i.currency, discountRatePct: String(Number(i.discountRatePct)),
      owner: i.owner ?? '',
    });
    window.scrollTo({ top: document.getElementById('initiatives')?.offsetTop ?? 0, behavior: 'smooth' });
  }

  const scopeCategories = categories.filter((c) => c.scope === initForm.scope);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Reduce: targets and plan</h1>
        <p className="text-sm text-gray-500">
          Set reduction targets, list the projects that cut emissions with their costs, see which are cheapest per tonne,
          and check whether the plan reaches the targets.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* ---------------- Targets ---------------- */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Targets</p>
          {isAdmin && !showTargetForm && (
            <button type="button" className="btn-secondary" onClick={() => setShowTargetForm(true)}>Add a target</button>
          )}
        </div>

        {showTargetForm && (
          <form onSubmit={saveTarget} className="grid grid-cols-1 gap-3 rounded-md border border-gray-100 p-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label>Name</label>
              <input type="text" required value={targetForm.name} placeholder="e.g. Cut operational emissions 42% by 2031"
                onChange={(e) => setTargetForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label>Covers</label>
              <select value={targetForm.coverage} onChange={(e) => setTargetForm((f) => ({ ...f, coverage: e.target.value as TargetCoverage }))}>
                <option value="scope_1_2">Scope 1 + 2</option>
                <option value="scope_3">Scope 3</option>
                <option value="all_scopes">All scopes</option>
              </select>
            </div>
            <div>
              <label>Type</label>
              <select value={targetForm.targetType} onChange={(e) => setTargetForm((f) => ({ ...f, targetType: e.target.value }))}>
                <option value="absolute">Absolute (total tCO2e)</option>
                <option value="intensity">Intensity (tCO2e per employee)</option>
              </select>
            </div>
            <div>
              <label>Reduction (%)</label>
              <input type="number" step="any" min="0.1" max="100" required value={targetForm.reductionPct}
                onChange={(e) => setTargetForm((f) => ({ ...f, reductionPct: e.target.value }))} />
            </div>
            <div>
              <label>Base year</label>
              <input type="number" required value={targetForm.baseYear} onChange={(e) => setTargetForm((f) => ({ ...f, baseYear: e.target.value }))} />
            </div>
            <div>
              <label>Target year</label>
              <input type="number" required value={targetForm.targetYear} onChange={(e) => setTargetForm((f) => ({ ...f, targetYear: e.target.value }))} />
            </div>
            <div>
              <label>Base-year value (optional)</label>
              <input type="number" step="any" min="0" value={targetForm.baseYearValue} placeholder="Taken from your data if blank"
                onChange={(e) => setTargetForm((f) => ({ ...f, baseYearValue: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <button type="button" className="btn-secondary" onClick={() => setShowTargetForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Save target</button>
            </div>
          </form>
        )}

        {overview?.targets.length === 0 && <p className="text-sm text-gray-400">No targets yet.</p>}
        <div className="divide-y divide-gray-100">
          {overview?.targets.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-gray-500">
                  {t.coverageLabel} · {t.reductionPct}% by {t.targetYear} from {t.baseYear} · {num(t.baseYearValue, 3)} → {num(t.targetValue, 3)} {t.unit}
                </p>
                {t.progress ? (
                  <p className="text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${t.progress.status === 'on_track' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.progress.status === 'on_track' ? 'On track' : 'Off track'}
                    </span>{' '}
                    {t.progress.year}: {num(t.progress.actual, 3)} vs. {num(t.progress.expected, 3)} expected on the path ({t.progress.changeFromBasePct > 0 ? '+' : ''}{t.progress.changeFromBasePct}% since {t.baseYear})
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">Progress appears once a year after {t.baseYear} has data.</p>
                )}
                {t.ambition && (
                  <p className="text-xs text-gray-500">
                    {t.ambition.annualRatePct}% a year — {t.ambition.meetsReferenceRate ? 'meets' : 'below'} the SBTi reference rate of{' '}
                    {t.ambition.requiredAnnualRatePct}% a year for {t.ambition.pathway} (indicative; check the current SBTi criteria before submitting).
                  </p>
                )}
              </div>
              {isAdmin && (
                <button type="button" className="text-xs text-red-700 hover:underline"
                  onClick={() => window.confirm(`Delete the target "${t.name}"?`) && run(() => api.delete(`/reduction/targets/${t.id}`))}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Scenario ---------------- */}
      {overview && (
        <section className="card space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">Where the plan takes you (all scopes, tCO2e)</p>
              <p className="text-xs text-gray-500">
                Business as usual keeps the latest recorded year{overview.scenario.latestRecordedYear ? ` (${overview.scenario.latestRecordedYear})` : ''} flat,
                or grows it by the rate you choose. The plan subtracts planned, in-progress and completed initiatives that start after that year.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label>Growth a year (%)</label>
                <input type="number" step="any" className="w-28" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} />
              </div>
              <button type="button" className="btn-secondary" onClick={() => load(currency, growthPct).catch(() => undefined)}>Update</button>
            </div>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview.scenario.years}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e1e0d9" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => (v === null ? '—' : `${num(v)} tCO2e`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="actual" name="Recorded" stroke="#111827" strokeWidth={2} dot connectNulls={false} />
                <Line type="monotone" dataKey="businessAsUsual" name="Business as usual" stroke="#9ca3af" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="withPlan" name="With the plan" stroke="#1baf7a" strokeWidth={2} dot={false} />
                {overview.scenario.targetSeries.map((t, i) => (
                  <Line key={t.key} type="linear" dataKey={t.key} name={t.name} stroke={TARGET_COLORS[i % TARGET_COLORS.length]} strokeDasharray="2 3" dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">
            Planned reductions: {num(overview.totals.plannedAnnualReductionTco2e)} tCO2e a year · ideas not yet planned: {num(overview.totals.ideasAnnualReductionTco2e)} tCO2e a year.
          </p>
        </section>
      )}

      {/* ---------------- MACC ---------------- */}
      {overview && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Cheapest reductions first (marginal abatement cost curve)</p>
              <p className="text-xs text-gray-500">Cost per tonne = (investment spread over its lifetime + change in yearly running costs) ÷ tonnes avoided per year.</p>
            </div>
            {overview.currencies.length > 1 && (
              <select className="w-auto" value={overview.currency} onChange={(e) => { setCurrency(e.target.value); load(e.target.value).catch(() => undefined); }}>
                {overview.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <MaccChart bars={overview.macc} currency={overview.currency} />
        </section>
      )}

      {/* ---------------- Initiatives ---------------- */}
      <section id="initiatives" className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Reduction initiatives</p>
          {canEditInitiatives && !showInitForm && (
            <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setInitForm(emptyInitiative); setShowInitForm(true); }}>
              Add an initiative
            </button>
          )}
        </div>

        {showInitForm && (
          <form onSubmit={saveInitiative} className="grid grid-cols-1 gap-3 rounded-md border border-gray-100 p-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label>Name</label>
              <input type="text" required value={initForm.name} placeholder="e.g. Solar PV on the office roof"
                onChange={(e) => setInitForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label>Status</label>
              <select value={initForm.status} onChange={(e) => setInitForm((f) => ({ ...f, status: e.target.value as InitiativeStatus }))}>
                {Object.entries(INITIATIVE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label>Scope</label>
              <select value={initForm.scope} onChange={(e) => setInitForm((f) => ({ ...f, scope: e.target.value, categoryId: '' }))}>
                <option value="scope_1">Scope 1</option>
                <option value="scope_2">Scope 2</option>
                <option value="scope_3">Scope 3</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label>Emission source (optional)</label>
              <select value={initForm.categoryId} onChange={(e) => setInitForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">—</option>
                {scopeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label>Reduction (tCO2e per year)</label>
              <input type="number" step="any" min="0.0001" required value={initForm.annualReductionTco2e}
                onChange={(e) => setInitForm((f) => ({ ...f, annualReductionTco2e: e.target.value }))} />
            </div>
            <div>
              <label>Start year</label>
              <input type="number" required value={initForm.startYear} onChange={(e) => setInitForm((f) => ({ ...f, startYear: e.target.value }))} />
            </div>
            <div>
              <label>Lifetime (years)</label>
              <input type="number" min="1" max="50" required value={initForm.lifetimeYears} onChange={(e) => setInitForm((f) => ({ ...f, lifetimeYears: e.target.value }))} />
            </div>
            <div>
              <label>Investment (one-off)</label>
              <input type="number" step="any" min="0" value={initForm.capex} onChange={(e) => setInitForm((f) => ({ ...f, capex: e.target.value }))} />
            </div>
            <div>
              <label>Change in yearly running cost</label>
              <input type="number" step="any" value={initForm.annualOpexChange} onChange={(e) => setInitForm((f) => ({ ...f, annualOpexChange: e.target.value }))} />
              <p className="mt-1 text-xs text-gray-400">Negative = yearly savings (e.g. lower fuel bills)</p>
            </div>
            <div>
              <label>Currency</label>
              <input type="text" value={initForm.currency} onChange={(e) => setInitForm((f) => ({ ...f, currency: e.target.value }))} />
            </div>
            <div>
              <label>Discount rate (%)</label>
              <input type="number" step="any" min="0" max="50" value={initForm.discountRatePct} onChange={(e) => setInitForm((f) => ({ ...f, discountRatePct: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label>Owner (optional)</label>
              <input type="text" value={initForm.owner} onChange={(e) => setInitForm((f) => ({ ...f, owner: e.target.value }))} />
            </div>
            <div className="sm:col-span-3">
              <label>Description (optional)</label>
              <textarea rows={2} value={initForm.description} onChange={(e) => setInitForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <button type="button" className="btn-secondary" onClick={() => { setShowInitForm(false); setEditingId(null); }}>Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Save changes' : 'Add initiative'}</button>
            </div>
          </form>
        )}

        {initiatives.length === 0 ? (
          <p className="text-sm text-gray-400">No initiatives yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase text-gray-400">
                  <th className="py-2 font-normal">Initiative</th>
                  <th className="py-2 font-normal">Status</th>
                  <th className="py-2 font-normal">Years</th>
                  <th className="py-2 text-right font-normal">tCO2e / yr</th>
                  <th className="py-2 text-right font-normal">Cost per tonne</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {initiatives.map((i) => (
                  <tr key={i.id} className={`border-b border-gray-50 ${i.status === 'cancelled' ? 'text-gray-400' : ''}`}>
                    <td className="py-2">
                      {i.name}
                      <span className="block text-xs text-gray-400">{i.category?.name ?? i.scope.replace('scope_', 'Scope ')}{i.owner ? ` · ${i.owner}` : ''}</span>
                    </td>
                    <td className="py-2">{INITIATIVE_STATUS_LABELS[i.status]}</td>
                    <td className="py-2 text-gray-500">{i.startYear}–{i.startYear + i.lifetimeYears - 1}</td>
                    <td className="py-2 text-right">{num(Number(i.annualReductionTco2e), 3)}</td>
                    <td className={`py-2 text-right ${i.costPerTonne < 0 ? 'text-green-700' : ''}`}>
                      {num(i.costPerTonne, 0)} {i.currency}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {canEditInitiatives && (
                        <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => editInitiative(i)}>Edit</button>
                      )}
                      {isAdmin && (
                        <button type="button" className="ml-3 text-xs text-red-700 hover:underline"
                          onClick={() => window.confirm(`Delete "${i.name}"?`) && run(() => api.delete(`/reduction/initiatives/${i.id}`))}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
