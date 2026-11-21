import { afterEach, describe, expect, it } from 'vitest';
import {
  complaintSubmissionSchema,
  extractNormalizedArea,
  generateComplaintReferenceId,
} from '../src/shared/validation';
import {
  applyDeterministicSafetyRules,
  classifyWithRuleFallback,
  mapCategoryToDepartment,
  normalizeDepartmentCode,
} from '../src/shared/safetyRules';
import {
  findPotentialDuplicates,
  haversineDistanceMeters,
} from '../src/shared/duplicateDetection';
import sharp from 'sharp';
import { validateAndSanitizeImageDataUrl } from '../src/server/utils/imageSecurity';
import { buildAuthenticatedUser, extractBearerToken, isAdminEmail } from '../src/server/auth';
import { getConfig, parseAdminAllowlist } from '../src/server/config';
import type { Request } from 'express';

describe('Validation & Reference Utilities', () => {
  it('validates a well-formed bilingual complaint submission', () => {
    const res = complaintSubmissionSchema.safeParse({
      title: 'Deep pothole near Central Bus Stand',
      description: 'A large water-filled pothole has caused two scooter skids since yesterday.',
      location: 'Anna Salai, Chennai',
      userCategory: 'ROAD_INFRASTRUCTURE',
      language: 'en',
      latitude: 13.0827,
      longitude: 80.2707,
    });
    expect(res.success).toBe(true);
  });

  it('rejects too-short title or invalid GPS bounds', () => {
    const res = complaintSubmissionSchema.safeParse({
      title: 'Bad',
      description: 'Too short',
      location: 'X',
      userCategory: 'OTHER',
      latitude: 120,
    });
    expect(res.success).toBe(false);
  });

  it('generates valid CR-YYYY-XXXXXX reference IDs and normalizes areas', () => {
    const ref = generateComplaintReferenceId(new Date('2026-11-20T00:00:00Z'));
    expect(ref).toMatch(/^CR-2026-[A-Z0-9]{6}$/);
    expect(extractNormalizedArea('14th Cross Street, Anna Nagar, Chennai')).toBe('14th Cross Street');
    expect(extractNormalizedArea('   ')).toBe('Central District');
  });
});

describe('Department Mapping & Deterministic Safety Escalation', () => {
  it('maps categories and raw AI department strings across all domains', () => {
    expect(mapCategoryToDepartment('STREETLIGHTS')).toBe('ELECTRICAL_LIGHTING');
    expect(mapCategoryToDepartment('SANITATION')).toBe('SANITATION_WASTE');
    expect(mapCategoryToDepartment('GARBAGE_WASTE')).toBe('SANITATION_WASTE');
    expect(normalizeDepartmentCode('Highway Paving Dept', 'OTHER')).toBe('ROADS_PUBLIC_WORKS');
    expect(normalizeDepartmentCode('Solid Waste Collection', 'OTHER')).toBe('SANITATION_WASTE');
    expect(normalizeDepartmentCode('Stormwater Drain Division', 'OTHER')).toBe('STORMWATER_DRAINAGE');
    expect(normalizeDepartmentCode('Civic Safety Patrol', 'OTHER')).toBe('PUBLIC_SAFETY_ENFORCEMENT');
    expect(normalizeDepartmentCode('Sanitation & Hygiene', 'OTHER')).toBe('SANITATION_WASTE');
    expect(normalizeDepartmentCode('Municipal Electric Board', 'OTHER')).toBe('ELECTRICAL_LIGHTING');
    expect(normalizeDepartmentCode('Unknown Bureau', 'WATER_SUPPLY')).toBe('WATER_RESOURCES');
  });

  it('escalates exposed live wire complaints to CRITICAL even if AI says MEDIUM with low confidence', () => {
    const enriched = applyDeterministicSafetyRules({
      title: 'Sparking pole with live wire hanging over sidewalk',
      description: 'An exposed wire near the bus shelter is sparking in the rain.',
      source: 'GEMINI',
      model: 'gemini-4-hydrogen',
      aiOutput: {
        category: 'STREETLIGHTS',
        subcategory: 'POLE_DAMAGE',
        priority: 'MEDIUM',
        severity: 2,
        department: 'ELECTRICAL_LIGHTING',
        public_impact: 'Street lighting outage.',
        explanation: 'Reported damaged pole.',
        recommended_action: 'Dispatch crew.',
        confidence_estimate: 0.42,
        requires_human_review: false,
      },
    });

    expect(enriched.finalPriority).toBe('CRITICAL');
    expect(enriched.severity).toBe(5);
    expect(enriched.safetyEscalated).toBe(true);
    expect(enriched.requiresHumanReview).toBe(true);
    expect(enriched.safetyReasons.length).toBeGreaterThan(0);
  });

  it('escalates Tamil open manhole, flood, fire/gas, and contaminated water hazards accurately', () => {
    const manhole = applyDeterministicSafetyRules({
      title: 'திறந்த சாக்கடை குழி ஆபத்து',
      description: 'பள்ளி அருகே மூடியில்லாத ஆள்துளை குழி உள்ளது.',
      source: 'GEMINI',
      model: 'gemini-4-hydrogen',
      aiOutput: {
        category: 'DRAINAGE_SEWAGE',
        subcategory: 'MANHOLE',
        priority: 'LOW',
        severity: 2,
        department: 'STORMWATER_DRAINAGE',
        public_impact: 'Drainage hazard',
        explanation: 'Open pit reported.',
        recommended_action: 'Cover manhole.',
        confidence_estimate: 0.88,
        requires_human_review: false,
      },
    });
    expect(manhole.finalPriority).toBe('CRITICAL');
    expect(manhole.safetyEscalated).toBe(true);

    const gas = applyDeterministicSafetyRules({
      title: 'Strong gas leak smell near transformer',
      description: 'Possible gas leak and smoke odor beside market corner.',
      source: 'GEMINI',
      model: 'gemini-4-hydrogen',
      aiOutput: {
        category: 'PUBLIC_SAFETY',
        subcategory: 'GAS_LEAK',
        priority: 'LOW',
        severity: 2,
        department: 'PUBLIC_SAFETY_ENFORCEMENT',
        public_impact: 'Hazard',
        explanation: 'Gas odor.',
        recommended_action: 'Inspect.',
        confidence_estimate: 0.9,
        requires_human_review: false,
      },
    });
    expect(gas.finalPriority).toBe('CRITICAL');

    const schoolZone = applyDeterministicSafetyRules({
      title: 'Contaminated water near school zone',
      description: 'Dirty drinking water supply reported outside school zone clinic.',
      source: 'GEMINI',
      model: 'gemini-4-hydrogen',
      aiOutput: {
        category: 'WATER_SUPPLY',
        subcategory: 'CONTAMINATION',
        priority: 'LOW',
        severity: 2,
        department: 'WATER_RESOURCES',
        public_impact: 'Health risk.',
        explanation: 'Water issue.',
        recommended_action: 'Test water.',
        confidence_estimate: 0.85,
        requires_human_review: false,
      },
    });
    expect(schoolZone.finalPriority).toBe('HIGH');
    expect(schoolZone.severity).toBeGreaterThanOrEqual(4);
  });

  it('produces honest English and Tamil rule-based fallbacks flagged for human review', () => {
    const enFallback = classifyWithRuleFallback({
      title: 'Overflowing garbage bins near market',
      description: 'Garbage waste has piled up for four days.',
      userCategory: 'GARBAGE_WASTE',
      language: 'en',
    });
    expect(enFallback.category).toBe('GARBAGE_WASTE');
    expect(enFallback.requires_human_review).toBe(true);
    expect(enFallback.confidence_estimate).toBeLessThan(0.65);

    const taFallback = classifyWithRuleFallback({
      title: 'தெருவிளக்கு பழுது',
      description: 'இரண்டு நாட்களாக தெருவிளக்கு எரியவில்லை.',
      userCategory: 'STREETLIGHTS',
      language: 'ta',
    });
    expect(taFallback.department).toBe('ELECTRICAL_LIGHTING');
    expect(taFallback.public_impact).toContain('அபாயம்');
  });
});

describe('Duplicate Detection Edge Cases', () => {
  it('computes accurate Haversine distance, excludes self/expired/unrelated complaints, and ranks duplicates', () => {
    const dist = haversineDistanceMeters(13.0827, 80.2707, 13.0832, 80.271);
    expect(dist).toBeLessThan(100);

    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

    const matches = findPotentialDuplicates(
      {
        id: 'c-self',
        title: 'Broken streetlight on Gandhi Road',
        description: 'Three streetlights outside the library have been dark for four nights.',
        location: 'Gandhi Road, Adyar',
        area: 'Gandhi Road',
        category: 'STREETLIGHTS',
        latitude: 13.0827,
        longitude: 80.2707,
        createdAt: new Date(now).toISOString(),
      },
      [
        {
          id: 'c-self',
          referenceId: 'CR-2026-SELF01',
          title: 'Broken streetlight on Gandhi Road',
          description: 'Three streetlights outside the library have been dark for four nights.',
          location: 'Gandhi Road, Adyar',
          area: 'Gandhi Road',
          category: 'STREETLIGHTS',
          status: 'REPORTED',
          createdAt: new Date(now).toISOString(),
        },
        {
          id: 'c-old',
          referenceId: 'CR-2026-OLD001',
          title: 'Broken streetlight on Gandhi Road',
          description: 'Three streetlights outside the library have been dark for four nights.',
          location: 'Gandhi Road, Adyar',
          area: 'Gandhi Road',
          category: 'STREETLIGHTS',
          status: 'RESOLVED',
          createdAt: tenDaysAgo,
        },
        {
          id: 'c-dup',
          referenceId: 'CR-2026-DUP001',
          title: 'Dark streetlights near Gandhi Road library',
          description: 'Streetlights outside the library on Gandhi Road are broken.',
          location: 'Gandhi Road, Adyar',
          area: 'Gandhi Road',
          category: 'STREETLIGHTS',
          status: 'REPORTED',
          latitude: 13.0829,
          longitude: 80.2708,
          createdAt: new Date(now).toISOString(),
        },
        {
          id: 'c-other',
          referenceId: 'CR-2026-OTH002',
          title: 'Water pipeline leak in Tambaram',
          description: 'Clean drinking water leaking near Tambaram railway gate.',
          location: 'Tambaram',
          area: 'Tambaram',
          category: 'WATER_SUPPLY',
          status: 'IN_PROGRESS',
          latitude: 12.9249,
          longitude: 80.1,
          createdAt: new Date(now).toISOString(),
        },
      ]
    );

    expect(matches.length).toBe(2);
    expect(matches[0].complaintId).toBe('c-dup');
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
    expect(matches[0].distanceMeters).toBeLessThan(100);
    expect(matches.some((m) => m.complaintId === 'c-self')).toBe(false);
    expect(matches.some((m) => m.complaintId === 'c-other')).toBe(false);
  });
});

describe('Image Security & Server-Only Admin Allowlist Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('validates real JPEG, PNG, and WEBP images and rejects oversized, stub, or spoofed payloads', async () => {
    const pngBuf = await sharp({
      create: { width: 16, height: 12, channels: 3, background: { r: 20, g: 100, b: 200 } },
    })
      .png()
      .toBuffer();
    const pngRes = await validateAndSanitizeImageDataUrl(`data:image/png;base64,${pngBuf.toString('base64')}`);
    expect(pngRes.mimeType).toBe('image/png');
    expect(pngRes.width).toBe(16);
    expect(pngRes.height).toBe(12);

    const jpgBuf = await sharp({
      create: { width: 16, height: 12, channels: 3, background: { r: 200, g: 80, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const jpgRes = await validateAndSanitizeImageDataUrl(`data:image/jpeg;base64,${jpgBuf.toString('base64')}`);
    expect(jpgRes.mimeType).toBe('image/jpeg');

    const webpBuf = await sharp({
      create: { width: 16, height: 12, channels: 3, background: { r: 50, g: 180, b: 90 } },
    })
      .webp()
      .toBuffer();
    const webpRes = await validateAndSanitizeImageDataUrl(`data:image/webp;base64,${webpBuf.toString('base64')}`);
    expect(webpRes.mimeType).toBe('image/webp');

    // Truncated header stubs without real image frames must be rejected by Sharp decoder
    const truncatedJpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/jpeg;base64,${truncatedJpgHeader.toString('base64')}`)
    ).rejects.toThrow();

    const htmlPayload = Buffer.from('<script>alert(1)</script>').toString('base64');
    await expect(validateAndSanitizeImageDataUrl(`data:image/png;base64,${htmlPayload}`)).rejects.toThrow();
    await expect(validateAndSanitizeImageDataUrl('not-a-data-url')).rejects.toThrow();
    await expect(validateAndSanitizeImageDataUrl('x'.repeat(360005))).rejects.toThrow();

    const oversizedJpg = Buffer.concat([jpgBuf, Buffer.alloc(265 * 1024)]);
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/jpeg;base64,${oversizedJpg.toString('base64')}`)
    ).rejects.toThrow();
  });

  it('fails closed with an empty admin allowlist when ADMIN_EMAILS and ADMIN_EMAIL are unset', () => {
    const empty = parseAdminAllowlist(undefined, undefined);
    expect(empty.size).toBe(0);
    expect(isAdminEmail('arivumathi224@gmail.com', true, empty)).toBe(false);

    const allowlist = parseAdminAllowlist('admin@city.gov, officer@city.gov');
    expect(isAdminEmail('ADMIN@city.gov', true, allowlist)).toBe(true);
    expect(isAdminEmail('admin@city.gov', false, allowlist)).toBe(false);
    expect(isAdminEmail('citizen@example.com', true, allowlist)).toBe(false);
  });

  it('loads environment configuration and parses bearer tokens safely', () => {
    process.env.PORT = '4000';
    process.env.GEMINI_MODEL = 'gemini-4-hydrogen';
    process.env.ADMIN_EMAILS = 'lead@city.gov';
    const cfg = getConfig();
    expect(cfg.port).toBe(4000);
    expect(cfg.adminEmails.has('lead@city.gov')).toBe(true);

    const user = buildAuthenticatedUser(
      { uid: 'u1', email: 'lead@city.gov', email_verified: true },
      cfg.adminEmails
    );
    expect(user.role).toBe('ADMIN');
    expect(user.isAdmin).toBe(true);

    expect(extractBearerToken({ headers: { authorization: 'Bearer valid_token_string_123' } } as Request)).toBe(
      'valid_token_string_123'
    );
    expect(extractBearerToken({ headers: { authorization: 'Basic abc' } } as Request)).toBeNull();
  });
});
