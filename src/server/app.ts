import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  adminComplaintUpdateSchema,
  adminNoteSchema,
  aiAnalyzeRequestSchema,
  complaintSubmissionSchema,
  extractNormalizedArea,
  generateComplaintReferenceId,
  VALID_ID_PATTERN,
} from '../shared/validation';
import { findPotentialDuplicates } from '../shared/duplicateDetection';
import { DEPARTMENT_DIRECTORY } from '../shared/safetyRules';
import type { ComplaintRecord } from '../shared/types';
import { getConfig, parseAllowedOrigins, type AppConfig } from './config';
import {
  createAuthMiddleware,
  createFirebaseTokenVerifier,
  type AuthenticatedRequest,
  type TokenVerifier,
} from './auth';
import { ComplaintAnalyzer, type GeminiClientLike } from './services/geminiService';
import {
  computeAggregateStats,
  type CivicDataStore,
} from './services/firestoreRestClient';
import { FirestoreAdminStore } from './services/firestoreAdminStore';
import { PublicStatsCache } from './services/publicStatsCache';
import { ImageValidationError, validateAndSanitizeImageDataUrl } from './utils/imageSecurity';

export interface AppDependencies {
  config?: AppConfig;
  verifyToken?: TokenVerifier;
  dataStore?: CivicDataStore;
  geminiClient?: GeminiClientLike;
  statsCache?: PublicStatsCache;
  disableRateLimit?: boolean;
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function getSafeClientIpKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || '127.0.0.1')}`;
}

function getVerifiedUidOrIpKey(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.uid) {
    return `uid:${authReq.user.uid}`;
  }
  return getSafeClientIpKey(req);
}

export function createApp(deps: AppDependencies = {}): express.Express {
  const config = deps.config ?? getConfig();
  const allowedOrigins =
    config.allowedOrigins ??
    parseAllowedOrigins(process.env.APP_URL, process.env.CORS_ALLOWED_ORIGINS, config.port);
  const verifyToken =
    deps.verifyToken ?? createFirebaseTokenVerifier(config.firebaseProjectId);
  const dataStore =
    deps.dataStore ??
    new FirestoreAdminStore(config.firebaseProjectId, config.firestoreDatabaseId);
  const analyzer = new ComplaintAnalyzer({
    geminiApiKey: config.geminiApiKey,
    geminiModel: config.geminiModel,
    geminiClient: deps.geminiClient,
  });
  const publicStatsCache = deps.statsCache ?? new PublicStatsCache({ ttlMs: 30_000 });

  const { requireAuth, requireAdmin } = createAuthMiddleware(config, verifyToken);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy:
        config.nodeEnv === 'development'
          ? false
          : {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://apis.google.com', 'https://accounts.google.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: [
                  "'self'",
                  'https://*.googleapis.com',
                  'https://*.firebaseapp.com',
                  'https://identitytoolkit.googleapis.com',
                  'https://securetoken.googleapis.com',
                ],
                frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'self'", 'https://aistudio.google.com', 'https://*.google.com'],
              },
            },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  // Strict CORS Allowlist for API routes (never wildcard on authenticated routes)
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }

    const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : '';
    const isSameHost =
      Boolean(hostHeader) &&
      (origin === `https://${hostHeader}` || origin === `http://${hostHeader}`);

    if (allowedOrigins.has(origin) || isSameHost) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
      return;
    }

    res.status(403).json({ error: 'Origin not permitted by CORS policy.' });
  });

  app.use(express.json({ limit: '512kb' }));

  app.use(['/api/auth', '/api/ai', '/api/complaints', '/api/admin'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  const makeLimiter = (options: {
    windowMs: number;
    max: number;
    keyGenerator: (req: Request) => string;
    message: string;
  }) =>
    rateLimit({
      windowMs: options.windowMs,
      max: deps.disableRateLimit ? 10000 : options.max,
      standardHeaders: true,
      legacyHeaders: false,
      validate: { trustProxy: false },
      keyGenerator: options.keyGenerator,
      message: { error: options.message },
    });

  // Rate limits tuned per role & sensitivity (Cloud Run single-hop proxy safe)
  const authPreLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: getSafeClientIpKey,
    message: 'Too many authentication checks. Please wait a minute.',
  });

  const complaintSubmitLimiter = makeLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: getVerifiedUidOrIpKey,
    message: 'Complaint submission rate limit reached (10/hour). Please try again later.',
  });

  const aiAnalyzeLimiter = makeLimiter({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyGenerator: getVerifiedUidOrIpKey,
    message: 'AI triage preview limit reached (20/hour). Please try again later.',
  });

  const adminMutationLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: getVerifiedUidOrIpKey,
    message: 'Administrative mutation rate limit reached (60/minute). Please slow down.',
  });

  const citizenReadLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: getVerifiedUidOrIpKey,
    message: 'Too many requests. Please wait a minute.',
  });

  const publicReadLimiter = makeLimiter({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: getSafeClientIpKey,
    message: 'Public API rate limit reached (120/minute). Please wait a moment.',
  });

  // --- Health Check (Cloud Run) ---
  app.get('/api/health', publicReadLimiter, (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'CivicResolve',
      model: config.geminiModel,
      geminiConfigured: Boolean(config.geminiApiKey),
      firestoreConfigured: Boolean(config.firebaseProjectId),
      timestamp: new Date().toISOString(),
    });
  });

  // --- Auth Session Inspection (Server-side Admin Allowlist Check) ---
  app.get(
    '/api/auth/me',
    authPreLimiter,
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      res.json({
        user: req.user,
        departments: Object.values(DEPARTMENT_DIRECTORY),
      });
    }
  );

  // --- Server-Side Gemini AI Preview Analysis ---
  app.post(
    '/api/ai/analyze',
    requireAuth,
    aiAnalyzeLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const parsed = aiAnalyzeRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: 'Invalid analysis request payload.',
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        let sanitizedImage: string | undefined;
        if (parsed.data.imageDataUrl) {
          const validated = await validateAndSanitizeImageDataUrl(parsed.data.imageDataUrl);
          sanitizedImage = validated.sanitizedDataUrl;
        }

        const analysis = await analyzer.analyze({
          ...parsed.data,
          imageDataUrl: sanitizedImage,
        });

        res.json({ analysis });
      } catch (err) {
        next(err);
      }
    }
  );

  // --- Citizen Routes ---
  app.post(
    '/api/complaints',
    requireAuth,
    complaintSubmitLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const idToken = req.idToken!;

        const parsed = complaintSubmissionSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: 'Complaint validation failed.',
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        let sanitizedImage: string | undefined;
        if (parsed.data.imageDataUrl) {
          const validated = await validateAndSanitizeImageDataUrl(parsed.data.imageDataUrl);
          sanitizedImage = validated.sanitizedDataUrl;
        }

        const analysis = await analyzer.analyze({
          title: parsed.data.title,
          description: parsed.data.description,
          location: parsed.data.location,
          userCategory: parsed.data.userCategory,
          language: parsed.data.language,
          imageDataUrl: sanitizedImage,
        });

        const area = extractNormalizedArea(parsed.data.location);
        const recent = await dataStore.listRecentComplaintsForDuplicateCheck(
          idToken,
          user.uid,
          user.isAdmin
        );

        const duplicates = findPotentialDuplicates(
          {
            title: parsed.data.title,
            description: parsed.data.description,
            location: parsed.data.location,
            area,
            category: analysis.category,
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
          },
          recent.map((c) => ({
            id: c.id,
            referenceId: c.referenceId,
            title: c.title,
            description: c.description,
            location: c.location,
            area: c.area,
            category: c.userCategory,
            status: c.status,
            latitude: c.latitude,
            longitude: c.longitude,
            createdAt: c.createdAt,
          }))
        );

        const referenceId = generateComplaintReferenceId();

        const complaintPayload: Omit<ComplaintRecord, 'id' | 'createdAt' | 'updatedAt'> = {
          referenceId,
          citizenUid: user.uid,
          citizenEmail: user.email,
          citizenName: user.name,
          title: parsed.data.title,
          description: parsed.data.description,
          location: parsed.data.location,
          area,
          ...(typeof parsed.data.latitude === 'number' ? { latitude: parsed.data.latitude } : {}),
          ...(typeof parsed.data.longitude === 'number' ? { longitude: parsed.data.longitude } : {}),
          hasImage: Boolean(sanitizedImage),
          ...(sanitizedImage ? { imageDataUrl: sanitizedImage } : {}),
          userCategory: parsed.data.userCategory,
          language: parsed.data.language,
          status: 'REPORTED',
          priority: analysis.finalPriority,
          severity: analysis.severity,
          department: analysis.department,
          assignedDepartment: analysis.department,
          subcategory: analysis.subcategory,
          aiSource: analysis.source,
          aiModel: analysis.model,
          aiExplanation: analysis.explanation,
          publicImpact: analysis.publicImpact,
          recommendedAction: analysis.recommendedAction,
          confidenceEstimate: analysis.confidenceEstimate,
          safetyEscalated: analysis.safetyEscalated,
          safetyReasons: analysis.safetyReasons,
          requiresHumanReview: analysis.requiresHumanReview,
          citizenVisibleUpdate:
            'Complaint received and routed for municipal review.',
          potentialDuplicateIds: duplicates.map((d) => d.complaintId),
          duplicateScore: duplicates[0]?.score ?? 0,
          isDemo: false,
        };

        const created = await dataStore.createComplaintWithRecords({
          idToken,
          complaint: complaintPayload,
          initialHistory: {
            previousStatus: 'NONE',
            newStatus: 'REPORTED',
            changedByUid: user.uid,
            changedByRole: 'CITIZEN',
            note: `Complaint ${referenceId} submitted (${analysis.source} triage, priority ${analysis.finalPriority}).`,
            citizenVisible: true,
          },
          auditLog: {
            action: 'COMPLAINT_SUBMITTED',
            actorUid: user.uid,
            actorEmail: user.email,
            actorRole: 'CITIZEN',
            targetType: 'COMPLAINT',
            targetId: referenceId,
            details: `Citizen submitted complaint ${referenceId} in ${parsed.data.language.toUpperCase()} (${analysis.department}).`,
          },
        });
        publicStatsCache.invalidate();

        res.status(201).json({
          complaint: created,
          analysis,
          duplicates,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/complaints',
    requireAuth,
    citizenReadLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const idToken = req.idToken!;
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 10);

        const result = await dataStore.listComplaints(idToken, {
          citizenUid: user.uid,
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          category: typeof req.query.category === 'string' ? req.query.category : undefined,
          priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          sortBy: 'newest',
          page: Number.isFinite(page) ? page : 1,
          pageSize: Number.isFinite(pageSize) ? pageSize : 10,
        });

        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/complaints/:id',
    requireAuth,
    citizenReadLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const complaintId = String(req.params.id);
        if (!VALID_ID_PATTERN.test(complaintId)) {
          res.status(400).json({ error: 'Invalid complaint identifier.' });
          return;
        }
        const complaint = await dataStore.getComplaintById(req.idToken!, complaintId);
        if (!complaint) {
          res.status(404).json({ error: 'Complaint not found.' });
          return;
        }
        if (complaint.citizenUid !== req.user!.uid && !req.user!.isAdmin) {
          res.status(403).json({ error: 'You do not have permission to view this complaint.' });
          return;
        }
        const history = await dataStore.getStatusHistory(req.idToken!, complaintId);
        res.json({
          complaint,
          history: history.filter((h) => h.citizenVisible || req.user!.isAdmin),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/complaints/:id/history',
    requireAuth,
    citizenReadLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const complaintId = String(req.params.id);
        if (!VALID_ID_PATTERN.test(complaintId)) {
          res.status(400).json({ error: 'Invalid complaint identifier.' });
          return;
        }
        const complaint = await dataStore.getComplaintById(req.idToken!, complaintId);
        if (!complaint) {
          res.status(404).json({ error: 'Complaint not found.' });
          return;
        }
        if (complaint.citizenUid !== req.user!.uid && !req.user!.isAdmin) {
          res.status(403).json({ error: 'Access denied.' });
          return;
        }
        const history = await dataStore.getStatusHistory(req.idToken!, complaintId);
        res.json({ history: history.filter((h) => h.citizenVisible || req.user!.isAdmin) });
      } catch (err) {
        next(err);
      }
    }
  );

  // --- Administrator Routes (Server-Side Allowlist Enforced) ---
  app.get(
    '/api/admin/dashboard',
    requireAuth,
    requireAdmin,
    citizenReadLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const all = await dataStore.listComplaints(req.idToken!, {
          page: 1,
          pageSize: 200,
        });
        const stats = computeAggregateStats(all.items);
        await dataStore.reconcilePublicStats(req.idToken!, stats);
        publicStatsCache.invalidate();
        const auditLogs = await dataStore.listAuditLogs(req.idToken!, 20);
        res.json({ stats, auditLogs });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/admin/complaints',
    requireAuth,
    requireAdmin,
    citizenReadLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 12);
        const sortBy =
          req.query.sortBy === 'priority' || req.query.sortBy === 'severity'
            ? req.query.sortBy
            : 'newest';

        const result = await dataStore.listComplaints(req.idToken!, {
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          category: typeof req.query.category === 'string' ? req.query.category : undefined,
          priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          sortBy,
          page: Number.isFinite(page) ? page : 1,
          pageSize: Number.isFinite(pageSize) ? pageSize : 12,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/admin/complaints/:id',
    requireAuth,
    requireAdmin,
    citizenReadLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const complaintId = String(req.params.id);
        if (!VALID_ID_PATTERN.test(complaintId)) {
          res.status(400).json({ error: 'Invalid complaint identifier.' });
          return;
        }
        const complaint = await dataStore.getComplaintById(req.idToken!, complaintId);
        if (!complaint) {
          res.status(404).json({ error: 'Complaint not found.' });
          return;
        }

        const [history, notes, allRecent] = await Promise.all([
          dataStore.getStatusHistory(req.idToken!, complaintId),
          dataStore.getAdminNotes(req.idToken!, complaintId),
          dataStore.listRecentComplaintsForDuplicateCheck(
            req.idToken!,
            req.user!.uid,
            true
          ),
        ]);

        const duplicates = findPotentialDuplicates(
          {
            id: complaint.id,
            title: complaint.title,
            description: complaint.description,
            location: complaint.location,
            area: complaint.area,
            category: complaint.userCategory,
            latitude: complaint.latitude,
            longitude: complaint.longitude,
            createdAt: complaint.createdAt,
          },
          allRecent.map((c) => ({
            id: c.id,
            referenceId: c.referenceId,
            title: c.title,
            description: c.description,
            location: c.location,
            area: c.area,
            category: c.userCategory,
            status: c.status,
            latitude: c.latitude,
            longitude: c.longitude,
            createdAt: c.createdAt,
          }))
        );

        res.json({ complaint, history, notes, duplicates });
      } catch (err) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/admin/complaints/:id',
    requireAuth,
    requireAdmin,
    adminMutationLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const complaintId = String(req.params.id);
        if (!VALID_ID_PATTERN.test(complaintId)) {
          res.status(400).json({ error: 'Invalid complaint identifier.' });
          return;
        }

        const parsed = adminComplaintUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: 'Invalid administrator update payload.',
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        const existing = await dataStore.getComplaintById(req.idToken!, complaintId);
        if (!existing) {
          res.status(404).json({ error: 'Complaint not found.' });
          return;
        }

        const nextStatus = parsed.data.status ?? existing.status;
        const markResolved =
          nextStatus === 'RESOLVED' && existing.status !== 'RESOLVED';

        const updates: Partial<ComplaintRecord> = {};
        if (parsed.data.status !== undefined) updates.status = parsed.data.status;
        if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
        if (parsed.data.assignedDepartment !== undefined) {
          updates.assignedDepartment = parsed.data.assignedDepartment;
        }
        if (parsed.data.citizenVisibleUpdate !== undefined) {
          updates.citizenVisibleUpdate = parsed.data.citizenVisibleUpdate;
        }
        if (parsed.data.requiresHumanReview !== undefined) {
          updates.requiresHumanReview = parsed.data.requiresHumanReview;
        }

        const noteSummary =
          parsed.data.statusNote ||
          parsed.data.citizenVisibleUpdate ||
          `Updated status to ${nextStatus}, priority ${updates.priority ?? existing.priority}, dept ${updates.assignedDepartment ?? existing.assignedDepartment}.`;

        const updated = await dataStore.updateComplaintByAdmin({
          idToken: req.idToken!,
          complaintId,
          existing,
          updates,
          markResolved,
          historyEntry: {
            previousStatus: existing.status,
            newStatus: nextStatus,
            changedByUid: req.user!.uid,
            changedByRole: 'ADMIN',
            note: noteSummary,
            citizenVisible: true,
          },
          auditLog: {
            action: 'ADMIN_COMPLAINT_UPDATED',
            actorUid: req.user!.uid,
            actorEmail: req.user!.email,
            actorRole: 'ADMIN',
            targetType: 'COMPLAINT',
            targetId: complaintId,
            details: `Admin updated ${existing.referenceId}: ${noteSummary}`,
          },
        });
        publicStatsCache.invalidate();

        res.json({ complaint: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/admin/complaints/:id/notes',
    requireAuth,
    requireAdmin,
    adminMutationLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const complaintId = String(req.params.id);
        if (!VALID_ID_PATTERN.test(complaintId)) {
          res.status(400).json({ error: 'Invalid complaint identifier.' });
          return;
        }

        const parsed = adminNoteSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: 'Invalid internal note.',
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        const existing = await dataStore.getComplaintById(req.idToken!, complaintId);
        if (!existing) {
          res.status(404).json({ error: 'Complaint not found.' });
          return;
        }

        const note = await dataStore.addAdminNote({
          idToken: req.idToken!,
          complaintId,
          note: {
            complaintId,
            authorUid: req.user!.uid,
            authorEmail: req.user!.email,
            note: parsed.data.note,
            internalOnly: true,
          },
          auditLog: {
            action: 'ADMIN_INTERNAL_NOTE_ADDED',
            actorUid: req.user!.uid,
            actorEmail: req.user!.email,
            actorRole: 'ADMIN',
            targetType: 'NOTE',
            targetId: complaintId,
            details: `Added internal note to ${existing.referenceId}.`,
          },
        });

        res.status(201).json({ note });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/admin/audit-logs',
    requireAuth,
    requireAdmin,
    citizenReadLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const logs = await dataStore.listAuditLogs(req.idToken!, 60);
        res.json({ logs });
      } catch (err) {
        next(err);
      }
    }
  );

  // Admin-only clearly labeled demonstration dataset seeder
  app.post(
    '/api/admin/seed-demo',
    requireAuth,
    requireAdmin,
    adminMutationLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const idToken = req.idToken!;
        const samples = [
          {
            title: '[DEMO] Deep crater pothole near Anna Nagar Roundtana bus bay',
            description:
              'Demonstration record: A deep 2-meter asphalt depression near the main bus stop has caused two-wheeler skids during evening traffic.',
            location: 'Anna Nagar Roundtana, Chennai',
            userCategory: 'ROAD_INFRASTRUCTURE' as const,
            language: 'en' as const,
            latitude: 13.085,
            longitude: 80.2101,
          },
          {
            title: '[DEMO] Open manhole cover on Gandhi Street pedestrian crossing',
            description:
              'Demonstration record: Missing cast-iron manhole cover next to the school crosswalk creates an immediate fall hazard.',
            location: 'Gandhi Street, T. Nagar',
            userCategory: 'DRAINAGE_SEWAGE' as const,
            language: 'en' as const,
            latitude: 13.0418,
            longitude: 80.2341,
          },
          {
            title: '[DEMO] தெருவிளக்கு எரியாததால் இரவு நேரப் பாதுகாப்பு சிக்கல்',
            description:
              'Demonstration record: காமராஜர் சாலையில் மூன்று தெருவிளக்குகள் கடந்த ஐந்து நாட்களாக எரியவில்லை.',
            location: 'Kamarajar Salai, Adyar',
            userCategory: 'STREETLIGHTS' as const,
            language: 'ta' as const,
            latitude: 13.0012,
            longitude: 80.2565,
          },
        ];

        const created: ComplaintRecord[] = [];
        for (const s of samples) {
          const analysis = await analyzer.analyze(s);
          const refId = generateComplaintReferenceId();
          const rec = await dataStore.createComplaintWithRecords({
            idToken,
            complaint: {
              referenceId: refId,
              citizenUid: user.uid,
              citizenEmail: user.email,
              citizenName: `${user.name} (Demo Seed)`,
              title: s.title,
              description: s.description,
              location: s.location,
              area: extractNormalizedArea(s.location),
              latitude: s.latitude,
              longitude: s.longitude,
              hasImage: false,
              userCategory: s.userCategory,
              language: s.language,
              status: 'REPORTED',
              priority: analysis.finalPriority,
              severity: analysis.severity,
              department: analysis.department,
              assignedDepartment: analysis.department,
              subcategory: analysis.subcategory,
              aiSource: analysis.source,
              aiModel: analysis.model,
              aiExplanation: analysis.explanation,
              publicImpact: analysis.publicImpact,
              recommendedAction: analysis.recommendedAction,
              confidenceEstimate: analysis.confidenceEstimate,
              safetyEscalated: analysis.safetyEscalated,
              safetyReasons: analysis.safetyReasons,
              requiresHumanReview: analysis.requiresHumanReview,
              citizenVisibleUpdate: 'Demonstration record seeded by administrator.',
              potentialDuplicateIds: [],
              duplicateScore: 0,
              isDemo: true,
            },
            initialHistory: {
              previousStatus: 'NONE',
              newStatus: 'REPORTED',
              changedByUid: user.uid,
              changedByRole: 'ADMIN',
              note: 'Clearly labeled demonstration record seeded.',
              citizenVisible: true,
            },
            auditLog: {
              action: 'DEMO_DATA_SEEDED',
              actorUid: user.uid,
              actorEmail: user.email,
              actorRole: 'ADMIN',
              targetType: 'COMPLAINT',
              targetId: refId,
              details: `Seeded labeled demonstration record ${refId}.`,
            },
          });
          created.push(rec);
        }

        publicStatsCache.invalidate();
        res.status(201).json({ seededCount: created.length, records: created });
      } catch (err) {
        next(err);
      }
    }
  );

  // --- Public Transparency Routes (Strict Zero-PII Aggregates Only, 30s TTL Cached) ---
  app.get('/api/public/statistics', publicReadLimiter, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await publicStatsCache.getStats(() => dataStore.getPublicAggregateStats());
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({ statistics: stats });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/public/trends', publicReadLimiter, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await publicStatsCache.getStats(() => dataStore.getPublicAggregateStats());
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        trends: stats.monthlyTrends,
        byArea: stats.byArea,
        byCategory: stats.byCategory,
        byPriority: stats.byPriority,
        updatedAt: stats.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // Centralized Safe Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ImageValidationError || err instanceof HttpError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ error: 'Request could not be authorized or validated.' });
      return;
    }

    res.status(500).json({
      error: 'An unexpected server error occurred while processing the request.',
    });
  });

  return app;
}
