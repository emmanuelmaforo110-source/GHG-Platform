'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  Article6Status, CcpPrinciple, ClaimCheck, CREDIT_KIND_LABELS, CreditKind, CreditLotRow, CreditRegistry, REGISTRY_LABELS,
  RemovalRow, RemovalType, TzProjectRow, TzRegistrationStatus,
} from '@/lib/types';

type Tab = 'claim' | 'credits' | 'removals' | 'tanzania';
const TABS: { key: Tab; label: string }[] = [
  { key: 'claim', label: 'Claim check' },
  { key: 'credits', label: 'Carbon credits' },
  { key: 'removals', label: 'Removals' },
  { key: 'tanzania', label: 'Tanzanian projects' },
];

const num = (n: number | string | null | undefined, dp = 2) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
const optNum = (v: string) => (v === '' ? undefined : Number(v));
const optStr = (v: string) => (v.trim() === '' ? undefined : v.trim());
const thisYear = new Date().getFullYear();

const TIER_STYLE: Record<string, string> = {
  silver: 'bg-gray-100 text-gray-700',
  gold: 'bg-amber-100 text-amber-800',
  platinum: 'bg-indigo-100 text-indigo-800',
};

const emptyLot = {
  projectName: '', registry: 'gold_standard' as CreditRegistry, registryProjectId: '', methodology: '',
  kind: 'avoidance_reduction' as CreditKind, country: '', vintageYear: String(thisYear - 1), serialRange: '',
  quantityTco2e: '', ccpLabelled: false, article6Authorized: false, correspondingAdjustment: false,
  dueDiligence: {} as Record<string, boolean>, purchaseDate: '', pricePerTonne: '', currency: 'USD', tzProjectId: '', notes: '',
};
const emptyRetire = { quantityTco2e: '', retiredOn: new Date().toISOString().slice(0, 10), claimYear: String(thisYear), beneficiary: '', retirementReference: '', evidenceUrl: '' };
const emptyRemoval = {
  projectName: '', removalType: 'nature' as RemovalType, method: '', location: '', reportingYear: String(thisYear),
  removedTco2e: '', reversalsTco2e: '0', storageYears: '', reversalRiskPct: '', monitoringPlan: '', inValueChain: true, notes: '',
};
const emptyTz = {
  name: '', projectType: '', isReddPlus: false, region: '', district: '', proponent: '',
  registrationStatus: 'concept' as TzRegistrationStatus, registrationNumber: '', ndcAlignment: '',
  communitySharePct: '', localGovernmentSharePct: '', nationalSharePct: '', otherSharePct: '', benefitSharingNote: '',
  article6Status: 'not_applicable' as Article6Status, expectedAnnualCredits: '', notes: '',
};

export default function OffsetsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const canEdit = hasRole('admin', 'data_entry');

  const [tab, setTab] = useState<Tab>('claim');
  const [error, setError] = useState<string | null>(null);
  const [principles, setPrinciples] = useState<CcpPrinciple[]>([]);
  const [lots, setLots] = useState<CreditLotRow[]>([]);
  const [removals, setRemovals] = useState<RemovalRow[]>([]);
  const [projects, setProjects] = useState<TzProjectRow[]>([]);
  const [claimYear, setClaimYear] = useState(String(thisYear));
  const [claim, setClaim] = useState<ClaimCheck | null>(null);

  const [lotForm, setLotForm] = useState(emptyLot);
  const [lotEditId, setLotEditId] = useState<string | null>(null);
  const [showLotForm, setShowLotForm] = useState(false);
  const [retireFor, setRetireFor] = useState<string | null>(null);
  const [retireForm, setRetireForm] = useState(emptyRetire);
  const [removalForm, setRemovalForm] = useState(emptyRemoval);
  const [removalEditId, setRemovalEditId] = useState<string | null>(null);
  const [showRemovalForm, setShowRemovalForm] = useState(false);
  const [tzForm, setTzForm] = useState(emptyTz);
  const [tzEditId, setTzEditId] = useState<string | null>(null);
  const [showTzForm, setShowTzForm] = useState(false);

  async function loadClaim(year = claimYear) {
    if (!year) return;
    setClaim(await api.get<ClaimCheck>(`/offsets/claims/${Number(year)}`));
  }

  async function load() {
    const [l, r, p] = await Promise.all([
      api.get<CreditLotRow[]>('/offsets/credits'),
      api.get<RemovalRow[]>('/offsets/removals'),
      api.get<TzProjectRow[]>('/offsets/tz-projects'),
    ]);
    setLots(l);
    setRemovals(r);
    setProjects(p);
    await loadClaim();
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load.'));
    api.get<CcpPrinciple[]>('/offsets/ccp-principles').then(setPrinciples).catch(() => undefined);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      return false;
    }
  };

  // ---------------- Credits ----------------
  async function saveLot(e: FormEvent) {
    e.preventDefault();
    const body = {
      projectName: lotForm.projectName,
      registry: lotForm.registry,
      registryProjectId: optStr(lotForm.registryProjectId),
      methodology: optStr(lotForm.methodology),
      kind: lotForm.kind,
      country: optStr(lotForm.country),
      vintageYear: Number(lotForm.vintageYear),
      serialRange: optStr(lotForm.serialRange),
      quantityTco2e: Number(lotForm.quantityTco2e),
      ccpLabelled: lotForm.ccpLabelled,
      article6Authorized: lotForm.article6Authorized,
      correspondingAdjustment: lotForm.correspondingAdjustment,
      dueDiligence: lotForm.dueDiligence,
      purchaseDate: optStr(lotForm.purchaseDate),
      pricePerTonne: optNum(lotForm.pricePerTonne),
      currency: optStr(lotForm.currency),
      tzProjectId: optStr(lotForm.tzProjectId),
      notes: optStr(lotForm.notes),
    };
    const ok = await run(() => (lotEditId ? api.patch(`/offsets/credits/${lotEditId}`, body) : api.post('/offsets/credits', body)));
    if (ok) {
      setLotForm(emptyLot);
      setLotEditId(null);
      setShowLotForm(false);
    }
  }

  function editLot(l: CreditLotRow) {
    setLotEditId(l.id);
    setShowLotForm(true);
    setLotForm({
      projectName: l.projectName, registry: l.registry, registryProjectId: l.registryProjectId ?? '', methodology: l.methodology ?? '',
      kind: l.kind, country: l.country ?? '', vintageYear: String(l.vintageYear), serialRange: l.serialRange ?? '',
      quantityTco2e: String(Number(l.quantityTco2e)), ccpLabelled: l.ccpLabelled, article6Authorized: l.article6Authorized,
      correspondingAdjustment: l.correspondingAdjustment,
      dueDiligence: Object.fromEntries(Object.entries(l.dueDiligence ?? {}).map(([k, v]) => [k, v === true])),
      purchaseDate: '', pricePerTonne: l.pricePerTonne === null ? '' : String(Number(l.pricePerTonne)), currency: l.currency ?? '',
      tzProjectId: l.tzProjectId ?? '', notes: l.notes ?? '',
    });
  }

  async function saveRetirement(e: FormEvent) {
    e.preventDefault();
    if (!retireFor) return;
    const ok = await run(() =>
      api.post(`/offsets/credits/${retireFor}/retire`, {
        quantityTco2e: Number(retireForm.quantityTco2e),
        retiredOn: retireForm.retiredOn,
        claimYear: Number(retireForm.claimYear),
        beneficiary: optStr(retireForm.beneficiary),
        retirementReference: retireForm.retirementReference,
        evidenceUrl: optStr(retireForm.evidenceUrl),
      }),
    );
    if (ok) {
      setRetireFor(null);
      setRetireForm(emptyRetire);
    }
  }

  // ---------------- Removals ----------------
  async function saveRemoval(e: FormEvent) {
    e.preventDefault();
    const body = {
      projectName: removalForm.projectName,
      removalType: removalForm.removalType,
      method: removalForm.method,
      location: optStr(removalForm.location),
      reportingYear: Number(removalForm.reportingYear),
      removedTco2e: Number(removalForm.removedTco2e),
      reversalsTco2e: Number(removalForm.reversalsTco2e || 0),
      storageYears: optNum(removalForm.storageYears),
      reversalRiskPct: optNum(removalForm.reversalRiskPct),
      monitoringPlan: optStr(removalForm.monitoringPlan),
      inValueChain: removalForm.inValueChain,
      notes: optStr(removalForm.notes),
    };
    const ok = await run(() => (removalEditId ? api.patch(`/offsets/removals/${removalEditId}`, body) : api.post('/offsets/removals', body)));
    if (ok) {
      setRemovalForm(emptyRemoval);
      setRemovalEditId(null);
      setShowRemovalForm(false);
    }
  }

  function editRemoval(r: RemovalRow) {
    setRemovalEditId(r.id);
    setShowRemovalForm(true);
    setRemovalForm({
      projectName: r.projectName, removalType: r.removalType, method: r.method, location: r.location ?? '',
      reportingYear: String(r.reportingYear), removedTco2e: String(Number(r.removedTco2e)), reversalsTco2e: String(Number(r.reversalsTco2e)),
      storageYears: r.storageYears === null ? '' : String(r.storageYears),
      reversalRiskPct: r.reversalRiskPct === null ? '' : String(Number(r.reversalRiskPct)),
      monitoringPlan: r.monitoringPlan ?? '', inValueChain: r.inValueChain, notes: r.notes ?? '',
    });
  }

  // ---------------- Tanzanian projects ----------------
  async function saveTz(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: tzForm.name,
      projectType: tzForm.projectType,
      isReddPlus: tzForm.isReddPlus,
      region: optStr(tzForm.region),
      district: optStr(tzForm.district),
      proponent: optStr(tzForm.proponent),
      registrationStatus: tzForm.registrationStatus,
      registrationNumber: optStr(tzForm.registrationNumber),
      ndcAlignment: optStr(tzForm.ndcAlignment),
      communitySharePct: optNum(tzForm.communitySharePct),
      localGovernmentSharePct: optNum(tzForm.localGovernmentSharePct),
      nationalSharePct: optNum(tzForm.nationalSharePct),
      otherSharePct: optNum(tzForm.otherSharePct),
      benefitSharingNote: optStr(tzForm.benefitSharingNote),
      article6Status: tzForm.article6Status,
      expectedAnnualCredits: optNum(tzForm.expectedAnnualCredits),
      notes: optStr(tzForm.notes),
    };
    const ok = await run(() => (tzEditId ? api.patch(`/offsets/tz-projects/${tzEditId}`, body) : api.post('/offsets/tz-projects', body)));
    if (ok) {
      setTzForm(emptyTz);
      setTzEditId(null);
      setShowTzForm(false);
    }
  }

  function editTz(p: TzProjectRow) {
    const s = (v: string | null) => (v === null ? '' : String(Number(v)));
    setTzEditId(p.id);
    setShowTzForm(true);
    setTzForm({
      name: p.name, projectType: p.projectType, isReddPlus: p.isReddPlus, region: p.region ?? '', district: p.district ?? '',
      proponent: p.proponent ?? '', registrationStatus: p.registrationStatus, registrationNumber: p.registrationNumber ?? '',
      ndcAlignment: p.ndcAlignment ?? '', communitySharePct: s(p.communitySharePct), localGovernmentSharePct: s(p.localGovernmentSharePct),
      nationalSharePct: s(p.nationalSharePct), otherSharePct: s(p.otherSharePct), benefitSharingNote: p.benefitSharingNote ?? '',
      article6Status: p.article6Status, expectedAnnualCredits: s(p.expectedAnnualCredits), notes: p.notes ?? '',
    });
  }

  // ---------------- Claim attestation ----------------
  async function saveAttestation(field: string, value: boolean) {
    await run(() => api.put(`/offsets/claims/${Number(claimYear)}/attestation`, { [field]: value }));
  }

  const attested = (key: string) => {
    const map: Record<string, keyof NonNullable<ClaimCheck['attestation']>> = {
      assurance: 'limitedAssurance', published: 'inventoryPublished', governance: 'governanceInPlace', advocacy: 'advocacyParisAligned',
    };
    return map[key];
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Offset: credits, removals and claims</h1>
        <p className="text-sm text-gray-500">
          Keep a register of the carbon credits you buy and retire, record carbon you remove yourself (for example by planting trees),
          track Tanzanian carbon projects, and check whether a public claim is allowed. Credits are always shown next to your
          emissions — they never reduce the inventory figures.
        </p>
      </div>

      <details className="card text-sm">
        <summary className="cursor-pointer font-medium">What the short forms on this page mean</summary>
        <ul className="mt-2 space-y-1 text-gray-600">
          <li><b>tCO2e</b> — tonnes of carbon dioxide equivalent: all greenhouse gases converted to the warming effect of CO2.</li>
          <li><b>Carbon credit</b> — a certificate for one tonne of CO2e avoided or removed by a project. <b>Retiring</b> a credit uses it up so nobody else can count it.</li>
          <li><b>ICVCM</b> — Integrity Council for the Voluntary Carbon Market. It sets the 10 <b>Core Carbon Principles (CCP)</b>; credits that pass carry the <b>CCP label</b>.</li>
          <li><b>VCMI</b> — Voluntary Carbon Markets Integrity Initiative. Its Claims Code sets the <b>Silver</b> (10%+), <b>Gold</b> (50%+) and <b>Platinum</b> (100%+) claims.</li>
          <li><b>Article 6</b> — the part of the Paris Agreement on trading credits between countries. <b>Article 6.4</b> is the UN crediting mechanism; a <b>corresponding adjustment</b> means the host country does not also count the reduction.</li>
          <li><b>NDC</b> — Nationally Determined Contribution: Tanzania&apos;s own climate commitment under the Paris Agreement.</li>
          <li><b>REDD+</b> — Reducing Emissions from Deforestation and forest Degradation, plus conservation and sustainable forest management.</li>
          <li><b>Removal</b> — CO2 taken out of the air and stored (trees, soil, biochar). A <b>reversal</b> is stored carbon released again (for example by fire).</li>
        </ul>
      </details>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm ${tab === t.key ? 'border-b-2 border-brand font-medium text-brand' : 'text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ================= Claim check ================= */}
      {tab === 'claim' && (
        <section className="space-y-4">
          <div className="card flex flex-wrap items-end gap-2">
            <div>
              <label>Claim year</label>
              <input type="number" className="w-28" value={claimYear} onChange={(e) => setClaimYear(e.target.value)} />
            </div>
            <button type="button" className="btn-secondary" onClick={() => run(() => loadClaim())}>Check</button>
          </div>

          {claim && (
            <>
              <div className={`card ${claim.claimPossible ? 'border-green-300' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {claim.tier && <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TIER_STYLE[claim.tier]}`}>{claim.tier}</span>}
                  <p className="text-sm font-medium">{claim.summary}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="card">
                  <p className="text-xs text-gray-500">Gross emissions {claim.claimYear} (not reduced by credits)</p>
                  <p className="text-xl font-medium">{num(claim.grossEmissionsTco2e, 3)} tCO2e</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-500">Eligible credits retired for {claim.claimYear}</p>
                  <p className="text-xl font-medium">{num(claim.credits.eligibleRetiredTco2e, 3)} tCO2e</p>
                  <p className="text-xs text-gray-500">
                    {num(claim.credits.coveragePct, 1)}% of emissions
                    {claim.credits.ineligibleRetiredTco2e > 0 && ` · ${num(claim.credits.ineligibleRetiredTco2e, 3)} t not eligible`}
                  </p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-500">Removals {claim.claimYear} (reported separately)</p>
                  <p className="text-xl font-medium">{num(claim.removals.netRemovalsTco2e, 3)} tCO2e</p>
                  <p className="text-xs text-gray-500">{num(claim.removals.removedTco2e, 3)} removed − {num(claim.removals.reversalsTco2e, 3)} reversed</p>
                </div>
              </div>

              <div className="card space-y-2">
                <p className="text-sm font-medium">Before any claim (VCMI prerequisites)</p>
                <p className="text-xs text-gray-500">
                  Items marked &quot;from the platform&quot; are checked automatically. The others are confirmed by an Admin.
                </p>
                <ul className="divide-y divide-gray-100">
                  {claim.prerequisites.map((p) => {
                    const field = attested(p.key);
                    return (
                      <li key={p.key} className="flex items-start justify-between gap-3 py-2 text-sm">
                        <div>
                          <span className={p.met ? 'text-green-700' : 'text-red-700'}>{p.met ? '✓' : '✗'}</span> {p.label}
                          {p.note && <p className="text-xs text-gray-400">{p.note}</p>}
                        </div>
                        {p.source === 'platform' ? (
                          <span className="whitespace-nowrap text-xs text-gray-400">from the platform</span>
                        ) : isAdmin && field ? (
                          <label className="flex items-center gap-1 whitespace-nowrap text-xs">
                            <input type="checkbox" checked={!!claim.attestation?.[field]} onChange={(e) => saveAttestation(field, e.target.checked)} />
                            Confirmed
                          </label>
                        ) : (
                          <span className="whitespace-nowrap text-xs text-gray-400">confirmed by Admin</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="card space-y-2">
                <p className="text-sm font-medium">Credits retired for {claim.claimYear}</p>
                {claim.credits.items.length === 0 && <p className="text-sm text-gray-400">None yet. Retire credits on the Carbon credits tab.</p>}
                {claim.credits.items.map((c) => (
                  <div key={c.retirementId} className="border-t border-gray-100 pt-2 text-sm">
                    <p>
                      <span className={c.eligible ? 'text-green-700' : 'text-red-700'}>{c.eligible ? 'Counts' : 'Does not count'}</span>{' '}
                      · {c.projectName} · {REGISTRY_LABELS[c.registry]} · vintage {c.vintageYear} · {num(c.quantityTco2e, 3)} t · ref. {c.retirementReference}
                    </p>
                    <p className="text-xs text-gray-500">{c.basis}</p>
                    {c.warnings.map((w) => <p key={w} className="text-xs text-amber-700">{w}</p>)}
                  </div>
                ))}
              </div>

              <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500">
                {claim.reminders.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ================= Carbon credits ================= */}
      {tab === 'credits' && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Credit register</p>
              <p className="text-xs text-gray-500">Each row is a batch (&quot;lot&quot;) of credits bought from one project and vintage (the year the reduction happened).</p>
            </div>
            {canEdit && !showLotForm && (
              <button type="button" className="btn-secondary" onClick={() => { setLotForm(emptyLot); setLotEditId(null); setShowLotForm(true); }}>Add credits</button>
            )}
          </div>

          {showLotForm && (
            <form onSubmit={saveLot} className="grid grid-cols-1 gap-3 rounded-md border border-gray-100 p-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label>Project name</label>
                <input type="text" required value={lotForm.projectName} onChange={(e) => setLotForm((f) => ({ ...f, projectName: e.target.value }))} />
              </div>
              <div>
                <label>Registry / standard</label>
                <select value={lotForm.registry} onChange={(e) => setLotForm((f) => ({ ...f, registry: e.target.value as CreditRegistry }))}>
                  {Object.entries(REGISTRY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label>Type</label>
                <select value={lotForm.kind} onChange={(e) => setLotForm((f) => ({ ...f, kind: e.target.value as CreditKind }))}>
                  {Object.entries(CREDIT_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label>Vintage year</label>
                <input type="number" required value={lotForm.vintageYear} onChange={(e) => setLotForm((f) => ({ ...f, vintageYear: e.target.value }))} />
              </div>
              <div>
                <label>Quantity (tCO2e)</label>
                <input type="number" step="any" min="0.0001" required value={lotForm.quantityTco2e} onChange={(e) => setLotForm((f) => ({ ...f, quantityTco2e: e.target.value }))} />
              </div>
              <div>
                <label>Registry project ID</label>
                <input type="text" value={lotForm.registryProjectId} onChange={(e) => setLotForm((f) => ({ ...f, registryProjectId: e.target.value }))} />
              </div>
              <div>
                <label>Methodology</label>
                <input type="text" value={lotForm.methodology} onChange={(e) => setLotForm((f) => ({ ...f, methodology: e.target.value }))} />
              </div>
              <div>
                <label>Country</label>
                <input type="text" value={lotForm.country} onChange={(e) => setLotForm((f) => ({ ...f, country: e.target.value }))} />
              </div>
              <div>
                <label>Serial numbers</label>
                <input type="text" value={lotForm.serialRange} onChange={(e) => setLotForm((f) => ({ ...f, serialRange: e.target.value }))} />
              </div>
              <div>
                <label>Price per tonne</label>
                <input type="number" step="any" min="0" value={lotForm.pricePerTonne} onChange={(e) => setLotForm((f) => ({ ...f, pricePerTonne: e.target.value }))} />
              </div>
              <div>
                <label>Currency</label>
                <input type="text" value={lotForm.currency} onChange={(e) => setLotForm((f) => ({ ...f, currency: e.target.value }))} />
              </div>
              <div>
                <label>Linked Tanzanian project</label>
                <select value={lotForm.tzProjectId} onChange={(e) => setLotForm((f) => ({ ...f, tzProjectId: e.target.value }))}>
                  <option value="">None</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1 text-sm sm:col-span-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={lotForm.ccpLabelled} onChange={(e) => setLotForm((f) => ({ ...f, ccpLabelled: e.target.checked }))} /> Carries the ICVCM CCP label</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={lotForm.article6Authorized} onChange={(e) => setLotForm((f) => ({ ...f, article6Authorized: e.target.checked }))} /> Authorised under Article 6 by the host country</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={lotForm.correspondingAdjustment} onChange={(e) => setLotForm((f) => ({ ...f, correspondingAdjustment: e.target.checked }))} /> Corresponding adjustment applied</label>
              </div>
              {!lotForm.ccpLabelled && (
                <div className="rounded-md bg-gray-50 p-3 sm:col-span-3">
                  <p className="text-sm font-medium">Quality checklist — the 10 Core Carbon Principles</p>
                  <p className="mb-2 text-xs text-gray-500">Tick each principle you have checked in the project documents. Without the CCP label, credits count for claims up to 2026 only if all 10 are ticked.</p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {principles.map((p) => (
                      <label key={p.key} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={!!lotForm.dueDiligence[p.key]}
                          onChange={(e) => setLotForm((f) => ({ ...f, dueDiligence: { ...f.dueDiligence, [p.key]: e.target.checked } }))} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="sm:col-span-3">
                <label>Notes</label>
                <input type="text" value={lotForm.notes} onChange={(e) => setLotForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <button type="button" className="btn-secondary" onClick={() => { setShowLotForm(false); setLotEditId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{lotEditId ? 'Save changes' : 'Add credits'}</button>
              </div>
            </form>
          )}

          {lots.length === 0 && <p className="text-sm text-gray-400">No credits recorded yet.</p>}
          <div className="divide-y divide-gray-100">
            {lots.map((l) => (
              <div key={l.id} className="space-y-1 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{l.projectName}</p>
                    <p className="text-xs text-gray-500">
                      {REGISTRY_LABELS[l.registry]} · vintage {l.vintageYear} · {CREDIT_KIND_LABELS[l.kind]}
                      {l.pricePerTonne !== null && ` · ${num(l.pricePerTonne)} ${l.currency ?? ''}/t`}
                    </p>
                    <p className="text-xs">
                      {l.ccpLabelled
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">CCP label</span>
                        : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Checklist {l.dueDiligenceScore.passed}/{l.dueDiligenceScore.total}</span>}
                      {' '}{num(l.quantityTco2e, 3)} t bought · {num(l.retiredTco2e, 3)} t retired · <b>{num(l.availableTco2e, 3)} t available</b>
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {isAdmin && l.availableTco2e > 0 && (
                      <button type="button" className="text-brand hover:underline" onClick={() => { setRetireFor(l.id); setRetireForm(emptyRetire); }}>Retire</button>
                    )}
                    {canEdit && <button type="button" className="text-gray-600 hover:underline" onClick={() => editLot(l)}>Edit</button>}
                    {isAdmin && l.retiredTco2e === 0 && (
                      <button type="button" className="text-red-700 hover:underline"
                        onClick={() => window.confirm(`Delete "${l.projectName}"?`) && run(() => api.delete(`/offsets/credits/${l.id}`))}>Delete</button>
                    )}
                  </div>
                </div>

                {retireFor === l.id && (
                  <form onSubmit={saveRetirement} className="grid grid-cols-1 gap-3 rounded-md border border-gray-100 p-3 sm:grid-cols-3">
                    <p className="text-xs text-gray-500 sm:col-span-3">
                      Record a retirement you have already made in the registry. Enter the registry&apos;s retirement reference as proof.
                    </p>
                    <div>
                      <label>Quantity (tCO2e)</label>
                      <input type="number" step="any" min="0.0001" max={l.availableTco2e} required value={retireForm.quantityTco2e}
                        onChange={(e) => setRetireForm((f) => ({ ...f, quantityTco2e: e.target.value }))} />
                    </div>
                    <div>
                      <label>Retired on</label>
                      <input type="date" required value={retireForm.retiredOn} onChange={(e) => setRetireForm((f) => ({ ...f, retiredOn: e.target.value }))} />
                    </div>
                    <div>
                      <label>For the claim year</label>
                      <input type="number" required value={retireForm.claimYear} onChange={(e) => setRetireForm((f) => ({ ...f, claimYear: e.target.value }))} />
                    </div>
                    <div>
                      <label>Retirement reference</label>
                      <input type="text" required minLength={3} value={retireForm.retirementReference} onChange={(e) => setRetireForm((f) => ({ ...f, retirementReference: e.target.value }))} />
                    </div>
                    <div>
                      <label>On behalf of</label>
                      <input type="text" value={retireForm.beneficiary} onChange={(e) => setRetireForm((f) => ({ ...f, beneficiary: e.target.value }))} />
                    </div>
                    <div>
                      <label>Evidence link</label>
                      <input type="text" value={retireForm.evidenceUrl} onChange={(e) => setRetireForm((f) => ({ ...f, evidenceUrl: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2 sm:col-span-3">
                      <button type="button" className="btn-secondary" onClick={() => setRetireFor(null)}>Cancel</button>
                      <button type="submit" className="btn-primary">Record retirement</button>
                    </div>
                  </form>
                )}

                {l.retirements.length > 0 && (
                  <ul className="pl-3 text-xs text-gray-500">
                    {l.retirements.map((r) => (
                      <li key={r.id} className="flex gap-3">
                        <span>Retired {num(r.quantityTco2e, 3)} t on {r.retiredOn.slice(0, 10)} for {r.claimYear} · ref. {r.retirementReference}</span>
                        {isAdmin && (
                          <button type="button" className="text-red-700 hover:underline"
                            onClick={() => window.confirm('Remove this retirement record? (It does not undo the retirement in the registry.)') && run(() => api.delete(`/offsets/retirements/${r.id}`))}>
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================= Removals ================= */}
      {tab === 'removals' && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Removals ledger</p>
              <p className="text-xs text-gray-500">
                Carbon your own activities or value chain take out of the air, reported next to (not subtracted from) the inventory,
                following the GHG Protocol Land Sector and Removals Standard.
              </p>
            </div>
            {canEdit && !showRemovalForm && (
              <button type="button" className="btn-secondary" onClick={() => { setRemovalForm(emptyRemoval); setRemovalEditId(null); setShowRemovalForm(true); }}>Add a removal</button>
            )}
          </div>

          {showRemovalForm && (
            <form onSubmit={saveRemoval} className="grid grid-cols-1 gap-3 rounded-md border border-gray-100 p-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label>Project name</label>
                <input type="text" required value={removalForm.projectName} onChange={(e) => setRemovalForm((f) => ({ ...f, projectName: e.target.value }))} />
              </div>
              <div>
                <label>Type</label>
                <select value={removalForm.removalType} onChange={(e) => setRemovalForm((f) => ({ ...f, removalType: e.target.value as RemovalType }))}>
                  <option value="nature">Nature (trees, soil)</option>
                  <option value="technological">Technology (biochar, capture)</option>
                </select>
              </div>
              <div>
                <label>Method</label>
                <input type="text" required placeholder="e.g. agroforestry" value={removalForm.method} onChange={(e) => setRemovalForm((f) => ({ ...f, method: e.target.value }))} />
              </div>
              <div>
                <label>Location</label>
                <input type="text" value={removalForm.location} onChange={(e) => setRemovalForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
              <div>
                <label>Year</label>
                <input type="number" required value={removalForm.reportingYear} onChange={(e) => setRemovalForm((f) => ({ ...f, reportingYear: e.target.value }))} />
              </div>
              <div>
                <label>Removed (tCO2e)</label>
                <input type="number" step="any" min="0" required value={removalForm.removedTco2e} onChange={(e) => setRemovalForm((f) => ({ ...f, removedTco2e: e.target.value }))} />
              </div>
              <div>
                <label>Reversed (tCO2e)</label>
                <input type="number" step="any" min="0" value={removalForm.reversalsTco2e} onChange={(e) => setRemovalForm((f) => ({ ...f, reversalsTco2e: e.target.value }))} />
              </div>
              <div>
                <label>Expected storage (years)</label>
                <input type="number" min="0" value={removalForm.storageYears} onChange={(e) => setRemovalForm((f) => ({ ...f, storageYears: e.target.value }))} />
              </div>
              <div>
                <label>Reversal risk (%)</label>
                <input type="number" step="any" min="0" max="100" value={removalForm.reversalRiskPct} onChange={(e) => setRemovalForm((f) => ({ ...f, reversalRiskPct: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label>Monitoring plan</label>
                <input type="text" value={removalForm.monitoringPlan} onChange={(e) => setRemovalForm((f) => ({ ...f, monitoringPlan: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" checked={removalForm.inValueChain} onChange={(e) => setRemovalForm((f) => ({ ...f, inValueChain: e.target.checked }))} />
                Happens in our own operations or value chain
              </label>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <button type="button" className="btn-secondary" onClick={() => { setShowRemovalForm(false); setRemovalEditId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{removalEditId ? 'Save changes' : 'Add removal'}</button>
              </div>
            </form>
          )}

          {removals.length === 0 && <p className="text-sm text-gray-400">No removals recorded yet.</p>}
          <div className="divide-y divide-gray-100">
            {removals.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{r.projectName} <span className="text-xs font-normal text-gray-500">({r.reportingYear})</span></p>
                  <p className="text-xs text-gray-500">
                    {r.removalType === 'nature' ? 'Nature' : 'Technology'} · {r.method}{r.location && ` · ${r.location}`}
                    {r.storageYears !== null && ` · stored ~${r.storageYears} years`}{r.reversalRiskPct !== null && ` · reversal risk ${num(r.reversalRiskPct)}%`}
                  </p>
                  <p className="text-xs">
                    {num(r.removedTco2e, 3)} t removed − {num(r.reversalsTco2e, 3)} t reversed = <b>{num(Number(r.removedTco2e) - Number(r.reversalsTco2e), 3)} t net</b>
                  </p>
                </div>
                <div className="flex gap-3 text-xs">
                  {canEdit && <button type="button" className="text-gray-600 hover:underline" onClick={() => editRemoval(r)}>Edit</button>}
                  {isAdmin && (
                    <button type="button" className="text-red-700 hover:underline"
                      onClick={() => window.confirm(`Delete "${r.projectName}" (${r.reportingYear})?`) && run(() => api.delete(`/offsets/removals/${r.id}`))}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================= Tanzanian projects ================= */}
      {tab === 'tanzania' && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Tanzanian carbon projects</p>
              <p className="text-xs text-gray-500">
                Projects you develop or buy from in Tanzania, with the points the national carbon trading regulations ask for:
                registration, fit with the NDC, benefit sharing with communities and government, and Article 6 authorisation for credits sold abroad.
                Check the current regulations and the share rules for your project type with the relevant authority.
              </p>
            </div>
            {canEdit && !showTzForm && (
              <button type="button" className="btn-secondary" onClick={() => { setTzForm(emptyTz); setTzEditId(null); setShowTzForm(true); }}>Add a project</button>
            )}
          </div>

          {showTzForm && (
            <form onSubmit={saveTz} className="grid grid-cols-1 gap-3 rounded-md border border-gray-100 p-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label>Project name</label>
                <input type="text" required value={tzForm.name} onChange={(e) => setTzForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label>Project type</label>
                <input type="text" required placeholder="e.g. clean cookstoves" value={tzForm.projectType} onChange={(e) => setTzForm((f) => ({ ...f, projectType: e.target.value }))} />
              </div>
              <div>
                <label>Region</label>
                <input type="text" value={tzForm.region} onChange={(e) => setTzForm((f) => ({ ...f, region: e.target.value }))} />
              </div>
              <div>
                <label>District</label>
                <input type="text" value={tzForm.district} onChange={(e) => setTzForm((f) => ({ ...f, district: e.target.value }))} />
              </div>
              <div>
                <label>Proponent (developer)</label>
                <input type="text" value={tzForm.proponent} onChange={(e) => setTzForm((f) => ({ ...f, proponent: e.target.value }))} />
              </div>
              <div>
                <label>Registration status</label>
                <select value={tzForm.registrationStatus} onChange={(e) => setTzForm((f) => ({ ...f, registrationStatus: e.target.value as TzRegistrationStatus }))}>
                  <option value="concept">Concept</option>
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under review</option>
                  <option value="approved">Approved</option>
                  <option value="registered">Registered</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label>Registration number</label>
                <input type="text" value={tzForm.registrationNumber} onChange={(e) => setTzForm((f) => ({ ...f, registrationNumber: e.target.value }))} />
              </div>
              <div>
                <label>Article 6 authorisation</label>
                <select value={tzForm.article6Status} onChange={(e) => setTzForm((f) => ({ ...f, article6Status: e.target.value as Article6Status }))}>
                  <option value="not_applicable">Not needed (credits stay in Tanzania)</option>
                  <option value="requested">Requested</option>
                  <option value="authorized">Authorised</option>
                  <option value="refused">Refused</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label>How it supports Tanzania&apos;s NDC</label>
                <input type="text" value={tzForm.ndcAlignment} onChange={(e) => setTzForm((f) => ({ ...f, ndcAlignment: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:col-span-3 sm:grid-cols-4">
                {([
                  ['communitySharePct', 'Community share (%)'],
                  ['localGovernmentSharePct', 'Local government (%)'],
                  ['nationalSharePct', 'National (%)'],
                  ['otherSharePct', 'Other (%)'],
                ] as const).map(([k, label]) => (
                  <div key={k}>
                    <label>{label}</label>
                    <input type="number" step="any" min="0" max="100" value={tzForm[k]} onChange={(e) => setTzForm((f) => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="sm:col-span-2">
                <label>Benefit-sharing note</label>
                <input type="text" value={tzForm.benefitSharingNote} onChange={(e) => setTzForm((f) => ({ ...f, benefitSharingNote: e.target.value }))} />
              </div>
              <div>
                <label>Expected credits a year (tCO2e)</label>
                <input type="number" step="any" min="0" value={tzForm.expectedAnnualCredits} onChange={(e) => setTzForm((f) => ({ ...f, expectedAnnualCredits: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" checked={tzForm.isReddPlus} onChange={(e) => setTzForm((f) => ({ ...f, isReddPlus: e.target.checked }))} />
                This is a REDD+ (forest) project
              </label>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <button type="button" className="btn-secondary" onClick={() => { setShowTzForm(false); setTzEditId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{tzEditId ? 'Save changes' : 'Add project'}</button>
              </div>
            </form>
          )}

          {projects.length === 0 && <p className="text-sm text-gray-400">No projects yet.</p>}
          <div className="divide-y divide-gray-100">
            {projects.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{p.name}{p.isReddPlus && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">REDD+</span>}</p>
                  <p className="text-xs text-gray-500">
                    {p.projectType}{p.region && ` · ${p.region}`}{p.district && `, ${p.district}`} · status: {p.registrationStatus.replace('_', ' ')}
                    {p.registrationNumber && ` (${p.registrationNumber})`}
                  </p>
                  {p.warnings.length === 0
                    ? <p className="text-xs text-green-700">No open regulatory points recorded.</p>
                    : p.warnings.map((w) => <p key={w} className="text-xs text-amber-700">⚠ {w}</p>)}
                </div>
                <div className="flex gap-3 text-xs">
                  {canEdit && <button type="button" className="text-gray-600 hover:underline" onClick={() => editTz(p)}>Edit</button>}
                  {isAdmin && (
                    <button type="button" className="text-red-700 hover:underline"
                      onClick={() => window.confirm(`Delete "${p.name}"?`) && run(() => api.delete(`/offsets/tz-projects/${p.id}`))}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
