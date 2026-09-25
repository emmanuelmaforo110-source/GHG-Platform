'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReportingPeriod, Scope3ScreeningRow } from '@/lib/types';

/**
 * GHG Protocol Scope 3 Standard: every one of the 15 categories must be either quantified or
 * excluded with a documented reason (size, influence, risk, stakeholders, outsourcing, sector guidance).
 */
export default function Scope3ScreeningPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'data_entry');
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<Scope3ScreeningRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { isIncluded: boolean; reason: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ReportingPeriod[]>('/reporting-periods')
      .then((res) => {
        setPeriods(res);
        if (res.length) setPeriodId(res[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load reporting periods.'));
  }, []);

  async function load(id: string) {
    const res = await api.get<Scope3ScreeningRow[]>(`/reporting-periods/${id}/scope3-screening`);
    setRows(res);
    setDrafts(
      Object.fromEntries(
        res.map((r) => [r.categoryId, { isIncluded: r.isIncluded ?? r.entries > 0, reason: r.relevanceAssessment ?? '' }]),
      ),
    );
  }

  useEffect(() => {
    if (periodId) load(periodId).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load.'));
  }, [periodId]);

  const period = periods.find((p) => p.id === periodId);
  const editable = canEdit && period?.status === 'draft';
  const screened = rows.filter((r) => r.isIncluded !== null || r.entries > 0).length;

  async function save(row: Scope3ScreeningRow) {
    const d = drafts[row.categoryId];
    setSavingId(row.categoryId);
    setError(null);
    try {
      await api.put(`/reporting-periods/${periodId}/scope3-screening`, {
        categoryId: row.categoryId,
        isIncluded: d.isIncluded,
        relevanceAssessment: d.reason,
      });
      await load(periodId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-medium">Scope 3 screening</h1>
          <p className="text-sm text-gray-500">
            For each of the 15 value-chain categories, record whether it is included and why. Excluded categories need a
            reason (size, influence, risk, stakeholder interest, outsourcing or sector guidance).
          </p>
        </div>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-full sm:w-auto">
          {periods.map((p) => <option key={p.id} value={p.id}>{p.year} — {p.status}</option>)}
        </select>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <p className="text-sm text-gray-600">{screened} of {rows.length} categories screened or quantified.</p>

      <div className="card divide-y divide-gray-100">
        {rows.map((r) => {
          const d = drafts[r.categoryId] ?? { isIncluded: false, reason: '' };
          return (
            <div key={r.categoryId} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{r.category}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    r.entries > 0
                      ? 'bg-green-100 text-green-700'
                      : r.isIncluded === null
                        ? 'bg-amber-100 text-amber-700'
                        : r.isIncluded
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {r.entries > 0
                    ? `Quantified — ${r.tco2e.toFixed(3)} tCO2e`
                    : r.isIncluded === null
                      ? 'Not screened yet'
                      : r.isIncluded
                        ? 'Included, not yet quantified'
                        : 'Excluded'}
                </span>
              </div>
              {editable ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <select
                    className="sm:w-40"
                    value={d.isIncluded ? 'yes' : 'no'}
                    onChange={(e) => setDrafts((all) => ({ ...all, [r.categoryId]: { ...d, isIncluded: e.target.value === 'yes' } }))}
                  >
                    <option value="yes">Included</option>
                    <option value="no">Excluded</option>
                  </select>
                  <textarea
                    rows={2}
                    placeholder="Reason, e.g. Size: low — services firm with minimal physical procurement."
                    value={d.reason}
                    onChange={(e) => setDrafts((all) => ({ ...all, [r.categoryId]: { ...d, reason: e.target.value } }))}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={savingId === r.categoryId || d.reason.trim().length < 10}
                    onClick={() => save(r)}
                  >
                    {savingId === r.categoryId ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : (
                r.relevanceAssessment && <p className="text-xs text-gray-500">{r.relevanceAssessment}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
