import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Info, ShieldAlert } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiClient } from '../lib/apiClient';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadges';
import type { ComplaintRecord, ComplaintStatus, StatusHistoryRecord } from '../shared/types';

const STAGES: ComplaintStatus[] = ['REPORTED', 'IN_PROGRESS', 'RESOLVED'];

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, getToken } = useApp();
  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [history, setHistory] = useState<StatusHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) return;
      const token = await getToken();
      if (!token) return;
      setLoading(true);
      try {
        const res = await apiClient.getComplaintDetail(token, id);
        if (active) {
          setComplaint(res.complaint);
          setHistory(res.history);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load complaint details.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, getToken]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6" aria-busy="true">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        <Link to="/citizen" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t.backToCitizenPortal}</span>
        </Link>
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {error || 'Complaint not found.'}
        </div>
      </div>
    );
  }

  const activeStageIndex = STAGES.indexOf(complaint.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        to="/citizen"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>{t.backToCitizenPortal}</span>
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-900">{complaint.referenceId}</span>
              <span aria-hidden="true">·</span>
              <span>{t.categories[complaint.userCategory]}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.location}</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900">{complaint.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityIndicator priority={complaint.priority} />
            <StatusIndicator status={complaint.status} />
          </div>
        </div>

        {/* Visual Progress Stepper */}
        <div className="mt-8 border-y border-slate-200 py-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t.statusTimeline}
          </h2>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STAGES.map((stage, idx) => {
              const reached = idx <= activeStageIndex;
              return (
                <li
                  key={stage}
                  className={`flex items-center gap-3 rounded-lg border p-3.5 ${
                    reached
                      ? 'border-blue-200 bg-blue-50 text-slate-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  {stage === 'RESOLVED' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                  ) : stage === 'IN_PROGRESS' ? (
                    <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-sm font-semibold">{t.statuses[stage]}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Citizen Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {complaint.description}
              </p>
            </div>

            {complaint.hasImage && complaint.imageDataUrl && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Photographic Evidence</h2>
                <img
                  src={complaint.imageDataUrl}
                  alt={`Citizen submitted evidence for ${complaint.referenceId}`}
                  className="mt-2 max-h-72 rounded-lg border border-slate-200 object-contain"
                />
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t.adminUpdates}</h2>
              <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                {complaint.citizenVisibleUpdate}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-900">Status History</h2>
              <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
                {history.map((entry) => (
                  <li key={entry.id} className="p-3.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">
                        {t.statuses[entry.newStatus]}
                      </span>
                      <span className="font-mono">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-700">{entry.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <aside className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500">Triage Engine Source</p>
                <p className="text-sm font-semibold text-slate-900">
                  {complaint.aiSource === 'GEMINI' ? t.aiSourceGemini : t.aiSourceFallback}
                </p>
              </div>

              {complaint.safetyEscalated && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{t.safetyEscalatedNotice}</p>
                    {complaint.safetyReasons.map((r) => (
                      <p key={r} className="mt-1">{r}</p>
                    ))}
                  </div>
                </div>
              )}

              {complaint.requiresHumanReview && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <span>{t.humanReviewRequired}</span>
                </div>
              )}

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">{t.assignedDepartment}</dt>
                  <dd className="font-semibold text-slate-900">{complaint.assignedDepartment}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Subcategory &amp; Severity</dt>
                  <dd className="font-mono text-xs text-slate-900 tabular-nums">
                    {complaint.subcategory} · Severity {complaint.severity}/5 · Est. Confidence{' '}
                    {Math.round(complaint.confidenceEstimate * 100)}%
                  </dd>
                  <p className="mt-1 text-[11px] text-slate-500">{t.aiConfidenceDisclaimer}</p>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{t.publicImpactLabel}</dt>
                  <dd className="text-slate-700">{complaint.publicImpact}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Explanation</dt>
                  <dd className="text-slate-700">{complaint.aiExplanation}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{t.recommendedActionLabel}</dt>
                  <dd className="text-slate-700">{complaint.recommendedAction}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
