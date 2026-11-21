import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Copy, ShieldAlert } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiClient } from '../lib/apiClient';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadges';
import {
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type AdminNoteRecord,
  type ComplaintPriority,
  type ComplaintRecord,
  type ComplaintStatus,
  type DuplicateMatch,
  type StatusHistoryRecord,
} from '../shared/types';

export function AdminComplaintReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { t, departments, getToken } = useApp();

  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [history, setHistory] = useState<StatusHistoryRecord[]>([]);
  const [notes, setNotes] = useState<AdminNoteRecord[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);

  const [status, setStatus] = useState<ComplaintStatus>('REPORTED');
  const [priority, setPriority] = useState<ComplaintPriority>('MEDIUM');
  const [assignedDepartment, setAssignedDepartment] = useState('');
  const [citizenVisibleUpdate, setCitizenVisibleUpdate] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiClient.getAdminComplaintDetail(token, id);
      setComplaint(res.complaint);
      setHistory(res.history);
      setNotes(res.notes);
      setDuplicates(res.duplicates);
      setStatus(res.complaint.status);
      setPriority(res.complaint.priority);
      setAssignedDepartment(res.complaint.assignedDepartment);
      setCitizenVisibleUpdate(res.complaint.citizenVisibleUpdate);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load complaint detail.');
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const token = await getToken();
    if (!token) return;
    setSaving(true);
    setFeedback(null);
    try {
      await apiClient.updateAdminComplaint(token, id, {
        status,
        priority,
        assignedDepartment,
        citizenVisibleUpdate,
        requiresHumanReview: false,
      });
      setFeedback('Complaint status, department, and citizen update saved to Firestore with audit log.');
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save update.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !internalNote.trim()) return;
    const token = await getToken();
    if (!token) return;
    setAddingNote(true);
    try {
      await apiClient.addAdminNote(token, id, internalNote.trim());
      setInternalNote('');
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save internal note.');
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t.backToAdminConsole}</span>
        </Link>
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {error || 'Complaint not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>{t.backToAdminConsole}</span>
      </Link>

      {feedback && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Citizen Submission + AI + Duplicates */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold text-slate-500">
                  {complaint.referenceId} · {complaint.citizenName} ({complaint.citizenEmail})
                </p>
                <h1 className="mt-1 font-display text-xl font-bold text-slate-900">
                  {complaint.title}
                </h1>
              </div>
              <div className="flex gap-2">
                <PriorityIndicator priority={complaint.priority} />
                <StatusIndicator status={complaint.status} />
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Location: <span className="font-medium text-slate-900">{complaint.location}</span>
              {typeof complaint.latitude === 'number' && typeof complaint.longitude === 'number' && (
                <span className="ml-2 font-mono text-xs text-slate-500">
                  ({complaint.latitude}, {complaint.longitude})
                </span>
              )}
            </p>

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {complaint.description}
            </p>

            {complaint.hasImage && complaint.imageDataUrl && (
              <img
                src={complaint.imageDataUrl}
                alt={`Evidence submitted for ${complaint.referenceId}`}
                className="max-h-72 rounded-lg border border-slate-200 object-contain"
              />
            )}
          </div>

          {/* AI Analysis Summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              AI Intelligence &amp; Safety Audit
            </h2>
            <p className="text-xs font-medium text-slate-600">
              Source: {complaint.aiSource === 'GEMINI' ? t.aiSourceGemini : t.aiSourceFallback} ({complaint.aiModel})
            </p>
            {complaint.safetyEscalated && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{t.safetyEscalatedNotice}</p>
                  {complaint.safetyReasons.map((r) => (
                    <p key={r}>{r}</p>
                  ))}
                </div>
              </div>
            )}
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Recommended Department</dt>
                <dd className="font-semibold text-slate-900">{complaint.department}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Severity &amp; Est. Confidence</dt>
                <dd className="font-mono text-slate-900 tabular-nums">
                  {complaint.severity}/5 · {Math.round(complaint.confidenceEstimate * 100)}%
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Explanation</dt>
                <dd className="text-slate-700">{complaint.aiExplanation}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Recommended Action</dt>
                <dd className="text-slate-700">{complaint.recommendedAction}</dd>
              </div>
            </dl>
          </div>

          {/* Potential Duplicates Panel (Human-in-the-loop) */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-amber-700" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t.potentialDuplicates} ({duplicates.length})
              </h2>
            </div>
            <p className="text-xs text-slate-500">{t.noAutoMergeNote}</p>
            {duplicates.length === 0 ? (
              <p className="text-sm text-slate-600">
                No similar complaints detected above similarity threshold.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                {duplicates.map((dup) => (
                  <li key={dup.complaintId} className="p-3.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/admin/complaints/${dup.complaintId}`}
                        className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                      >
                        {dup.referenceId}
                      </Link>
                      <span className="font-mono text-xs font-semibold text-amber-800">
                        {Math.round(dup.score * 100)}% similarity
                      </span>
                    </div>
                    <p className="mt-1 font-medium text-slate-900">{dup.title}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {dup.reasons.join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Action Form + Internal Notes + History */}
        <div className="space-y-6 lg:col-span-5">
          <form
            onSubmit={handleSaveUpdate}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h2 className="font-display text-base font-semibold text-slate-900">
              Update Resolution &amp; Assignment
            </h2>

            {complaint.requiresHumanReview && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t.humanReviewRequired}</span>
              </div>
            )}

            <div>
              <label htmlFor="admin-status" className="block text-xs font-semibold text-slate-700">
                Status
              </label>
              <select
                id="admin-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {COMPLAINT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t.statuses[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-priority" className="block text-xs font-semibold text-slate-700">
                Priority
              </label>
              <select
                id="admin-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {COMPLAINT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t.priorities[p]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-dept" className="block text-xs font-semibold text-slate-700">
                {t.assignedDepartment}
              </label>
              <select
                id="admin-dept"
                value={assignedDepartment}
                onChange={(e) => setAssignedDepartment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.labelEn} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="citizen-update" className="block text-xs font-semibold text-slate-700">
                Citizen-Visible Update
              </label>
              <textarea
                id="citizen-update"
                rows={3}
                maxLength={1000}
                value={citizenVisibleUpdate}
                onChange={(e) => setCitizenVisibleUpdate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? 'Saving...' : t.saveUpdate}
            </button>
          </form>

          {/* Internal Notes (Admin-Only) */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t.internalNotes}
            </h2>
            <form onSubmit={handleAddNote} className="space-y-3">
              <label htmlFor="internal-note-input" className="sr-only">
                Internal administrator note
              </label>
              <textarea
                id="internal-note-input"
                rows={2}
                maxLength={2000}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Add internal coordination note (hidden from citizens)..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={addingNote || !internalNote.trim()}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {addingNote ? 'Saving Note...' : t.addInternalNote}
              </button>
            </form>

            {notes.length > 0 && (
              <ul className="divide-y divide-slate-100 text-xs">
                {notes.map((n) => (
                  <li key={n.id} className="py-2.5">
                    <div className="flex justify-between text-slate-500">
                      <span>{n.authorEmail}</span>
                      <span className="font-mono">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-slate-800">{n.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Complaint History
            </h2>
            <ul className="divide-y divide-slate-100 text-xs">
              {history.map((h) => (
                <li key={h.id} className="py-2.5">
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>{h.newStatus}</span>
                    <span className="font-mono font-normal text-slate-500">
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{h.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
