import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Database, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiClient } from '../lib/apiClient';
import {
  AccessibleBarChart,
  MonthlyTrendsChart,
} from '../components/charts/CivicCharts';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadges';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type AuditLogRecord,
  type ComplaintCategory,
  type ComplaintPriority,
  type ComplaintRecord,
  type PublicAggregateStats,
} from '../shared/types';
import { createEmptyPublicStats } from '../server/services/firestoreRestClient';

export function AdminDashboardPage() {
  const { t, user, getToken } = useApp();
  const [stats, setStats] = useState<PublicAggregateStats>(createEmptyPublicStats);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'priority' | 'severity'>('priority');

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    const token = await getToken();
    if (!token || !user?.isAdmin) return;
    setLoading(true);
    try {
      const [dashRes, queueRes] = await Promise.all([
        apiClient.getAdminDashboard(token),
        apiClient.getAdminComplaints(token, {
          search,
          category,
          priority,
          status,
          sortBy,
          page,
          pageSize: 10,
        }),
      ]);
      setStats(dashRes.stats);
      setAuditLogs(dashRes.auditLogs);
      setComplaints(queueRes.items);
      setTotal(queueRes.total);
      setTotalPages(queueRes.totalPages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin console.');
    } finally {
      setLoading(false);
    }
  }, [getToken, user?.isAdmin, search, category, priority, status, sortBy, page]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const handleSeedDemo = async () => {
    const token = await getToken();
    if (!token) return;
    setSeeding(true);
    try {
      await apiClient.seedDemoData(token);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed labeled demonstration records.');
    } finally {
      setSeeding(false);
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div role="alert" className="rounded-xl border border-red-200 bg-white p-8">
          <h1 className="font-display text-xl font-bold text-slate-900">
            Administrator Authorization Required
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Access to the Municipal Administrator Console is verified server-side against the configured administrator email allowlist. Your current account ({user?.email || 'unauthenticated'}) has Citizen privileges only.
          </p>
        </div>
      </div>
    );
  }

  const categoryBars = Object.entries(stats.byCategory)
    .map(([key, value]) => ({
      label: t.categories[key as ComplaintCategory] ?? key,
      value,
      tone: 'blue' as const,
    }))
    .sort((a, b) => b.value - a.value);

  const priorityBars = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as ComplaintPriority[]).map(
    (p) => ({
      label: t.priorities[p],
      value: stats.byPriority[p] ?? 0,
      tone:
        p === 'CRITICAL'
          ? ('red' as const)
          : p === 'HIGH'
          ? ('amber' as const)
          : p === 'MEDIUM'
          ? ('blue' as const)
          : ('navy' as const),
    })
  );

  const departmentBars = Object.entries(stats.byDepartment)
    .map(([dept, value]) => ({
      label: dept,
      value,
      tone: 'teal' as const,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t.adminConsoleTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Server-verified administrator: {user.email}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSeedDemo}
          disabled={seeding}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <Database className="h-4 w-4 text-blue-700" aria-hidden="true" />
          <span>{seeding ? 'Seeding Labeled Demo Records...' : 'Seed Labeled Demo Records'}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 6 Admin KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">{t.statTotalReported}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {stats.totalReported}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">{t.statuses.REPORTED}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {stats.reportedCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">{t.statInProgress}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-blue-700">
            {stats.inProgressCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">{t.statResolved}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-teal-700">
            {stats.resolvedCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">{t.statCritical}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-red-700">
            {stats.criticalCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">{t.statAvgResolution}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {stats.avgResolutionHours}h
          </p>
        </div>
      </div>

      {/* Analytics Charts */}
      <section aria-labelledby="admin-analytics-heading" className="space-y-4">
        <h2 id="admin-analytics-heading" className="font-display text-lg font-semibold text-slate-900">
          Operational Analytics
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AccessibleBarChart title="Complaint Categories" data={categoryBars} />
          <AccessibleBarChart title="Priority Distribution" data={priorityBars} />
          <AccessibleBarChart title="Department Workload" data={departmentBars} />
          <MonthlyTrendsChart title="Monthly Reporting & Resolution" trends={stats.monthlyTrends} />
        </div>
      </section>

      {/* Complaint Management Queue */}
      <section aria-label="Complaint management queue" className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Complaint Management Queue ({total})
        </h2>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <label htmlFor="admin-search" className="sr-only">
              {t.searchPlaceholder}
            </label>
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              id="admin-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm"
            />
          </div>
          <select
            aria-label={t.filterCategory}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">{t.allCategories}</option>
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.categories[c]}
              </option>
            ))}
          </select>
          <select
            aria-label={t.filterPriority}
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">{t.allPriorities}</option>
            {COMPLAINT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t.priorities[p]}
              </option>
            ))}
          </select>
          <select
            aria-label={t.filterStatus}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">{t.allStatuses}</option>
            {COMPLAINT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.statuses[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort complaints"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'priority' | 'severity')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="priority">Sort: Highest Priority</option>
            <option value="severity">Sort: Highest Severity</option>
            <option value="newest">Sort: Newest First</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Issue &amp; Location</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading complaints...
                  </td>
                </tr>
              ) : complaints.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {t.emptyComplaints}
                  </td>
                </tr>
              ) : (
                complaints.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {c.referenceId}
                      {c.isDemo && <span className="ml-2 text-amber-800">DEMO</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.title}</div>
                      <div className="text-xs text-slate-500">
                        {c.location}
                        {c.duplicateScore >= 0.42 && (
                          <span className="ml-2 font-semibold text-amber-800">
                            · Possible Duplicate ({Math.round(c.duplicateScore * 100)}%)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{c.assignedDepartment}</td>
                    <td className="px-4 py-3">
                      <PriorityIndicator priority={c.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        to={`/admin/complaints/${c.id}`}
                        className="inline-flex min-h-[36px] items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="tabular-nums">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Recent Audit Trail */}
      <section aria-label={t.auditTrail} className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">{t.auditTrail}</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No audit records yet.
                  </td>
                </tr>
              ) : (
                auditLogs.slice(0, 12).map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-slate-800">
                      {log.actorEmail} ({log.actorRole})
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
