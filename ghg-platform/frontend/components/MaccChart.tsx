'use client';

import { MaccBar, INITIATIVE_STATUS_LABELS } from '@/lib/types';

/**
 * Marginal abatement cost curve: one bar per initiative, cheapest per tonne first.
 * Bar width = tonnes avoided per year; bar height = cost per tonne (below the axis = saves money).
 */
export function MaccChart({ bars, currency }: { bars: MaccBar[]; currency: string }) {
  if (bars.length === 0) return <p className="text-sm text-gray-400">Add initiatives to see the curve.</p>;

  const W = 720;
  const H = 300;
  const pad = { left: 64, right: 16, top: 16, bottom: 40 };
  const total = bars[bars.length - 1].cumulativeEndTco2e || 1;
  const maxCost = Math.max(0, ...bars.map((b) => b.costPerTonne));
  const minCost = Math.min(0, ...bars.map((b) => b.costPerTonne));
  const span = maxCost - minCost || 1;
  const x = (t: number) => pad.left + (t / total) * (W - pad.left - pad.right);
  const y = (c: number) => pad.top + ((maxCost - c) / span) * (H - pad.top - pad.bottom);
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="Marginal abatement cost curve">
        {/* zero line */}
        <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke="#9ca3af" strokeWidth={1} />
        {/* y axis labels */}
        {[maxCost, 0, minCost].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <text key={v} x={pad.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b7280">
            {fmt(v)}
          </text>
        ))}
        <text x={12} y={H / 2} fontSize={11} fill="#6b7280" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
          {currency} per tCO2e
        </text>
        {bars.map((b) => {
          const x0 = x(b.cumulativeStartTco2e);
          const x1 = x(b.cumulativeEndTco2e);
          const top = Math.min(y(b.costPerTonne), y(0));
          const height = Math.max(1, Math.abs(y(b.costPerTonne) - y(0)));
          const saves = b.costPerTonne < 0;
          return (
            <g key={b.id}>
              <rect
                x={x0 + 1}
                y={top}
                width={Math.max(1, x1 - x0 - 2)}
                height={height}
                fill={saves ? '#1baf7a' : '#eb6834'}
                opacity={b.status === 'idea' ? 0.45 : 0.9}
              >
                <title>
                  {`${b.name} (${INITIATIVE_STATUS_LABELS[b.status]}): ${b.annualReductionTco2e} tCO2e/yr at ${fmt(b.costPerTonne)} ${currency}/t`}
                </title>
              </rect>
            </g>
          );
        })}
        {/* x axis */}
        <text x={pad.left} y={H - 20} fontSize={11} fill="#6b7280">0</text>
        <text x={W - pad.right} y={H - 20} fontSize={11} fill="#6b7280" textAnchor="end">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</text>
        <text x={(pad.left + W - pad.right) / 2} y={H - 6} fontSize={11} fill="#6b7280" textAnchor="middle">
          tCO2e avoided per year (cumulative)
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {bars.map((b, i) => (
          <span key={b.id}>
            {i + 1}. {b.name}: {fmt(b.costPerTonne)} {currency}/t · {b.annualReductionTco2e} t/yr
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Green = saves money as well as emissions; orange = costs money per tonne. Faded bars are ideas not yet planned.
      </p>
    </div>
  );
}
