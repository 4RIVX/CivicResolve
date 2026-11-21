import { z } from 'zod';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
} from './types';
import { DEPARTMENT_CODES } from './safetyRules';

// Bounds synchronized directly with firebase-blueprint.json
export const FIELD_LIMITS = {
  TITLE_MIN: 5,
  TITLE_MAX: 160,
  DESCRIPTION_MIN: 15,
  DESCRIPTION_MAX: 4000,
  LOCATION_MIN: 3,
  LOCATION_MAX: 200,
  AREA_MAX: 100,
  NOTE_MAX: 2000,
  UPDATE_MAX: 1000,
  IMAGE_DATA_URL_MAX: 260000,
  ID_MAX: 128,
} as const;

export const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const VALID_REFERENCE_PATTERN = /^CR-[0-9]{4}-[A-Z0-9]{6}$/;

export const complaintSubmissionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(FIELD_LIMITS.TITLE_MIN, 'Title must be at least 5 characters')
      .max(FIELD_LIMITS.TITLE_MAX, 'Title must be 160 characters or fewer'),
    description: z
      .string()
      .trim()
      .min(FIELD_LIMITS.DESCRIPTION_MIN, 'Description must be at least 15 characters')
      .max(FIELD_LIMITS.DESCRIPTION_MAX, 'Description must be 4000 characters or fewer'),
    location: z
      .string()
      .trim()
      .min(FIELD_LIMITS.LOCATION_MIN, 'Location must be at least 3 characters')
      .max(FIELD_LIMITS.LOCATION_MAX, 'Location must be 200 characters or fewer'),
    userCategory: z.enum(COMPLAINT_CATEGORIES),
    language: z.enum(['en', 'ta']).default('en'),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    imageDataUrl: z
      .string()
      .max(FIELD_LIMITS.IMAGE_DATA_URL_MAX, 'Compressed image exceeds Firestore-safe payload budget (260KB)')
      .optional(),
  })
  .strict();

export type ComplaintSubmissionInput = z.infer<typeof complaintSubmissionSchema>;

export const aiAnalyzeRequestSchema = z
  .object({
    title: z.string().trim().min(FIELD_LIMITS.TITLE_MIN).max(FIELD_LIMITS.TITLE_MAX),
    description: z.string().trim().min(FIELD_LIMITS.DESCRIPTION_MIN).max(FIELD_LIMITS.DESCRIPTION_MAX),
    location: z.string().trim().min(FIELD_LIMITS.LOCATION_MIN).max(FIELD_LIMITS.LOCATION_MAX),
    userCategory: z.enum(COMPLAINT_CATEGORIES),
    language: z.enum(['en', 'ta']).default('en'),
    imageDataUrl: z.string().max(FIELD_LIMITS.IMAGE_DATA_URL_MAX).optional(),
  })
  .strict();

export const aiResponseSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  subcategory: z.string().trim().min(2).max(64),
  priority: z.enum(COMPLAINT_PRIORITIES),
  severity: z.number().int().min(1).max(5),
  department: z.enum(DEPARTMENT_CODES),
  public_impact: z.string().trim().min(5).max(600),
  explanation: z.string().trim().min(5).max(1000),
  recommended_action: z.string().trim().min(5).max(600),
  confidence_estimate: z.number().min(0).max(1),
  requires_human_review: z.boolean(),
});

export const adminComplaintUpdateSchema = z
  .object({
    status: z.enum(COMPLAINT_STATUSES).optional(),
    priority: z.enum(COMPLAINT_PRIORITIES).optional(),
    assignedDepartment: z.enum(DEPARTMENT_CODES).optional(),
    citizenVisibleUpdate: z.string().trim().max(FIELD_LIMITS.UPDATE_MAX).optional(),
    requiresHumanReview: z.boolean().optional(),
    statusNote: z.string().trim().min(2).max(FIELD_LIMITS.UPDATE_MAX).optional(),
  })
  .strict();

export const adminNoteSchema = z.object({
  note: z.string().trim().min(2, 'Note cannot be empty').max(FIELD_LIMITS.NOTE_MAX),
});

export function extractNormalizedArea(location: string): string {
  const cleaned = location
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2) {
    return 'Central District';
  }
  return cleaned.slice(0, FIELD_LIMITS.AREA_MAX);
}

export function generateComplaintReferenceId(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return `CR-${year}-${suffix}`;
}
