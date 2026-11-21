import { useId, useState } from 'react';
import { Table } from 'lucide-react';
import type { MonthlyTrendPoint } from '../../shared/types';

export interface BarDatum {
  label: string;
  value: number;
  tone?: 'navy' | 'blue' | 'teal' | 'amber' | 'red';
}

const TONE_CLASS: Record<NonNullable<BarDatum['tone']>, string> = {
  navy: 'bg-slate-800',
  blue: 'bg-blue-700',
  teal: 'bg-teal-600',
  amber: 'bg-amber-600',
  red: 'bg-red-700',
};

export function AccessibleBarChart({
  title,
  subtitle,
  data,
  emptyLabel = 'No records recorded yet.',
}: {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  emptyLabel?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  return (
    <figure
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 id={headingId} className="text-base font-semibold text-slate-900">
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {data.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-expanded={showTable}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap shrink-0"
          >
            <Table className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{showTable ? 'Chart View' : 'Table View'}</span>
          </button>
        )}
      </div>

      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{emptyLabel}</p>
      ) : showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row) => (
                <tr key={row.label}>
                  <td className="py-2 pr-4 text-slate-800">{row.label}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-slate-900">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3" role="img" aria-label={`${title} bar chart`}>
          {data.map((item) => {
            const pct = Math.round((item.value / maxVal) * 100);
            const barClass = TONE_CLASS[item.tone ?? 'blue'];
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-slate-700">{item.label}</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {item.value}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                  <div
                    className={`h-full rounded-sm transition-all duration-200 ${barClass}`}
                    style={{ width: `${Math.max(item.value > 0 ? 4 : 0, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </figure>
  );
}

export function MonthlyTrendsChart({
  title,
  subtitle,
  trends,
}: {
  title: string;
  subtitle?: string;
  trends: MonthlyTrendPoint[];
}) {
  const headingId = useId();
  const maxVal = Math.max(
    1,
    ...trends.flatMap((t) => [t.reported, t.resolved])
  );

  return (
    <figure
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-base font-semibold text-slate-900">
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-blue-700" aria-hidden="true" />
            Reported
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-teal-600" aria-hidden="true" />
            Resolved
          </span>
        </div>
      </div>

      {trends.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Monthly trend bars appear as complaints are reported and resolved.
        </p>
      ) : (
        <div className="space-y-4">
          <div
            role="img"
            aria-label={`${title} showing reported and resolved counts by month`}
            className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6"
          >
            {trends.map((point) => {
              const repH = Math.round((point.reported / maxVal) * 96);
              const resH = Math.round((point.resolved / maxVal) * 96);
              return (
                <div key={point.month} className="flex flex-col items-center gap-2">
                  <div className="flex h-28 items-end gap-1.5 border-b border-slate-200 px-2 pb-1">
                    <div
                      className="w-4 rounded-t-xs bg-blue-700"
                      style={{ height: `${Math.max(point.reported > 0 ? 6 : 2, repH)}px` }}
                      title={`${point.month} Reported: ${point.reported}`}
                    />
                    <div
                      className="w-4 rounded-t-xs bg-teal-600"
                      style={{ height: `${Math.max(point.resolved > 0 ? 6 : 2, resH)}px` }}
                      title={`${point.month} Resolved: ${point.resolved}`}
                    />
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-xs font-medium text-slate-700">
                      {point.month}
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-slate-500">
                      {point.reported} / {point.resolved}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </figure>
  );
}
