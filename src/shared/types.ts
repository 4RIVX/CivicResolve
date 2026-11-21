export const COMPLAINT_CATEGORIES = [
  'ROAD_INFRASTRUCTURE',
  'GARBAGE_WASTE',
  'STREETLIGHTS',
  'WATER_SUPPLY',
  'DRAINAGE_SEWAGE',
  'PUBLIC_SAFETY',
  'SANITATION',
  'OTHER',
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_STATUSES = ['REPORTED', 'IN_PROGRESS', 'RESOLVED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export type SupportedLanguage = 'en' | 'ta';
export type UserRole = 'CITIZEN' | 'ADMIN';
export type AiSource = 'GEMINI' | 'FALLBACK';

export interface DepartmentConfig {
  code: string;
  labelEn: string;
  labelTa: string;
  categories: ComplaintCategory[];
  slaHours: number;
}

export interface AiAnalysisOutput {
  category: ComplaintCategory;
  subcategory: string;
  priority: ComplaintPriority;
  severity: number;
  department: string;
  public_impact: string;
  explanation: string;
  recommended_action: string;
  confidence_estimate: number;
  requires_human_review: boolean;
}

export interface EnrichedAiAnalysis {
  source: AiSource;
  model: string;
  category: ComplaintCategory;
  subcategory: string;
  aiPriority: ComplaintPriority;
  finalPriority: ComplaintPriority;
  safetyEscalated: boolean;
  safetyReasons: string[];
  severity: number;
  department: string;
  publicImpact: string;
  explanation: string;
  recommendedAction: string;
  confidenceEstimate: number;
  requiresHumanReview: boolean;
  analyzedAt: string;
}

export interface DuplicateMatch {
  complaintId: string;
  referenceId: string;
  title: string;
  location: string;
  status: ComplaintStatus;
  score: number;
  reasons: string[];
  distanceMeters?: number;
}

export interface ComplaintRecord {
  id: string;
  referenceId: string;
  citizenUid: string;
  citizenEmail: string;
  citizenName: string;
  title: string;
  description: string;
  location: string;
  area: string;
  latitude?: number;
  longitude?: number;
  hasImage: boolean;
  imageDataUrl?: string;
  userCategory: ComplaintCategory;
  language: SupportedLanguage;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  severity: number;
  department: string;
  assignedDepartment: string;
  subcategory: string;
  aiSource: AiSource;
  aiModel: string;
  aiExplanation: string;
  publicImpact: string;
  recommendedAction: string;
  confidenceEstimate: number;
  safetyEscalated: boolean;
  safetyReasons: string[];
  requiresHumanReview: boolean;
  citizenVisibleUpdate: string;
  potentialDuplicateIds: string[];
  duplicateScore: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface StatusHistoryRecord {
  id: string;
  complaintId: string;
  previousStatus: 'NONE' | ComplaintStatus;
  newStatus: ComplaintStatus;
  changedByUid: string;
  changedByRole: 'CITIZEN' | 'ADMIN' | 'SYSTEM';
  note: string;
  citizenVisible: boolean;
  createdAt: string;
}

export interface AdminNoteRecord {
  id: string;
  complaintId: string;
  authorUid: string;
  authorEmail: string;
  note: string;
  internalOnly: boolean;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  targetType: 'COMPLAINT' | 'NOTE' | 'SYSTEM';
  targetId: string;
  details: string;
  createdAt: string;
}

export interface MonthlyTrendPoint {
  month: string;
  reported: number;
  resolved: number;
}

export interface PublicAggregateStats {
  totalReported: number;
  reportedCount: number;
  inProgressCount: number;
  resolvedCount: number;
  criticalCount: number;
  resolutionRate: number;
  avgResolutionHours: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byDepartment: Record<string, number>;
  byArea: Record<string, number>;
  monthlyTrends: MonthlyTrendPoint[];
  updatedAt: string;
}

export interface AuthenticatedUser {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: UserRole;
  isAdmin: boolean;
}
