import type {
  AdminNoteRecord,
  AuditLogRecord,
  AuthenticatedUser,
  ComplaintRecord,
  DepartmentConfig,
  DuplicateMatch,
  EnrichedAiAnalysis,
  PublicAggregateStats,
  StatusHistoryRecord,
} from '../shared/types';
import type { ComplaintSubmissionInput } from '../shared/validation';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  idToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const res = await fetch(path, { ...options, headers });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    details?: Record<string, string[]>;
  };

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error || `Request failed with status ${res.status}`,
      body.details
    );
  }

  return body as T;
}

export interface PaginatedComplaintsResponse {
  items: ComplaintRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const apiClient = {
  getAuthMe(idToken: string) {
    return apiFetch<{ user: AuthenticatedUser; departments: DepartmentConfig[] }>(
      '/api/auth/me',
      { method: 'GET' },
      idToken
    );
  },

  analyzePreview(
    idToken: string,
    input: {
      title: string;
      description: string;
      location: string;
      userCategory: ComplaintSubmissionInput['userCategory'];
      language: ComplaintSubmissionInput['language'];
      imageDataUrl?: string;
    }
  ) {
    return apiFetch<{ analysis: EnrichedAiAnalysis }>(
      '/api/ai/analyze',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      idToken
    );
  },

  submitComplaint(idToken: string, input: ComplaintSubmissionInput) {
    return apiFetch<{
      complaint: ComplaintRecord;
      analysis: EnrichedAiAnalysis;
      duplicates: DuplicateMatch[];
    }>(
      '/api/complaints',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      idToken
    );
  },

  getCitizenComplaints(
    idToken: string,
    params: {
      search?: string;
      category?: string;
      priority?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    }
  ) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'ALL') qs.set('category', params.category);
    if (params.priority && params.priority !== 'ALL') qs.set('priority', params.priority);
    if (params.status && params.status !== 'ALL') qs.set('status', params.status);
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 8));

    return apiFetch<PaginatedComplaintsResponse>(
      `/api/complaints?${qs.toString()}`,
      { method: 'GET' },
      idToken
    );
  },

  getComplaintDetail(idToken: string, id: string) {
    return apiFetch<{ complaint: ComplaintRecord; history: StatusHistoryRecord[] }>(
      `/api/complaints/${encodeURIComponent(id)}`,
      { method: 'GET' },
      idToken
    );
  },

  getAdminDashboard(idToken: string) {
    return apiFetch<{ stats: PublicAggregateStats; auditLogs: AuditLogRecord[] }>(
      '/api/admin/dashboard',
      { method: 'GET' },
      idToken
    );
  },

  getAdminComplaints(
    idToken: string,
    params: {
      search?: string;
      category?: string;
      priority?: string;
      status?: string;
      sortBy?: 'newest' | 'priority' | 'severity';
      page?: number;
      pageSize?: number;
    }
  ) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'ALL') qs.set('category', params.category);
    if (params.priority && params.priority !== 'ALL') qs.set('priority', params.priority);
    if (params.status && params.status !== 'ALL') qs.set('status', params.status);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 10));

    return apiFetch<PaginatedComplaintsResponse>(
      `/api/admin/complaints?${qs.toString()}`,
      { method: 'GET' },
      idToken
    );
  },

  getAdminComplaintDetail(idToken: string, id: string) {
    return apiFetch<{
      complaint: ComplaintRecord;
      history: StatusHistoryRecord[];
      notes: AdminNoteRecord[];
      duplicates: DuplicateMatch[];
    }>(`/api/admin/complaints/${encodeURIComponent(id)}`, { method: 'GET' }, idToken);
  },

  updateAdminComplaint(
    idToken: string,
    id: string,
    payload: {
      status?: string;
      priority?: string;
      assignedDepartment?: string;
      citizenVisibleUpdate?: string;
      requiresHumanReview?: boolean;
      statusNote?: string;
    }
  ) {
    return apiFetch<{ complaint: ComplaintRecord }>(
      `/api/admin/complaints/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      idToken
    );
  },

  addAdminNote(idToken: string, id: string, note: string) {
    return apiFetch<{ note: AdminNoteRecord }>(
      `/api/admin/complaints/${encodeURIComponent(id)}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      },
      idToken
    );
  },

  seedDemoData(idToken: string) {
    return apiFetch<{ seededCount: number }>(
      '/api/admin/seed-demo',
      { method: 'POST', body: JSON.stringify({}) },
      idToken
    );
  },

  getPublicStatistics() {
    return apiFetch<{ statistics: PublicAggregateStats }>('/api/public/statistics', {
      method: 'GET',
    });
  },
};
