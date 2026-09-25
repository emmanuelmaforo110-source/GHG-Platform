'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import {
  ActivityDataRow, CreateActivityDataInput, DATA_QUALITY_LABELS, EmissionFactor, Facility, GhgCategory, ReportingPeriod,
} from '@/lib/types';

const UNIT_SUGGESTIONS: Record<string, string[]> = {
  'Stationary Combustion': ['litres', 'kg', 'm3'],
  'Mobile Combustion': ['litres'],
  'Fugitive Emissions': ['kg'],
  'Purchased Electricity': ['kWh'],
};

export default function ActivityDataPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [categories, setCategories] = useState<GhgCategory[]>([]);
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [rows, setRows] = useState<ActivityDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [lastResult, setLastResult] = useState<ActivityDataRow | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Partial<CreateActivityDataInput>>({});
  // When set, the form edits this existing entry instead of creating a new one.
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [facilitiesRes, periodsRes, categoriesRes, factorsRes] = await Promise.all([
          api.get<Facility[]>('/facilities'),
          api.get<ReportingPeriod[]>('/reporting-periods'),
          api.get<GhgCategory[]>('/emission-factors/categories'),
          api.get<EmissionFactor[]>('/emission-factors'),
        ]);
        setFacilities(facilitiesRes);
        setPeriods(periodsRes);
        setCategories(categoriesRes);
        setFactors(factorsRes);

        if (facilitiesRes.length) setForm((f) => ({ ...f, facilityId: facilitiesRes[0].id }));
        if (periodsRes.length) setForm((f) => ({ ...f, reportingPeriodId: periodsRes[0].id }));
        if (periodsRes.length) await loadRows(periodsRes[0].id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load form data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadRows(reportingPeriodId: string) {
    setLoadingRows(true);
    try {
      const res = await api.get<ActivityDataRow[]>(`/activity-data?reportingPeriodId=${reportingPeriodId}`);
      setRows(res);
    } finally {
      setLoadingRows(false);
    }
  }

  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const selectedPeriod = periods.find((p) => p.id === form.reportingPeriodId);
  const periodIsEditable = selectedPeriod?.status === 'draft';
  const categoryFactors = factors.filter((factor) => factor.categoryId === form.categoryId);
  const selectedFactor = factors.find((factor) => factor.id === form.emissionFactorId);
  const estimatedKgCo2e = selectedFactor && typeof form.quantity === 'number' && form.quantity > 0
    ? form.quantity * Number(selectedFactor.value)
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (!form.sourceName?.trim()) nextFieldErrors.sourceName = 'Enter a recognizable source name.';
    if (form.quantity === undefined || !Number.isFinite(form.quantity) || form.quantity <= 0) {
      nextFieldErrors.quantity = 'Enter a quantity greater than zero.';
    }
    if (!form.unit?.trim()) nextFieldErrors.unit = 'Enter the unit used by the source data.';
    if (categoryFactors.length > 0 && !form.emissionFactorId) {
      nextFieldErrors.emissionFactorId = 'Select the factor used for this calculation.';
    }
    setFieldErrors(nextFieldErrors);

    if (!form.facilityId || !form.reportingPeriodId || !form.categoryId || Object.keys(nextFieldErrors).length > 0) {
      setError('Please correct the highlighted fields before saving.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        // On an edit, an emptied instrument / quality score is sent as null so the server clears it.
        marketEmissionFactorId: form.marketEmissionFactorId || (editingId ? null : undefined),
        dataQualityScore: form.dataQualityScore ?? (editingId ? null : undefined),
      };
      const created = editingId
        ? await api.patch<ActivityDataRow>(`/activity-data/${editingId}`, payload)
        : await api.post<ActivityDataRow>('/activity-data', payload);
      setLastResult(created);
      setEditingId(null);

      if (pendingFile) {
        const fd = new FormData();
        fd.append('file', pendingFile);
        await api.post(`/activity-data/${created.id}/attachments`, fd);
        setPendingFile(null);
      }

      setForm((f) => ({ facilityId: f.facilityId, reportingPeriodId: f.reportingPeriodId }));
      await loadRows(form.reportingPeriodId!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the entry.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: ActivityDataRow) {
    setError(null);
    setLastResult(null);
    setFieldErrors({});
    setEditingId(row.id);
    setForm({
      facilityId: row.facilityId,
      reportingPeriodId: row.reportingPeriodId,
      categoryId: row.categoryId,
      sourceName: row.sourceName,
      detail: row.detail ?? undefined,
      fuelOrMaterialType: row.fuelOrMaterialType ?? undefined,
      quantity: Number(row.quantity),
      unit: row.unit,
      emissionFactorId: row.emissionFactorId ?? undefined,
      // Only a real contractual instrument is shown; a grid-average proxy has the same id as the grid factor.
      marketEmissionFactorId:
        row.marketEmissionFactorId && row.marketEmissionFactorId !== row.emissionFactorId ? row.marketEmissionFactorId : undefined,
      dataQualityScore: row.dataQualityScore ?? undefined,
      scope2Method: row.scope2Method ?? undefined,
      notes: row.notes ?? undefined,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setFieldErrors({});
    setForm((f) => ({ facilityId: f.facilityId, reportingPeriodId: f.reportingPeriodId }));
  }

  async function handleDelete(row: ActivityDataRow) {
    if (!window.confirm(`Delete "${row.sourceName}"? Any automatic entries calculated from it will also be removed.`)) return;
    setError(null);
    try {
      await api.delete(`/activity-data/${row.id}`);
      if (editingId === row.id) cancelEdit();
      await loadRows(row.reportingPeriodId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete the entry.');
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  if (periods.length === 0) {
    return (
      <div className="card max-w-lg">
        <p className="text-sm text-gray-600">
          No reporting periods exist yet. An Admin must create one under Admin → Reporting periods before data can be entered.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-medium">Activity data</h1>
            <p className="text-sm text-gray-500">Enter Scope 1, 2, or 3 activity data for a reporting period</p>
          </div>
          <div className="flex gap-2">
            <Link href="/activity-data/import" className="btn-secondary">Import from Excel / CSV</Link>
            <button
              type="button"
              className="btn-secondary"
              disabled={!form.reportingPeriodId}
              onClick={() =>
                api
                  .download(`/activity-data/export?reportingPeriodId=${form.reportingPeriodId}`, 'activity-data.csv')
                  .catch((err) => setError(err instanceof ApiError ? err.message : 'Export failed.'))
              }
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {selectedPeriod && !periodIsEditable && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This period is <strong className="capitalize">{selectedPeriod.status}</strong>. Activity data is read-only after submission.
          </div>
        )}
        {editingId && (
          <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
            You are editing an existing entry. The old values are kept in the audit log.
          </div>
        )}
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {lastResult && (
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Saved — {Number(lastResult.emissionsKgco2e).toLocaleString()} kg CO2e ({Number(lastResult.emissionFactorValueUsed)}{' '}
            {lastResult.emissionFactorUnitUsed}, {lastResult.emissionFactorSourceUsed})
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label>Facility</label>
            <select
              value={form.facilityId ?? ''}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}
            >
              {facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>{fac.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Reporting period</label>
            <select
              value={form.reportingPeriodId ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                setForm((f) => ({ ...f, reportingPeriodId: id }));
                loadRows(id);
              }}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.year} ({p.status})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label>Category</label>
            <select
              value={form.categoryId ?? ''}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: Number(e.target.value) }))}
            >
              <option value="">Select a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Source name</label>
            <input
              type="text"
              placeholder="e.g. Backup generator"
              value={form.sourceName ?? ''}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, sourceName: e.target.value }))}
            />
            {fieldErrors.sourceName && <p className="mt-1 text-xs text-red-600">{fieldErrors.sourceName}</p>}
          </div>
        </div>

        <div>
          <label>Emission factor</label>
          <select
            value={form.emissionFactorId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, emissionFactorId: e.target.value || undefined }))}
            disabled={!periodIsEditable || !form.categoryId || categoryFactors.length === 0}
          >
            <option value="">{categoryFactors.length ? 'Select an emission factor…' : 'No factor configured yet'}</option>
            {categoryFactors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.factorName} ({factor.validYear})
              </option>
            ))}
          </select>
          {fieldErrors.emissionFactorId && <p className="mt-1 text-xs text-red-600">{fieldErrors.emissionFactorId}</p>}
          {selectedFactor && (
            <p className="mt-1 text-xs text-gray-500">
              {selectedFactor.value} {selectedFactor.unit} · {selectedFactor.isReviewed ? 'Reviewed' : 'Default'} · {selectedFactor.source}
            </p>
          )}
        </div>

        {selectedCategory?.scope === 'scope_2' && (
          <div>
            <label>Method</label>
            <select
              value={form.scope2Method ?? 'location_based'}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, scope2Method: e.target.value as 'location_based' | 'market_based' }))}
            >
              <option value="location_based">Location-based</option>
              <option value="market_based">Market-based (requires a qualifying REC/PPA/green tariff)</option>
            </select>
          </div>
        )}

        {selectedCategory?.scope === 'scope_2' && (
          <div>
            <label>Contractual instrument for the market-based result (optional)</label>
            <select
              value={form.marketEmissionFactorId ?? ''}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, marketEmissionFactorId: e.target.value || undefined }))}
            >
              <option value="">None — use the grid average</option>
              {categoryFactors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.factorName} ({factor.validYear}) — {factor.value} {factor.unit}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Choose a supplier-specific rate, renewable energy certificate or green tariff if you have one. Both the
              location-based and market-based results are saved.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label>Fuel / material type</label>
            <input
              type="text"
              placeholder="e.g. Diesel"
              value={form.fuelOrMaterialType ?? ''}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, fuelOrMaterialType: e.target.value }))}
            />
          </div>
          <div>
            <label>Quantity</label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.quantity ?? ''}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value === '' ? undefined : Number(e.target.value) }))}
            />
            {fieldErrors.quantity && <p className="mt-1 text-xs text-red-600">{fieldErrors.quantity}</p>}
          </div>
          <div>
            <label>Unit</label>
            <input
              type="text"
              list="unit-suggestions"
              placeholder="litres, kWh, kg…"
              value={form.unit ?? ''}
              disabled={!periodIsEditable}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
            {fieldErrors.unit && <p className="mt-1 text-xs text-red-600">{fieldErrors.unit}</p>}
            <datalist id="unit-suggestions">
              {(UNIT_SUGGESTIONS[selectedCategory?.name ?? ''] ?? []).map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>

        {estimatedKgCo2e !== null && (
          <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
            Estimated emissions: <strong>{estimatedKgCo2e.toLocaleString(undefined, { maximumFractionDigits: 4 })} kgCO2e</strong>
            {' '}({(estimatedKgCo2e / 1000).toLocaleString(undefined, { maximumFractionDigits: 4 })} tCO2e)
            <span className="block text-xs text-gray-500">
              Estimate assumes the quantity is in the factor&apos;s unit. When saved, other units (e.g. MWh, gallons) are converted automatically.
            </span>
          </div>
        )}

        <div>
          <label>Data quality</label>
          <select
            value={form.dataQualityScore ?? ''}
            disabled={!periodIsEditable}
            onChange={(e) => setForm((f) => ({ ...f, dataQualityScore: e.target.value ? Number(e.target.value) : undefined }))}
          >
            <option value="">Not scored yet</option>
            {[1, 2, 3, 4, 5].map((q) => (
              <option key={q} value={q}>{DATA_QUALITY_LABELS[q]}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">How reliable is this number? Verifiers use this to decide what to check first.</p>
        </div>

        <div>
          <label>Notes</label>
          <textarea
            rows={2}
            value={form.notes ?? ''}
            disabled={!periodIsEditable}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div>
          <label>Audit evidence (optional)</label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.csv,.xls,.xlsx"
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            disabled={!periodIsEditable}
            className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Fuel receipts, delivery notes, or utility bills — PDF, image, or spreadsheet, up to 15MB</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingId && (
            <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={submitting}>
              Cancel edit
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={submitting || !periodIsEditable}>
            {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Submit entry'}
          </button>
        </div>
      </form>

      <div className="card">
        <p className="mb-3 text-sm font-medium">Entries for this period</p>
        {loadingRows ? (
          <p className="text-sm text-gray-400">Loading entries…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase text-gray-400">
                <th className="py-2 font-normal">Source</th>
                <th className="py-2 font-normal">Category</th>
                <th className="py-2 font-normal">Quantity</th>
                <th className="py-2 font-normal">Quality</th>
                <th className="py-2 text-right font-normal">tCO2e</th>
                <th className="py-2 text-right font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2">{r.sourceName}</td>
                  <td className="py-2 text-gray-500">{r.category.name}</td>
                  <td className="py-2 text-gray-500">{Number(r.quantity).toLocaleString()} {r.unit}</td>
                  <td className="py-2 text-gray-500" title={r.dataQualityScore ? DATA_QUALITY_LABELS[r.dataQualityScore] : 'Not scored yet'}>
                    {r.dataQualityScore ?? '—'}
                  </td>
                  <td className="py-2 text-right">
                    {Number(r.emissionsTco2e).toFixed(4)}
                    {r.marketEmissionsTco2e != null && Number(r.marketEmissionsTco2e) !== Number(r.emissionsTco2e) && (
                      <span className="block text-xs text-gray-400">market-based {Number(r.marketEmissionsTco2e).toFixed(4)}</span>
                    )}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {r.sourceActivityDataId ? (
                      <span className="text-xs text-gray-400" title="Calculated automatically from a Scope 1 or Scope 2 entry">
                        Automatic
                      </span>
                    ) : periodIsEditable ? (
                      <>
                        <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button type="button" className="ml-3 text-xs text-red-700 hover:underline" onClick={() => handleDelete(r)}>
                          Delete
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
