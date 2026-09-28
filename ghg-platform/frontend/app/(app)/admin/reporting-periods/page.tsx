'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { BOUNDARY_LABELS, BoundaryApproach, GwpSet, ReportingPeriod } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  locked: 'bg-gray-800 text-white',
};

const day = (d?: string | null) => (d ? d.slice(0, 10) : '');

export default function ReportingPeriodsPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [staffFte, setStaffFte] = useState<number | ''>('');
  const [gwpSet, setGwpSet] = useState<GwpSet>('AR6');
  const [boundary, setBoundary] = useState<BoundaryApproach>('operational_control');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setPeriods(await api.get<ReportingPeriod[]>('/reporting-periods'));
  }
  useEffect(() => { load(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/reporting-periods', {
        year,
        staffFte: staffFte === '' ? undefined : Number(staffFte),
        gwpSet,
        boundaryApproach: boundary,
      });
      setStaffFte('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the reporting period.');
    }
  }

  async function changeGwp(p: ReportingPeriod, next: GwpSet) {
    if (!window.confirm(`Switch ${p.year} to ${next}? Every entry in this period will be recalculated with the ${next} warming values.`)) return;
    setBusyId(p.id);
    setError(null);
    try {
      const res = await api.patch<{ recalculatedEntries: number }>(`/reporting-periods/${p.id}`, { gwpSet: next });
      setNotice(`${p.year} now uses ${next}; ${res.recalculatedEntries} entries were recalculated.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change the GWP set.');
    } finally {
      setBusyId(null);
    }
  }

  async function submit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/reporting-periods/${id}/submit`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit.');
    } finally {
      setBusyId(null);
    }
  }

  async function sendBack(p: ReportingPeriod) {
    const reason = window.prompt(`What needs correcting in ${p.year}? This note is shown to the person who submitted it.`);
    if (reason === null) return;
    if (reason.trim().length < 5) {
      setError('Please write a short reason (at least 5 characters).');
      return;
    }
    setBusyId(p.id);
    setError(null);
    try {
      await api.patch(`/reporting-periods/${p.id}/return`, { reason });
      setNotice(`${p.year} was sent back to draft for corrections.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send the period back.');
    } finally {
      setBusyId(null);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await api.patch<{ recalculationCheck: { requiresRecalculation: boolean; percentChange: number | null } | null }>(
        `/reporting-periods/${id}/approve`,
      );
      if (res.recalculationCheck?.requiresRecalculation) {
        setError(
          `Approved — but this period's total has shifted ${res.recalculationCheck.percentChange?.toFixed(1)}% from the base year, above the recalculation threshold. Consider a base-year recalculation per GHG Protocol Chapter 5.`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to approve.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Reporting periods</h1>
        <p className="text-sm text-gray-500">
          Draft → submitted → approved, per year. The person who submits a period cannot approve it: a second Admin checks and
          approves, or sends it back to draft with a note.
        </p>
      </div>

      {error && <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div>}
      {notice && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      {isAdmin && (
      <form onSubmit={handleCreate} className="card flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
        <div>
          <label>Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        </div>
        <div>
          <label>Staff (FTE)</label>
          <input
            type="number"
            value={staffFte}
            onChange={(e) => setStaffFte(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-28"
            placeholder="12"
          />
        </div>
        <div>
          <label>Boundary</label>
          <select value={boundary} onChange={(e) => setBoundary(e.target.value as BoundaryApproach)}>
            {Object.entries(BOUNDARY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label title="Global Warming Potential values used to convert methane and nitrous oxide to CO2e">GWP values</label>
          <select value={gwpSet} onChange={(e) => setGwpSet(e.target.value as GwpSet)}>
            <option value="AR6">IPCC AR6 (current)</option>
            <option value="AR5">IPCC AR5</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">Create period</button>
      </form>
      )}

      <div className="card divide-y divide-gray-100">
        {periods.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                {p.year} {p.isBaseYear && <span className="ml-1 text-xs text-gray-400">(base year)</span>}
              </p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLES[p.status]}`}>
                {p.status}
              </span>
              <p className="mt-1 text-xs text-gray-500">
                {p.boundaryApproach ? BOUNDARY_LABELS[p.boundaryApproach] : ''} · GWP{' '}
                {p.status === 'draft' && isAdmin ? (
                  <select
                    className="ml-1 inline-block w-auto px-2 py-0.5 text-xs"
                    value={p.gwpSet ?? 'AR6'}
                    disabled={busyId === p.id}
                    onChange={(e) => changeGwp(p, e.target.value as GwpSet)}
                  >
                    <option value="AR6">AR6</option>
                    <option value="AR5">AR5</option>
                  </select>
                ) : (
                  p.gwpSet ?? 'AR6'
                )}
              </p>
              {p.submittedAt && (
                <p className="mt-1 text-xs text-gray-500">Submitted by {p.submittedByName ?? 'unknown'} on {day(p.submittedAt)}</p>
              )}
              {p.approvedAt && p.status !== 'draft' && p.status !== 'submitted' && (
                <p className="mt-1 text-xs text-gray-500">Approved by {p.approvedByName ?? 'unknown'} on {day(p.approvedAt)}</p>
              )}
              {p.status === 'draft' && p.returnReason && (
                <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Sent back by {p.returnedByName ?? 'an Admin'} on {day(p.returnedAt)}: {p.returnReason}
                </p>
              )}
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
            <div className="flex gap-2">
              {p.status === 'draft' && (
                <button className="btn-secondary" disabled={busyId === p.id} onClick={() => submit(p.id)}>
                  Submit
                </button>
              )}
              {p.status === 'submitted' && isAdmin && (
                <>
                  <button className="btn-secondary" disabled={busyId === p.id} onClick={() => sendBack(p)}>
                    Send back
                  </button>
                  <button
                    className="btn-primary"
                    disabled={busyId === p.id || p.submittedBy === user?.id}
                    title={p.submittedBy === user?.id ? 'You submitted this period, so another Admin must approve it' : undefined}
                    onClick={() => approve(p.id)}
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
            {p.status === 'submitted' && isAdmin && p.submittedBy === user?.id && (
              <p className="text-xs text-gray-500">You submitted this — another Admin must approve it.</p>
            )}
            </div>
          </div>
        ))}
        {periods.length === 0 && <p className="py-3 text-sm text-gray-400">No reporting periods yet.</p>}
      </div>
    </div>
  );
}
