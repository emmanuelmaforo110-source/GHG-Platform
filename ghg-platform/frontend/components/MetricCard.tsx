export function MetricCard({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? 'border-brand/20 bg-brand-light' : 'border-gray-200 bg-white'}`}>
      <p className={`text-sm ${accent ? 'text-brand' : 'text-gray-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-medium ${accent ? 'text-brand' : 'text-gray-900'}`}>
        {value} {unit && <span className="text-sm font-normal text-gray-500">{unit}</span>}
      </p>
    </div>
  );
}
