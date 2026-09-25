'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ImportResult, ReportingPeriod } from '@/lib/types';

/**
 * Bulk import of activity data from a CSV file. Step 1 checks and calculates every row without
 * saving anything; step 2 saves them, and only if every row is valid.
 */
export default function ImportActivityDataPage() {
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ReportingPeriod[]>('/reporting-periods')
      .then((res) => {
        const drafts = res.filter((p) => p.status === 'draft');
        setPeriods(drafts);
        if (drafts.length) setPeriodId(drafts[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load reporting periods.'));
  }, []);

  async function send(commit: boolean) {
    if (!file || !periodId) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<ImportResult>(
        `/activity-data/import?reportingPeriodId=${periodId}&commit=${commit ? 'true' : 'false'}`,
        fd,
      );
      if (commit && res.committed) {
        setDone(res);
        setPreview(null);
        setFile(null);
      } else {
        setPreview(res);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The file could not be processed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/activity-data" className="text-sm text-blue-700 hover:underline">← Activity data</Link>
        <h1 className="mt-1 text-lg font-medium">Import activity data</h1>
        <p className="text-sm text-gray-500">
          Fill in the template in Excel, choose <strong>File → Save as → CSV (comma delimited)</strong>, then upload it here.
          Nothing is saved until you have checked the preview.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {done && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Imported {done.created} entries ({done.summary.totalTco2e.toLocaleString(undefined, { maximumFractionDigits: 4 })} tCO2e,
          plus any automatic fuel and grid-loss entries). <Link href="/activity-data" className="underline">View entries</Link>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label>1. Download the template</label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                api
                  .download('/activity-data/import/template', 'activity-data-import-template.csv')
                  .catch((err) => setError(err instanceof ApiError ? err.message : 'Download failed.'))
              }
            >
              Download CSV template
            </button>
            <p className="mt-1 text-xs text-gray-400">
              Required columns: category, source_name, quantity, unit. Names must match the categories, facilities and
              emission factors in the system (partial names work when they are unique).
            </p>
          </div>
          <div>
            <label>2. Reporting period</label>
            <select value={periodId} onChange={(e) => { setPeriodId(e.target.value); setPreview(null); }}>
              {periods.length === 0 && <option value="">No open (draft) periods</option>}
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.year}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label>3. Choose your CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); }}
            className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={!file || !periodId || busy} onClick={() => send(false)}>
            {busy && !preview ? 'Checking…' : '4. Check file'}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!preview || preview.summary.invalid > 0 || preview.summary.valid === 0 || busy}
            onClick={() => send(true)}
          >
            {busy && preview ? 'Importing…' : `5. Import ${preview?.summary.valid ?? ''} entries`}
          </button>
        </div>
      </div>

      {preview && (
        <div className="card">
          <p className="mb-1 text-sm font-medium">
            Preview: {preview.summary.valid} of {preview.summary.rows} rows ready
            {preview.summary.invalid > 0 && <span className="text-red-700"> — fix {preview.summary.invalid} row(s) and check again</span>}
          </p>
          <p className="mb-3 text-xs text-gray-500">
            Total of the valid rows: {preview.summary.totalTco2e.toLocaleString(undefined, { maximumFractionDigits: 4 })} tCO2e
            (automatic upstream fuel and grid-loss entries are added when you import).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase text-gray-400">
                  <th className="py-2 font-normal">Line</th>
                  <th className="py-2 font-normal">Source</th>
                  <th className="py-2 font-normal">Category</th>
                  <th className="py-2 font-normal">Quantity</th>
                  <th className="py-2 font-normal">Emission factor</th>
                  <th className="py-2 text-right font-normal">tCO2e</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={`border-b border-gray-50 ${r.ok ? '' : 'bg-red-50'}`}>
                    <td className="py-2 text-gray-400">{r.line}</td>
                    <td className="py-2">{r.sourceName}</td>
                    <td className="py-2 text-gray-500">{r.category}</td>
                    <td className="py-2 text-gray-500">{r.quantity !== undefined && Number.isFinite(r.quantity) ? `${r.quantity.toLocaleString()} ${r.unit ?? ''}` : ''}</td>
                    <td className="py-2 text-gray-500">
                      {r.ok ? r.emissionFactor : <span className="text-red-700">{r.errors.join(' ')}</span>}
                    </td>
                    <td className="py-2 text-right">{r.ok ? r.emissionsTco2e?.toFixed(4) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
