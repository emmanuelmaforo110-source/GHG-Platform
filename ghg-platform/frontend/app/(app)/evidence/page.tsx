'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ActivityDataRow, Attachment, Facility, ReportingPeriod } from '@/lib/types';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.csv,.xls,.xlsx';

function size(bytes: number | null) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function EvidencePage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'data_entry');

  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<ActivityDataRow[]>([]);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadRows(id: string) {
    if (!id) return;
    const list = await api.get<ActivityDataRow[]>(`/activity-data?reportingPeriodId=${id}`);
    // Automatic rows (e.g. upstream fuel emissions) share the evidence of the entry they come from.
    setRows(list.filter((r) => !r.sourceActivityDataId));
  }

  useEffect(() => {
    (async () => {
      try {
        const [p, f] = await Promise.all([
          api.get<ReportingPeriod[]>('/reporting-periods'),
          api.get<Facility[]>('/facilities?includeInactive=true'),
        ]);
        setPeriods(p);
        setFacilities(f);
        const fromUrl = new URLSearchParams(window.location.search).get('period');
        const first = p.find((x) => x.id === fromUrl)?.id ?? p[0]?.id ?? '';
        setPeriodId(first);
        await loadRows(first);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load evidence.');
      }
    })();
  }, []);

  const period = periods.find((p) => p.id === periodId);
  const editable = canEdit && period?.status === 'draft';
  const withEvidence = rows.filter((r) => (r.attachments ?? []).length > 0).length;
  const shown = onlyMissing ? rows.filter((r) => (r.attachments ?? []).length === 0) : rows;
  const facilityName = (id: string) => facilities.find((f) => f.id === id)?.name ?? '';

  async function run(key: string, fn: () => Promise<unknown>, reload = true) {
    setError(null);
    setBusyId(key);
    try {
      await fn();
      if (reload) await loadRows(periodId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  function upload(row: ActivityDataRow, file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    run(`up-${row.id}`, () => api.post(`/activity-data/${row.id}/attachments`, fd));
  }

  function remove(row: ActivityDataRow, a: Attachment) {
    if (!window.confirm(`Remove "${a.fileName}" from "${row.sourceName}"?`)) return;
    run(a.id, () => api.delete(`/activity-data/${row.id}/attachments/${a.id}`));
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Evidence</h1>
        <p className="text-sm text-gray-500">
          The bills, receipts and reports behind each number. Auditors and verifiers use this page to check the source of every entry.
          Files can be added or removed while the period is a draft; after that they are kept as they are.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label>Reporting period</label>
            <select value={periodId} onChange={(e) => { setPeriodId(e.target.value); loadRows(e.target.value).catch(() => undefined); }}>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.year} ({p.status})</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Only entries without evidence
          </label>
        </div>
        {rows.length > 0 && (
          <p className="text-sm">
            <b>{withEvidence}</b> of {rows.length} entries have evidence
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${withEvidence === rows.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
              {Math.round((withEvidence / rows.length) * 100)}%
            </span>
          </p>
        )}
      </div>

      <div className="card">
        {periods.length === 0 && <p className="text-sm text-gray-400">No reporting periods yet.</p>}
        {periodId && shown.length === 0 && (
          <p className="text-sm text-gray-400">{onlyMissing && rows.length > 0 ? 'Every entry has evidence.' : 'No entries in this period.'}</p>
        )}
        <div className="divide-y divide-gray-100">
          {shown.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{r.sourceName}</p>
                <p className="text-xs text-gray-500">
                  {r.category.name} · {facilityName(r.facilityId)} · {Number(r.quantity).toLocaleString()} {r.unit} · {Number(r.emissionsTco2e).toFixed(4)} tCO2e
                </p>
                {(r.attachments ?? []).length === 0 ? (
                  <p className="text-xs text-amber-700">No evidence attached</p>
                ) : (
                  <ul className="space-y-1">
                    {(r.attachments ?? []).map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 text-xs">
                        <button type="button" className="truncate text-blue-700 hover:underline" disabled={busyId === a.id}
                          onClick={() => run(a.id, () => api.download(`/activity-data/${r.id}/attachments/${a.id}/download`, a.fileName), false)}>
                          {a.fileName}
                        </button>
                        <span className="text-gray-400">{size(a.fileSizeBytes)} · {a.uploadedAt?.slice(0, 10)}</span>
                        {editable && (
                          <button type="button" className="text-red-700 hover:underline" onClick={() => remove(r, a)}>Remove</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {editable && (
                <label className="btn-secondary cursor-pointer whitespace-nowrap text-center">
                  {busyId === `up-${r.id}` ? 'Uploading…' : 'Add file'}
                  <input type="file" accept={ACCEPT} className="hidden" disabled={busyId === `up-${r.id}`}
                    onChange={(e) => { upload(r, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
