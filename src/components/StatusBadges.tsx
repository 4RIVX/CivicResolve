import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
} from 'lucide-react';
import type { ComplaintPriority, ComplaintStatus } from '../shared/types';
import { useApp } from '../contexts/AppContext';

export function StatusIndicator({ status }: { status: ComplaintStatus }) {
  const { t } = useApp();

  if (status === 'RESOLVED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t.statuses.RESOLVED}</span>
      </span>
    );
  }

  if (status === 'IN_PROGRESS') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 whitespace-nowrap shrink-0">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t.statuses.IN_PROGRESS}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0">
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t.statuses.REPORTED}</span>
    </span>
  );
}

export function PriorityIndicator({ priority }: { priority: ComplaintPriority }) {
  const { t } = useApp();

  if (priority === 'CRITICAL') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 whitespace-nowrap shrink-0">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t.priorities.CRITICAL}</span>
      </span>
    );
  }

  if (priority === 'HIGH') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 whitespace-nowrap shrink-0">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t.priorities.HIGH}</span>
      </span>
    );
  }

  if (priority === 'MEDIUM') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900 whitespace-nowrap shrink-0">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t.priorities.MEDIUM}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t.priorities.LOW}</span>
    </span>
  );
}
