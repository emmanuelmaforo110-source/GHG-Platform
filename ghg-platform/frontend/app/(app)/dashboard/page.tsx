'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { api, ApiError } from '@/lib/api';
import { DashboardSummary, PeriodOverPeriodRow, ReportingPeriod, Scope3CompletenessRow } from '@/lib/types';
import { MetricCard } from '@/components/MetricCard';

const SCOPE_COLORS = { scope1: '#2a78d6', scope2: '#eb6834', scope3: '#1baf7a' };

export default function DashboardPage() {
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [history, setHistory] = useState<PeriodOverPeriodRow[]>([]);
  const [completeness, setCompleteness] = useState<Scope3CompletenessRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [periodsRes, historyRes] = await Promise.all([
          api.get<ReportingPeriod[]>('/reporting-periods'),
          api.get<PeriodOverPeriodRow[]>('/dashboard/period-over-period'),
        ]);
        setPeriods(periodsRes);
        setHistory(historyRes);
        if (periodsRes.length > 0) setSelectedPeriodId(periodsRes[0].id);
        else setLoading(false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load reporting periods.');
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [summaryRes, completenessRes] = await Promise.all([
          api.get<DashboardSummary>(`/dashboard/summary/${selectedPeriodId}`),
          api.get<Scope3CompletenessRow[]>(`/dashboard/scope3-completeness/${selectedPeriodId}`),
        ]);
        if (active) {
          setSummary(summaryRes);
          setCompleteness(completenessRes);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : 'Failed to load dashboard data.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedPeriodId]);

  const pieData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'Scope 1', value: summary.totals.scope1Tco2e, color: SCOPE_COLORS.scope1 },
      { name: 'Scope 2', value: summary.totals.scope2Tco2e, color: SCOPE_COLORS.scope2 },
      { name: 'Scope 3', value: summary.totals.scope3Tco2e, color: SCOPE_COLORS.scope3 },
    ];
  }, [summary]);

  if (periods.length === 0 && !loading) {
    return (
      <div className="card max-w-lg">
        <p className="text-sm text-gray-600">
          No reporting periods yet. An Admin needs to create one under{' '}
          <span className="font-medium">Admin → Reporting periods</span> before any data can be entered.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-medium">Emissions dashboard</h1>
          <p className="text-sm text-gray-500">Scope 1, 2 & 3 totals for the selected reporting period</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          className="btn-secondary whitespace-nowrap"
          disabled={!selectedPeriodId}
          onClick={() =>
            api
              .download(`/activity-data/export?reportingPeriodId=${selectedPeriodId}`, 'activity-data.csv')
              .catch((err) => setError(err instanceof ApiError ? err.message : 'Export failed.'))
          }
        >
          Export CSV
        </button>
        <select
          value={selectedPeriodId}
          onChange={(e) => setSelectedPeriodId(e.target.value)}
          className="w-full sm:w-auto"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.year} {p.isBaseYear ? '(base year)' : ''} — {p.status}
            </option>
          ))}
        </select>
        </div>
      </div>

      {summary && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-gray-100 px-3 py-1 capitalize text-gray-700">{summary.reportingPeriod.status}</span>
          {summary.reportingPeriod.isBaseYear && <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Base year</span>}
          <span className="text-gray-500">
            {summary.reportingPeriod.status === 'draft' ? 'Preliminary totals; data entry is still open.' : 'Totals are read-only for this period.'}
          </span>
        </div>
      )}

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Scope 1" value={summary.totals.scope1Tco2e.toFixed(2)} unit={`tCO2e · ${((summary.shareOfTotal?.scope1 ?? 0) * 100).toFixed(0)}%`} />
            <MetricCard label="Scope 2" value={summary.totals.scope2Tco2e.toFixed(2)} unit={`tCO2e · ${((summary.shareOfTotal?.scope2 ?? 0) * 100).toFixed(0)}%`} />
            <MetricCard label="Scope 3" value={summary.totals.scope3Tco2e.toFixed(2)} unit={`tCO2e · ${((summary.shareOfTotal?.scope3 ?? 0) * 100).toFixed(0)}%`} />
            <MetricCard label="Total" value={summary.totals.totalTco2e.toFixed(2)} unit="tCO2e" accent />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card">
              <p className="text-sm font-medium">Scope 2 — both methods</p>
              <p className="mb-2 text-xs text-gray-500">
                The headline uses the location-based result (grid average). The market-based result uses your electricity
                contracts or certificates where recorded.
              </p>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Location-based</span><span>{summary.scope2.locationBasedTco2e.toFixed(2)} tCO2e</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Market-based</span><span>{summary.scope2.marketBasedTco2e.toFixed(2)} tCO2e</span></div>
              <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 text-sm"><span className="text-gray-600">Total using market-based Scope 2</span><span>{summary.scope2.totalMarketBasedTco2e.toFixed(2)} tCO2e</span></div>
            </div>
            <div className="card">
              <p className="text-sm font-medium">Data quality</p>
              <p className="mb-2 text-xs text-gray-500">Emissions-weighted score: 1 = metered or supplier-verified, 5 = rough estimate.</p>
              {(['overall', 'scope1', 'scope2', 'scope3'] as const).map((key) => {
                const q = summary.dataQuality[key];
                return (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-600">{key === 'overall' ? 'All scopes' : key.replace('scope', 'Scope ')}</span>
                    <span>
                      {q.weightedScore !== null ? q.weightedScore.toFixed(1) : 'Not scored'}
                      {q.scoredShare !== null && q.scoredShare < 1 && (
                        <span className="ml-1 text-xs text-gray-400">({Math.round(q.scoredShare * 100)}% of emissions scored)</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {summary.emissionsPerEmployee !== null && (
            <p className="text-sm text-gray-500">
              {summary.emissionsPerEmployee.toFixed(2)} tCO2e per employee (FTE) — {summary.largestScope?.replace('_', ' ')} is the largest contributor
            </p>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="card">
              <p className="mb-3 text-sm font-medium">Year-over-year, by scope</p>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e1e0d9" />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} label={{ value: 'tCO2e', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)} tCO2e`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="scope1Tco2e" stackId="a" fill={SCOPE_COLORS.scope1} name="Scope 1" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="scope2Tco2e" stackId="a" fill={SCOPE_COLORS.scope2} name="Scope 2" />
                    <Bar dataKey="scope3Tco2e" stackId="a" fill={SCOPE_COLORS.scope3} name="Scope 3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <p className="mb-3 text-sm font-medium">Share of {summary.reportingPeriod.year} total</p>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)} tCO2e`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="mb-3 text-sm font-medium">Emissions by activity</p>
            <div className="space-y-2">
              {summary.byActivity.map((a, index) => (
                <div key={`${a.sourceName}-${a.scope}-${index}`} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm text-gray-600">{a.sourceName}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (a.tco2e / (summary.totals.totalTco2e || 1)) * 100)}%`,
                        backgroundColor: SCOPE_COLORS[a.scope.replace('scope_', 'scope') as keyof typeof SCOPE_COLORS],
                      }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm text-gray-500">{a.tco2e.toFixed(2)} t</span>
                </div>
              ))}
            </div>
          </div>

          {completeness.length > 0 && (
            <div className="card">
              <p className="mb-1 text-sm font-medium">Scope 3 completeness</p>
              <p className="mb-3 text-xs text-gray-500">
                Per GHG Protocol transparency requirements — which Scope 3 categories are quantified, included but not yet quantified, or screened out and why.
              </p>
              <div className="divide-y divide-gray-100">
                {completeness.map((c) => (
                  <div key={c.category} className="flex items-start justify-between gap-4 py-2">
                    <div>
                      <p className="text-sm">{c.category}</p>
                      <p className="text-xs text-gray-500">{c.relevanceAssessment}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        c.isQuantified
                          ? 'bg-green-100 text-green-700'
                          : c.isIncluded
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.isQuantified ? 'Quantified' : c.isIncluded ? 'Included, pending' : 'Excluded'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
