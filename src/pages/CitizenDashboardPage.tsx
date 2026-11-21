import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiClient } from '../lib/apiClient';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadges';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type ComplaintRecord,
} from '../shared/types';

export function CitizenDashboardPage() {
  const { t, user, getToken } = useApp();
  const [items, setItems] = useState<ComplaintRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadComplaints = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiClient.getCitizenComplaints(token, {
        search,
        category,
        priority,
        status,
        page,
        pageSize: 8,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load complaints.');
    } finally {
      setLoading(false);
    }
  }, [getToken, search, category, priority, status, page]);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  const pendingCount = items.filter((c) => c.status === 'REPORTED').length;
  const progressCount = items.filter((c) => c.status === 'IN_PROGRESS').length;
  const resolvedCount = items.filter((c) => c.status === 'RESOLVED').length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t.citizenWelcome}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{user?.name}</span>
            <span aria-hidden="true"> · </span>
            <span>{user?.email}</span>
          </p>
        </div>
        <Link
          to="/citizen/report"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t.quickReport}</span>
        </Link>
      </div>

      {/* Citizen KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t.statTotalReported}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t.statPending}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {pendingCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t.statInProgress}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-blue-700">
            {progressCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t.statResolved}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-teal-700">
            {resolvedCount}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <section aria-label={t.myComplaints} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-slate-900">{t.myComplaints}</h2>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <label htmlFor="citizen-search" className="sr-only">
              {t.searchPlaceholder}
            </label>
            <Search
              className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="citizen-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            />
          </div>

          <div>
            <label htmlFor="citizen-cat-filter" className="sr-only">
              {t.filterCategory}
            </label>
            <select
              id="citizen-cat-filter"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              <option value="ALL">{t.allCategories}</option>
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.categories[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="citizen-prio-filter" className="sr-only">
              {t.filterPriority}
            </label>
            <select
              id="citizen-prio-filter"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              <option value="ALL">{t.allPriorities}</option>
              {COMPLAINT_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t.priorities[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="citizen-status-filter" className="sr-only">
              {t.filterStatus}
            </label>
            <select
              id="citizen-status-filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              <option value="ALL">{t.allStatuses}</option>
              {COMPLAINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.statuses[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm text-slate-600">{t.emptyComplaints}</p>
            <Link
              to="/citizen/report"
              className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t.quickReport}</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {items.map((c) => (
              <Link
                key={c.id}
                to={`/citizen/complaints/${c.id}`}
                className="flex flex-col justify-between gap-4 p-5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 sm:flex-row sm:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-800">
                      {c.referenceId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{t.categories[c.userCategory]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{c.location}</span>
                    {c.isDemo && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-800">DEMO</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {c.title}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {t.assignedDepartment}: {c.assignedDepartment}
                    <span aria-hidden="true"> · </span>
                    <span>{c.aiSource === 'GEMINI' ? t.aiSourceGemini : t.aiSourceFallback}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <PriorityIndicator priority={c.priority} />
                  <StatusIndicator status={c.status} />
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
            <span className="tabular-nums">
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>{t.previousPage}</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40"
              >
                <span>{t.nextPage}</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
