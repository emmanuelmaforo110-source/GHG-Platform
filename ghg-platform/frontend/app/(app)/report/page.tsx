'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { BOUNDARY_LABELS, InventoryReport, METHOD_LABELS, ReportingPeriod } from '@/lib/types';

const t = (n: number, dp = 2) => n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const SCOPE_NAME: Record<string, string> = { scope_1: 'Scope 1', scope_2: 'Scope 2', scope_3: 'Scope 3' };
const SCREEN_LABEL = {
  quantified: 'Quantified',
  included_not_quantified: 'Included, not yet quantified',
  excluded: 'Excluded',
  not_screened: 'Not screened',
} as const;

/**
 * Printable GHG inventory report, structured along the GHG Protocol Corporate Standard / ISO 14064-1
 * reporting requirements. Use the browser's Print → "Save as PDF" to produce a PDF.
 */
export default function ReportPage() {
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [report, setReport] = useState<InventoryReport | null>(null);
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

  useEffect(() => {
    if (!periodId) return;
    setReport(null);
    api
      .get<InventoryReport>(`/dashboard/report/${periodId}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the report.'));
  }, [periodId]);

  const s = report?.summary;
  const excluded = report?.scope3Screening.filter((c) => c.status === 'excluded') ?? [];
  const notScreened = report?.scope3Screening.filter((c) => c.status === 'not_screened') ?? [];

  return (
    <div className="max-w-4xl space-y-6 print:max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-lg font-medium">Inventory report</h1>
          <p className="text-sm text-gray-500">A complete greenhouse gas inventory report. Use “Print / Save as PDF” to share it.</p>
        </div>
        <div className="flex gap-2">
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-auto">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.year} — {p.status}</option>)}
          </select>
          <button type="button" className="btn-primary whitespace-nowrap" disabled={!report} onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!report && !error && periodId && <p className="text-sm text-gray-400">Preparing the report…</p>}

      {report && s && (
        <article className="card space-y-8 text-sm print:border-0 print:p-0">
          <header className="border-b border-gray-200 pb-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Greenhouse gas emissions inventory</p>
            <h2 className="text-2xl font-medium">{report.organization.name}</h2>
            <p className="text-gray-600">
              Reporting year {report.period.year}
              {report.period.isBaseYear && ' (base year)'} · Status: <span className="capitalize">{report.period.status}</span>
              {report.period.status === 'draft' && ' — preliminary figures'}
            </p>
            <p className="mt-1 text-xs text-gray-400">Generated {new Date(report.generatedAt).toLocaleString()}</p>
          </header>

          <section>
            <h3 className="mb-2 text-base font-medium">1. Summary</h3>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-1 font-normal">Scope</th>
                  <th className="py-1 text-right font-normal">tCO2e</th>
                  <th className="py-1 text-right font-normal">Share</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100"><td className="py-1">Scope 1 — direct emissions</td><td className="text-right">{t(s.totals.scope1Tco2e)}</td><td className="text-right">{t((s.shareOfTotal?.scope1 ?? 0) * 100, 0)}%</td></tr>
                <tr className="border-b border-gray-100"><td className="py-1">Scope 2 — purchased energy (location-based)</td><td className="text-right">{t(s.totals.scope2Tco2e)}</td><td className="text-right">{t((s.shareOfTotal?.scope2 ?? 0) * 100, 0)}%</td></tr>
                <tr className="border-b border-gray-100"><td className="py-1">Scope 3 — value chain (quantified categories)</td><td className="text-right">{t(s.totals.scope3Tco2e)}</td><td className="text-right">{t((s.shareOfTotal?.scope3 ?? 0) * 100, 0)}%</td></tr>
                <tr className="font-medium"><td className="py-1">Total</td><td className="text-right">{t(s.totals.totalTco2e)}</td><td className="text-right">100%</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-gray-600">
              Scope 2 market-based: {t(s.scope2.marketBasedTco2e)} tCO2e (total using market-based Scope 2: {t(s.scope2.totalMarketBasedTco2e)} tCO2e).
              {s.emissionsPerEmployee !== null && ` Intensity: ${t(s.emissionsPerEmployee)} tCO2e per employee (${report.period.staffFte} FTE).`}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-medium">2. Organisation, boundary and method</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <dt className="text-gray-500">Consolidation approach</dt><dd>{BOUNDARY_LABELS[report.period.boundaryApproach]}</dd>
              <dt className="text-gray-500">Facilities included</dt><dd>{report.facilities.filter((f) => f.isActive).map((f) => f.name).join(', ') || '—'}</dd>
              <dt className="text-gray-500">Base year</dt><dd>{report.period.isBaseYear ? `${report.period.year} (this year)` : 'See history below'}; recalculated if structural or method changes shift it by more than {report.period.recalculationThresholdPct}%</dd>
              <dt className="text-gray-500">Global warming potentials</dt><dd>{report.gwpValues.label}: CH4 = {report.gwpValues.ch4}, N2O = {report.gwpValues.n2o}</dd>
              <dt className="text-gray-500">Scope 2 methods</dt><dd>Location-based (headline) and market-based, per the GHG Protocol Scope 2 Guidance</dd>
              <dt className="text-gray-500">Standards followed</dt><dd>GHG Protocol Corporate Standard, Scope 2 Guidance and Scope 3 Standard; ISO 14064-1 structure</dd>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-base font-medium">3. Emissions by category</h3>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-1 font-normal">Scope</th><th className="py-1 font-normal">Category</th>
                  <th className="py-1 text-right font-normal">Entries</th><th className="py-1 text-right font-normal">tCO2e</th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.map((c) => (
                  <tr key={c.category} className="border-b border-gray-100">
                    <td className="py-1 text-gray-500">{SCOPE_NAME[c.scope]}</td><td>{c.category}</td>
                    <td className="text-right">{c.entries}</td><td className="text-right">{t(c.tco2e, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-2 text-base font-medium">4. Gases and calculation methods</h3>
            {report.byGas.shareOfEmissionsSplitByGas ? (
              <p>
                For {t(report.byGas.shareOfEmissionsSplitByGas * 100, 0)}% of emissions the factors are split by gas: CO2 {t(report.byGas.co2Tonnes, 3)} t,
                CH4 {t(report.byGas.ch4Tonnes, 4)} t, N2O {t(report.byGas.n2oTonnes, 4)} t. The remaining emissions use factors published in CO2e.
              </p>
            ) : (
              <p>All emission factors used this year are published in CO2e (not split by gas); results are reported in CO2e.</p>
            )}
            <ul className="mt-2 list-disc pl-5">
              {report.byMethod.filter((m) => m.tco2e > 0).map((m) => (
                <li key={m.method}>{METHOD_LABELS[m.method]}: {t(m.tco2e, 3)} tCO2e</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-base font-medium">5. Scope 3 categories: inclusion and exclusions</h3>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-1 font-normal">Category</th><th className="py-1 font-normal">Status</th>
                  <th className="py-1 font-normal">Reason</th><th className="py-1 text-right font-normal">tCO2e</th>
                </tr>
              </thead>
              <tbody>
                {report.scope3Screening.map((c) => (
                  <tr key={c.category} className="border-b border-gray-100 align-top">
                    <td className="py-1">{c.category}</td>
                    <td className="py-1">{SCREEN_LABEL[c.status]}</td>
                    <td className="py-1 text-xs text-gray-600">{c.reason ?? ''}</td>
                    <td className="py-1 text-right">{c.tco2e > 0 ? t(c.tco2e, 3) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(excluded.length > 0 || notScreened.length > 0) && (
              <p className="mt-2 text-xs text-gray-500">
                {excluded.length} categories excluded with a documented reason{notScreened.length > 0 && `; ${notScreened.length} not yet screened`}.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-base font-medium">6. Data quality</h3>
            <p>
              Emissions-weighted data quality score (1 = metered or supplier-verified … 5 = rough estimate):{' '}
              {s.dataQuality.overall.weightedScore !== null ? s.dataQuality.overall.weightedScore.toFixed(1) : 'not scored'}
              {s.dataQuality.overall.scoredShare !== null && s.dataQuality.overall.scoredShare < 1 &&
                ` (covering ${t(s.dataQuality.overall.scoredShare * 100, 0)}% of emissions)`}.
              {' '}By scope: Scope 1 {s.dataQuality.scope1.weightedScore ?? '—'}, Scope 2 {s.dataQuality.scope2.weightedScore ?? '—'}, Scope 3 {s.dataQuality.scope3.weightedScore ?? '—'}.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-medium">7. Emission factors used</h3>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-1 font-normal">Factor</th><th className="py-1 font-normal">Value</th>
                  <th className="py-1 font-normal">Source</th><th className="py-1 text-right font-normal">Entries</th>
                </tr>
              </thead>
              <tbody>
                {report.factorsUsed.map((f) => (
                  <tr key={`${f.name}-${f.source}`} className="border-b border-gray-100 align-top">
                    <td className="py-1">{f.name}{f.year ? ` (${f.year})` : ''}</td>
                    <td className="py-1 whitespace-nowrap">{f.value} {f.unit}</td>
                    <td className="py-1 text-xs text-gray-600">{f.source}</td>
                    <td className="py-1 text-right">{f.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {report.history.length > 1 && (
            <section>
              <h3 className="mb-2 text-base font-medium">8. Year-on-year</h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="py-1 font-normal">Year</th><th className="py-1 text-right font-normal">Scope 1</th>
                    <th className="py-1 text-right font-normal">Scope 2</th><th className="py-1 text-right font-normal">Scope 3</th>
                    <th className="py-1 text-right font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.history.map((h) => (
                    <tr key={h.year} className="border-b border-gray-100">
                      <td className="py-1">{h.year}{h.isBaseYear ? ' (base)' : ''}</td>
                      <td className="text-right">{t(h.scope1Tco2e)}</td><td className="text-right">{t(h.scope2Tco2e)}</td>
                      <td className="text-right">{t(h.scope3Tco2e)}</td><td className="text-right">{t(h.totalTco2e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-base font-medium">{report.history.length > 1 ? '9' : '8'}. Review and approval</h3>
            <p>
              Submitted by {report.period.submittedBy ?? '—'} on {date(report.period.submittedAt)}; approved by{' '}
              {report.period.approvedBy ?? '—'} on {date(report.period.approvedAt)}. Every change to the data is recorded in the
              platform&apos;s audit log, and supporting evidence is attached to individual entries.
            </p>
          </section>
        </article>
      )}
    </div>
  );
}
