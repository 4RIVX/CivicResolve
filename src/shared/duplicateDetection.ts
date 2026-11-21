import { ComplaintCategory, ComplaintStatus, DuplicateMatch } from './types';

export interface DuplicateCandidate {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  location: string;
  area: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  latitude?: number;
  longitude?: number;
  createdAt: string;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'near', 'road',
  'street', 'there', 'been', 'here', 'area', 'very', 'please', 'issue', 'problem',
  'days', 'since', 'around', 'into', 'onto', 'over', 'under',
]);

export function tokenizeText(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return new Set(tokens);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function findPotentialDuplicates(
  target: {
    id?: string;
    title: string;
    description: string;
    location: string;
    area: string;
    category: ComplaintCategory;
    latitude?: number;
    longitude?: number;
    createdAt?: string;
  },
  candidates: DuplicateCandidate[],
  threshold = 0.42
): DuplicateMatch[] {
  const targetDescTokens = tokenizeText(`${target.title} ${target.description}`);
  const targetLocTokens = tokenizeText(`${target.location} ${target.area}`);
  const targetTime = target.createdAt ? Date.parse(target.createdAt) : Date.now();

  const matches: DuplicateMatch[] = [];

  for (const candidate of candidates) {
    if (target.id && candidate.id === target.id) continue;

    let score = 0;
    const reasons: string[] = [];

    if (candidate.category === target.category) {
      score += 0.2;
      reasons.push(`Matching category (${candidate.category})`);
    }

    const candDescTokens = tokenizeText(`${candidate.title} ${candidate.description}`);
    const textSim = jaccardSimilarity(targetDescTokens, candDescTokens);
    if (textSim >= 0.15) {
      const contribution = Math.min(0.4, textSim * 0.8);
      score += contribution;
      reasons.push(`Description overlap (${Math.round(textSim * 100)}%)`);
    }

    const candLocTokens = tokenizeText(`${candidate.location} ${candidate.area}`);
    const locSim = jaccardSimilarity(targetLocTokens, candLocTokens);
    if (locSim >= 0.25) {
      score += Math.min(0.25, locSim * 0.35);
      reasons.push(`Similar location (${candidate.area})`);
    }

    let distanceMeters: number | undefined;
    if (
      typeof target.latitude === 'number' &&
      typeof target.longitude === 'number' &&
      typeof candidate.latitude === 'number' &&
      typeof candidate.longitude === 'number'
    ) {
      distanceMeters = Math.round(
        haversineDistanceMeters(
          target.latitude,
          target.longitude,
          candidate.latitude,
          candidate.longitude
        )
      );
      if (distanceMeters <= 150) {
        score += 0.3;
        reasons.push(`GPS within ${distanceMeters}m`);
      } else if (distanceMeters <= 500) {
        score += 0.15;
        reasons.push(`GPS within ${distanceMeters}m`);
      }
    }

    const candTime = Date.parse(candidate.createdAt);
    if (!Number.isNaN(candTime) && !Number.isNaN(targetTime)) {
      const hoursDiff = Math.abs(targetTime - candTime) / (1000 * 60 * 60);
      if (hoursDiff <= 168) {
        score += 0.1;
        reasons.push('Reported within 7 days');
      }
    }

    const clamped = Number(Math.min(1, score).toFixed(2));
    if (clamped >= threshold) {
      matches.push({
        complaintId: candidate.id,
        referenceId: candidate.referenceId,
        title: candidate.title,
        location: candidate.location,
        status: candidate.status,
        score: clamped,
        reasons,
        distanceMeters,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}
