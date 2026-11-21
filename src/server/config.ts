import fs from 'fs';
import path from 'path';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  geminiApiKey: string;
  geminiModel: string;
  adminEmails: Set<string>;
  firebaseProjectId: string;
  firestoreDatabaseId: string;
  allowedOrigins?: Set<string>;
}

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw) as FirebaseAppletConfig;
    }
  } catch {
    // Fallback to environment variables during isolated test runs
  }
  return {};
}

export function parseAdminAllowlist(rawEmails?: string, fallbackEmail?: string): Set<string> {
  const combined = [rawEmails ?? '', fallbackEmail ?? '']
    .join(',')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0 && entry.includes('@'));

  return new Set(combined);
}

export function parseAllowedOrigins(appUrl?: string, extraOrigins?: string, port = 3000): Set<string> {
  const origins = new Set<string>([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
  for (const raw of [appUrl ?? '', extraOrigins ?? ''].join(',').split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed origin URLs
    }
  }
  return origins;
}

export function getConfig(): AppConfig {
  const fb = loadFirebaseAppletConfig();
  const portNum = Number(process.env.PORT || 3000);
  const port = Number.isFinite(portNum) && portNum > 0 ? portNum : 3000;
  const geminiModel = (process.env.GEMINI_MODEL || 'gemini-4-hydrogen').trim();
  const adminEmails = parseAdminAllowlist(
    process.env.ADMIN_EMAILS,
    process.env.ADMIN_EMAIL
  );

  return {
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
    geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
    geminiModel,
    adminEmails,
    firebaseProjectId: (process.env.FIREBASE_PROJECT_ID || fb.projectId || '').trim(),
    firestoreDatabaseId: (
      process.env.FIRESTORE_DATABASE_ID ||
      fb.firestoreDatabaseId ||
      '(default)'
    ).trim(),
    allowedOrigins: parseAllowedOrigins(process.env.APP_URL, process.env.CORS_ALLOWED_ORIGINS, port),
  };
}
