import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../shared/types';
import type { AppConfig } from './config';
import { VALID_ID_PATTERN } from '../shared/validation';

export interface VerifiedTokenPayload {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export type TokenVerifier = (idToken: string) => Promise<VerifiedTokenPayload>;

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  idToken?: string;
}

export function createFirebaseTokenVerifier(projectId: string): TokenVerifier {
  return async (idToken: string): Promise<VerifiedTokenPayload> => {
    if (!projectId) {
      throw new Error('Firebase project ID is not configured');
    }
    const app = getApps().length
      ? getApp()
      : initializeApp({ projectId });
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
    };
  };
}

export function isAdminEmail(
  email: string | undefined,
  emailVerified: boolean | undefined,
  allowlist: Set<string>
): boolean {
  if (!email || emailVerified !== true) {
    return false;
  }
  return allowlist.has(email.trim().toLowerCase());
}

export function buildAuthenticatedUser(
  payload: VerifiedTokenPayload,
  adminAllowlist: Set<string>
): AuthenticatedUser {
  const email = (payload.email || '').trim().toLowerCase();
  const emailVerified = payload.email_verified === true;
  const admin = isAdminEmail(email, emailVerified, adminAllowlist);

  return {
    uid: payload.uid,
    email: email || `${payload.uid}@citizen.local`,
    name: payload.name || (email ? email.split('@')[0] : 'Citizen'),
    emailVerified,
    role: admin ? 'ADMIN' : 'CITIZEN',
    isAdmin: admin,
  };
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token || token.length < 10) return null;
  return token.trim();
}

export function createAuthMiddleware(config: AppConfig, verifyToken: TokenVerifier) {
  const requireAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }

    try {
      const payload = await verifyToken(token);
      if (
        !payload ||
        typeof payload.uid !== 'string' ||
        payload.uid.length === 0 ||
        payload.uid.length > 128 ||
        !VALID_ID_PATTERN.test(payload.uid)
      ) {
        res.status(401).json({ error: 'Invalid authentication token.' });
        return;
      }
      if (payload.email_verified !== true) {
        res.status(403).json({ error: 'Verified email address is required.' });
        return;
      }
      const normalizedEmail =
        typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (!normalizedEmail || !normalizedEmail.includes('@') || normalizedEmail.length > 200) {
        res.status(403).json({ error: 'A valid verified email address is required.' });
        return;
      }

      req.user = buildAuthenticatedUser(payload, config.adminEmails);
      req.idToken = token;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired authentication session.' });
    }
  };

  const requireAdmin = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!req.user.isAdmin || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Administrator authorization required.' });
      return;
    }
    next();
  };

  return { requireAuth, requireAdmin };
}
