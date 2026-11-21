import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiClient } from '../lib/apiClient';
import { createEmptyPublicStats } from '../server/services/firestoreRestClient';
import {
  AccessibleBarChart,
  MonthlyTrendsChart,
} from '../components/charts/CivicCharts';
import type { ComplaintCategory, ComplaintPriority, PublicAggregateStats } from '../shared/types';

export function PublicTransparencyPage() {
  const { t } = useApp();
  const [stats, setStats] = useState<PublicAggregateStats>(createEmptyPublicStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiClient
      .getPublicStatistics()
      .then((res) => {
        if (active) {
          setStats(res.statistics);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load public statistics.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const categoryBars = Object.entries(stats.byCategory)
    .map(([key, value]) => ({
      label: t.categories[key as ComplaintCategory] ?? key,
      value,
      tone: 'blue' as const,
    }))
    .sort((a, b) => b.value - a.value);

  const priorityBars = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as ComplaintPriority[]).map(
    (prio) => ({
      label: t.priorities[prio],
      value: stats.byPriority[prio] ?? 0,
      tone:
        prio === 'CRITICAL'
          ? ('red' as const)
          : prio === 'HIGH'
          ? ('amber' as const)
          : prio === 'MEDIUM'
          ? ('blue' as const)
          : ('navy' as const),
    })
  );

  const areaBars = Object.entries(stats.byArea)
    .map(([area, value]) => ({
      label: area,
      value,
      tone: 'teal' as const,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <h1 className="font-display break-words text-3xl font-bold tracking-tight text-slate-900">
          {t.transparencyTitle}
        </h1>
        <p className="max-w-3xl text-base text-slate-600">{t.transparencySubtitle}</p>
        <div className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-medium text-teal-900">
          <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <span>{t.privacyGuarantee}</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white p-5" />
          ))}
        </div>
      ) : (
        <section aria-labelledby="transparency-overview-heading" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="transparency-overview-heading" className="font-display text-lg font-semibold text-slate-900">
              Aggregated Grievance Metrics &amp; Distributions
            </h2>
            {stats.totalReported === 0 && (
              <p className="text-xs text-slate-500">
                Live Firestore aggregate is currently at 0; counts update automatically as grievances are reported.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">{t.statTotalReported}</p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-900">
                {stats.totalReported}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">{t.statResolved}</p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-teal-700">
                {stats.resolvedCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">{t.statInProgress}</p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-blue-700">
                {stats.inProgressCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">{t.statResolutionRate}</p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-900">
                {stats.resolutionRate}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AccessibleBarChart
              title="Complaints by Category"
              subtitle="Aggregated civic category distribution"
              data={categoryBars}
            />
            <AccessibleBarChart
              title="Priority Distribution"
              subtitle="Incorporating AI triage and backend safety escalations"
              data={priorityBars}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AccessibleBarChart
              title="Area-Wise Complaint Breakdown"
              subtitle="Top municipal zones by reported count"
              data={areaBars}
              emptyLabel="Area breakdown updates automatically as grievances are reported."
            />
            <MonthlyTrendsChart
              title="Monthly Reporting & Resolution Trends"
              subtitle="Reported vs resolved complaints per calendar month"
              trends={stats.monthlyTrends}
            />
          </div>
        </section>
      )}
    </div>
  );
}
