import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiClient, ApiError } from '../lib/apiClient';
import { compressImageFile } from '../lib/imageCompression';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadges';
import { complaintSubmissionSchema } from '../shared/validation';
import {
  COMPLAINT_CATEGORIES,
  type ComplaintCategory,
  type ComplaintRecord,
  type EnrichedAiAnalysis,
} from '../shared/types';

export function CitizenReportPage() {
  const { t, language, getToken } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [userCategory, setUserCategory] = useState<ComplaintCategory>('ROAD_INFRASTRUCTURE');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [imageMeta, setImageMeta] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewAnalysis, setPreviewAnalysis] = useState<EnrichedAiAnalysis | null>(null);

  const [submittedResult, setSubmittedResult] = useState<{
    complaint: ComplaintRecord;
    analysis: EnrichedAiAnalysis;
  } | null>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFieldErrors((prev) => ({ ...prev, image: '' }));

    try {
      const compressed = await compressImageFile(file);
      setImageDataUrl(compressed.dataUrl);
      setImageMeta(
        `${compressed.width}×${compressed.height}px · ${Math.round(compressed.compressedBytes / 1024)}KB (compressed from ${Math.round(compressed.originalBytes / 1024)}KB)`
      );
    } catch (err) {
      setImageDataUrl(undefined);
      setImageMeta('');
      setFieldErrors((prev) => ({
        ...prev,
        image: err instanceof Error ? err.message : 'Unable to process image.',
      }));
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setSubmitError('Geolocation is not supported by this browser.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
      },
      () => {
        setSubmitError('Location permission denied or unavailable. Please enter street address manually.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handlePreviewTriage = async () => {
    setFieldErrors({});
    setSubmitError(null);

    const validated = complaintSubmissionSchema.safeParse({
      title,
      description,
      location,
      userCategory,
      language,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    });

    if (!validated.success) {
      const nextErrors: Record<string, string> = {};
      const flat = validated.error.flatten().fieldErrors;
      for (const [key, msgs] of Object.entries(flat)) {
        if (msgs && msgs[0]) nextErrors[key] = msgs[0];
      }
      setFieldErrors(nextErrors);
      return;
    }

    const token = await getToken();
    if (!token) {
      setSubmitError('Your session expired. Please sign in again.');
      return;
    }

    setPreviewing(true);
    try {
      const res = await apiClient.analyzePreview(token, {
        title: validated.data.title,
        description: validated.data.description,
        location: validated.data.location,
        userCategory: validated.data.userCategory,
        language: validated.data.language,
        ...(imageDataUrl ? { imageDataUrl } : {}),
      });
      setPreviewAnalysis(res.analysis);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to preview AI triage right now.'
      );
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSubmitError(null);

    const parsedLat = latitude.trim() ? Number(latitude) : undefined;
    const parsedLng = longitude.trim() ? Number(longitude) : undefined;

    const payload = {
      title,
      description,
      location,
      userCategory,
      language,
      ...(typeof parsedLat === 'number' && !Number.isNaN(parsedLat) ? { latitude: parsedLat } : {}),
      ...(typeof parsedLng === 'number' && !Number.isNaN(parsedLng) ? { longitude: parsedLng } : {}),
      ...(imageDataUrl ? { imageDataUrl } : {}),
    };

    const validated = complaintSubmissionSchema.safeParse(payload);
    if (!validated.success) {
      const nextErrors: Record<string, string> = {};
      const flat = validated.error.flatten().fieldErrors;
      for (const [key, msgs] of Object.entries(flat)) {
        if (msgs && msgs[0]) nextErrors[key] = msgs[0];
      }
      setFieldErrors(nextErrors);
      return;
    }

    const token = await getToken();
    if (!token) {
      setSubmitError('Your session expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.submitComplaint(token, validated.data);
      setSubmittedResult({ complaint: res.complaint, analysis: res.analysis });
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const nextErrors: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(err.details)) {
          if (msgs && msgs[0]) nextErrors[key] = msgs[0];
        }
        setFieldErrors(nextErrors);
      }
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to submit complaint at this time.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    const { complaint, analysis } = submittedResult;
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-emerald-200 bg-white p-8">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
            <div className="space-y-2">
              <p className="font-mono text-sm font-semibold text-emerald-800">
                Reference ID: {complaint.referenceId}
              </p>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                {t.complaintSubmittedHeading}
              </h1>
              <p className="text-sm text-slate-600">
                {t.complaintSubmittedCopy}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
            <PriorityIndicator priority={analysis.finalPriority} />
            <StatusIndicator status={complaint.status} />
            <span className="text-xs font-medium text-slate-700">
              {analysis.source === 'GEMINI' ? t.aiSourceGemini : t.aiSourceFallback}
            </span>
          </div>

          {analysis.safetyEscalated && (
            <div
              role="note"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold">{t.safetyEscalatedNotice}</p>
                {analysis.safetyReasons.map((r) => (
                  <p key={r}>{r}</p>
                ))}
              </div>
            </div>
          )}

          {analysis.requiresHumanReview && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>{t.humanReviewRequired}</span>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">{t.assignedDepartment}</dt>
              <dd className="mt-1 font-semibold text-slate-900">{analysis.department}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Severity &amp; Confidence Estimate</dt>
              <dd className="mt-1 font-mono text-slate-900 tabular-nums">
                {analysis.severity}/5 · {Math.round(analysis.confidenceEstimate * 100)}%
              </dd>
              <p className="mt-1 text-[11px] text-slate-500">{t.aiConfidenceDisclaimer}</p>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">{t.publicImpactLabel}</dt>
              <dd className="mt-1 text-slate-800">{analysis.publicImpact}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">{t.recommendedActionLabel}</dt>
              <dd className="mt-1 text-slate-800">{analysis.recommendedAction}</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={`/citizen/complaints/${complaint.id}`}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {t.trackProgress}
            </Link>
            <Link
              to="/citizen"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              {t.returnToPortal}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        to="/citizen"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>{t.backToCitizenPortal}</span>
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          {t.submitFormTitle}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Submit in English or Tamil. You do not need to know the responsible municipal department.
        </p>

        {submitError && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          <div>
            <label htmlFor="complaint-title" className="block text-sm font-semibold text-slate-800">
              {t.fieldTitle} <span className="text-red-600">*</span>
            </label>
            <input
              id="complaint-title"
              type="text"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'title-error' : undefined}
              placeholder="e.g., Broken streetlight and exposed wire near Market Junction"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            />
            {fieldErrors.title && (
              <p id="title-error" className="mt-1 text-xs font-medium text-red-700">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="complaint-category" className="block text-sm font-semibold text-slate-800">
                {t.fieldCategory} <span className="text-red-600">*</span>
              </label>
              <select
                id="complaint-category"
                value={userCategory}
                onChange={(e) => setUserCategory(e.target.value as ComplaintCategory)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              >
                {COMPLAINT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t.categories[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="complaint-location" className="block text-sm font-semibold text-slate-800">
                {t.fieldLocation} <span className="text-red-600">*</span>
              </label>
              <input
                id="complaint-location"
                type="text"
                required
                maxLength={200}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                aria-invalid={Boolean(fieldErrors.location)}
                aria-describedby={fieldErrors.location ? 'location-error' : undefined}
                placeholder="e.g., 14th Cross Street, Anna Nagar"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
              {fieldErrors.location && (
                <p id="location-error" className="mt-1 text-xs font-medium text-red-700">
                  {fieldErrors.location}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="complaint-description" className="block text-sm font-semibold text-slate-800">
              {t.fieldDescription} <span className="text-red-600">*</span>
            </label>
            <textarea
              id="complaint-description"
              rows={4}
              required
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? 'desc-error' : undefined}
              placeholder="Describe the severity, how many residents or commuters are affected, and any safety hazards..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            />
            {fieldErrors.description && (
              <p id="desc-error" className="mt-1 text-xs font-medium text-red-700">
                {fieldErrors.description}
              </p>
            )}
          </div>

          {/* Optional GPS Coordinates */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">{t.fieldGps}</span>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={gpsLoading}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                <MapPin className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                <span>{gpsLoading ? 'Locating...' : t.detectGps}</span>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="gps-lat" className="block text-[11px] font-medium text-slate-600">
                  Latitude
                </label>
                <input
                  id="gps-lat"
                  type="text"
                  inputMode="decimal"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="13.0827"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="gps-lng" className="block text-[11px] font-medium text-slate-600">
                  Longitude
                </label>
                <input
                  id="gps-lng"
                  type="text"
                  inputMode="decimal"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="80.2707"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Optional Image Upload + Client Compression Preview */}
          <div className="space-y-3">
            <label htmlFor="complaint-photo" className="block text-sm font-semibold text-slate-800">
              {t.fieldPhoto}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="complaint-photo"
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-700"
              >
                <Upload className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>{t.selectPhotograph}</span>
                <input
                  id="complaint-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="sr-only"
                />
              </label>
              {imageMeta && <span className="text-xs text-slate-600">{imageMeta}</span>}
            </div>
            {fieldErrors.image && (
              <p className="text-xs font-medium text-red-700">{fieldErrors.image}</p>
            )}
            {imageDataUrl && (
              <div className="relative inline-block overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <img
                  src={imageDataUrl}
                  alt="Compressed citizen grievance photograph preview"
                  className="max-h-56 w-auto object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageDataUrl(undefined);
                    setImageMeta('');
                  }}
                  aria-label="Remove attached photograph"
                  className="absolute top-2 right-2 inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md bg-slate-900/80 text-white hover:bg-slate-900"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {previewAnalysis && (
            <section
              aria-label={t.aiPreviewHeading}
              className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{t.aiPreviewHeading}</h2>
                <PriorityIndicator priority={previewAnalysis.finalPriority} />
              </div>
              <p className="text-xs text-slate-700">
                {previewAnalysis.source === 'GEMINI' ? t.aiSourceGemini : t.aiSourceFallback} ·{' '}
                {t.assignedDepartment}: <span className="font-semibold">{previewAnalysis.department}</span>
              </p>
              {previewAnalysis.safetyEscalated && (
                <p className="text-xs font-semibold text-red-800">{t.safetyEscalatedNotice}</p>
              )}
              <p className="text-xs text-slate-700">{previewAnalysis.recommendedAction}</p>
              <p className="text-[11px] text-slate-500">{t.aiConfidenceDisclaimer}</p>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || previewing}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              {submitting ? t.submitting : t.submitComplaint}
            </button>
            <button
              type="button"
              disabled={previewing || submitting}
              onClick={handlePreviewTriage}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              <Sparkles className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <span>{previewing ? t.analyzingPreview : t.previewAiTriage}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
