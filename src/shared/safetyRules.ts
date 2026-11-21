import type {
  AiAnalysisOutput,
  ComplaintCategory,
  ComplaintPriority,
  DepartmentConfig,
  EnrichedAiAnalysis,
  SupportedLanguage,
} from './types';

export const DEPARTMENT_CODES = [
  'ROADS_PUBLIC_WORKS',
  'SANITATION_WASTE',
  'ELECTRICAL_LIGHTING',
  'WATER_RESOURCES',
  'STORMWATER_DRAINAGE',
  'PUBLIC_SAFETY_ENFORCEMENT',
  'GENERAL_MUNICIPAL_DESK',
] as const;

export type DepartmentCode = (typeof DEPARTMENT_CODES)[number];

export const DEPARTMENT_DIRECTORY: Record<string, DepartmentConfig> = {
  ROADS_PUBLIC_WORKS: {
    code: 'ROADS_PUBLIC_WORKS',
    labelEn: 'Roads & Public Works Department',
    labelTa: 'சாலைகள் மற்றும் பொதுப்பணித் துறை',
    categories: ['ROAD_INFRASTRUCTURE'],
    slaHours: 48,
  },
  SANITATION_WASTE: {
    code: 'SANITATION_WASTE',
    labelEn: 'Solid Waste & Sanitation Department',
    labelTa: 'திடக்கழிவு மற்றும் சுகாதாரத் துறை',
    categories: ['GARBAGE_WASTE', 'SANITATION'],
    slaHours: 24,
  },
  ELECTRICAL_LIGHTING: {
    code: 'ELECTRICAL_LIGHTING',
    labelEn: 'Municipal Electrical & Street Lighting',
    labelTa: 'நகராட்சி மின்சாரம் மற்றும் தெருவிளக்குத் துறை',
    categories: ['STREETLIGHTS'],
    slaHours: 24,
  },
  WATER_RESOURCES: {
    code: 'WATER_RESOURCES',
    labelEn: 'Water Supply & Pipeline Authority',
    labelTa: 'குடிநீர் விநியோகம் மற்றும் குழாய் வாரியம்',
    categories: ['WATER_SUPPLY'],
    slaHours: 18,
  },
  STORMWATER_DRAINAGE: {
    code: 'STORMWATER_DRAINAGE',
    labelEn: 'Stormwater & Sewage Engineering',
    labelTa: 'மழைநீர் வடிகால் மற்றும் கழிவுநீர் பொறியியல்',
    categories: ['DRAINAGE_SEWAGE'],
    slaHours: 24,
  },
  PUBLIC_SAFETY_ENFORCEMENT: {
    code: 'PUBLIC_SAFETY_ENFORCEMENT',
    labelEn: 'Civic Safety & Emergency Response',
    labelTa: 'பொதுப் பாதுகாப்பு மற்றும் அவசர மீட்புப் பிரிவு',
    categories: ['PUBLIC_SAFETY'],
    slaHours: 6,
  },
  GENERAL_MUNICIPAL_DESK: {
    code: 'GENERAL_MUNICIPAL_DESK',
    labelEn: 'Central Municipal Grievance Desk',
    labelTa: 'மத்திய நகராட்சி குறைதீர் மையம்',
    categories: ['OTHER'],
    slaHours: 72,
  },
};

export function mapCategoryToDepartment(category: ComplaintCategory): string {
  for (const dept of Object.values(DEPARTMENT_DIRECTORY)) {
    if (dept.categories.includes(category)) {
      return dept.code;
    }
  }
  return 'GENERAL_MUNICIPAL_DESK';
}

export function normalizeDepartmentCode(rawDept: string, fallbackCategory: ComplaintCategory): string {
  const upper = rawDept.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (DEPARTMENT_DIRECTORY[upper]) {
    return upper;
  }
  if (upper.includes('ROAD') || upper.includes('HIGHWAY') || upper.includes('PAVE')) {
    return 'ROADS_PUBLIC_WORKS';
  }
  if (upper.includes('LIGHT') || upper.includes('ELECTR') || upper.includes('POWER')) {
    return 'ELECTRICAL_LIGHTING';
  }
  if (upper.includes('DRAIN') || upper.includes('SEW') || upper.includes('STORMWATER')) {
    return 'STORMWATER_DRAINAGE';
  }
  if (upper.includes('WATER') || upper.includes('PIPE')) {
    return 'WATER_RESOURCES';
  }
  if (upper.includes('WASTE') || upper.includes('GARBAGE') || upper.includes('SANIT')) {
    return 'SANITATION_WASTE';
  }
  if (upper.includes('SAFE') || upper.includes('EMERG') || upper.includes('HAZARD')) {
    return 'PUBLIC_SAFETY_ENFORCEMENT';
  }
  return mapCategoryToDepartment(fallbackCategory);
}

interface SafetyRule {
  id: string;
  minPriority: ComplaintPriority;
  minSeverity: number;
  patterns: RegExp[];
  reason: string;
  overrideDepartment?: string;
}

const DETERMINISTIC_SAFETY_RULES: SafetyRule[] = [
  {
    id: 'EXPOSED_ELECTRICAL_HAZARD',
    minPriority: 'CRITICAL',
    minSeverity: 5,
    patterns: [
      /\b(live\s*wire|exposed\s*wire|hanging\s*cable|electrocution|electric\s*shock|sparking\s*pole|transformer\s*fire|short\s*circuit)\b/i,
      /(மின்கம்பி|மின்சார\s*தாக்குதல்|திறந்த\s*மின்|தீப்பொறி)/i,
    ],
    reason: 'Potential electrical/electrocution life-safety hazard detected by deterministic safety rules.',
    overrideDepartment: 'ELECTRICAL_LIGHTING',
  },
  {
    id: 'OPEN_MANHOLE_HAZARD',
    minPriority: 'CRITICAL',
    minSeverity: 5,
    patterns: [
      /\b(open\s*manhole|uncovered\s*manhole|missing\s*manhole\s*cover|collapsed\s*drain\s*pit|sinkhole)\b/i,
      /(திறந்த\s*சாக்கடை\s*குழி|மூடியில்லாத\s*ஆள்துளை|பள்ளம்)/i,
    ],
    reason: 'Open manhole or severe collapse hazard detected; escalated to CRITICAL for pedestrian/traffic safety.',
    overrideDepartment: 'STORMWATER_DRAINAGE',
  },
  {
    id: 'MAJOR_FLOODING_OR_GAS_HAZARD',
    minPriority: 'CRITICAL',
    minSeverity: 5,
    patterns: [
      /\b(major\s*flood|severe\s*flooding|submerged\s*road|gas\s*leak|sewage\s*overflow\s*into\s*homes|bridge\s*collapse|structural\s*collapse)\b/i,
      /(வெள்ளப்பெருக்கு|வாயு\s*கசிவு|பாலம்\s*இடிந்து)/i,
    ],
    reason: 'Severe flooding, structural collapse, or hazardous leak detected; escalated to CRITICAL.',
  },
  {
    id: 'HIGH_TRAFFIC_OR_CONTAMINATION',
    minPriority: 'HIGH',
    minSeverity: 4,
    patterns: [
      /\b(contaminated\s*water|sewage\s*mixing|school\s*zone|hospital\s*road|fallen\s*tree\s*blocking|broken\s*traffic\s*signal|deep\s*pothole)\b/i,
      /(மாசுபட்ட\s*குடிநீர்|பள்ளி\s*அருகே|மருத்துவமனை|ஆழமான\s*குழி)/i,
    ],
    reason: 'High public-health or vulnerable-zone risk detected by safety policy.',
  },
];

const PRIORITY_RANK: Record<ComplaintPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function maxPriority(a: ComplaintPriority, b: ComplaintPriority): ComplaintPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

export function applyDeterministicSafetyRules(params: {
  title: string;
  description: string;
  aiOutput: AiAnalysisOutput;
  source: 'GEMINI' | 'FALLBACK';
  model: string;
  analyzedAt?: string;
}): EnrichedAiAnalysis {
  const combinedText = `${params.title}\n${params.description}`;
  let finalPriority: ComplaintPriority = params.aiOutput.priority;
  let finalSeverity = params.aiOutput.severity;
  let department = normalizeDepartmentCode(params.aiOutput.department, params.aiOutput.category);
  const safetyReasons: string[] = [];
  let safetyEscalated = false;

  for (const rule of DETERMINISTIC_SAFETY_RULES) {
    if (rule.patterns.some((rx) => rx.test(combinedText))) {
      safetyReasons.push(rule.reason);
      const nextPriority = maxPriority(finalPriority, rule.minPriority);
      if (PRIORITY_RANK[nextPriority] > PRIORITY_RANK[finalPriority]) {
        safetyEscalated = true;
        finalPriority = nextPriority;
      }
      if (rule.minSeverity > finalSeverity) {
        safetyEscalated = true;
        finalSeverity = rule.minSeverity;
      }
      if (rule.overrideDepartment && rule.minPriority === 'CRITICAL') {
        department = rule.overrideDepartment;
      }
    }
  }

  // Never downgrade safety escalations even when Gemini reports low confidence
  const requiresHumanReview =
    params.source === 'FALLBACK' ||
    params.aiOutput.requires_human_review ||
    params.aiOutput.confidence_estimate < 0.65 ||
    safetyEscalated;

  return {
    source: params.source,
    model: params.model,
    category: params.aiOutput.category,
    subcategory: params.aiOutput.subcategory,
    aiPriority: params.aiOutput.priority,
    finalPriority,
    safetyEscalated,
    safetyReasons,
    severity: finalSeverity,
    department,
    publicImpact: params.aiOutput.public_impact,
    explanation: params.aiOutput.explanation,
    recommendedAction: params.aiOutput.recommended_action,
    confidenceEstimate: Number(params.aiOutput.confidence_estimate.toFixed(2)),
    requiresHumanReview,
    analyzedAt: params.analyzedAt ?? new Date().toISOString(),
  };
}

export function classifyWithRuleFallback(input: {
  title: string;
  description: string;
  userCategory: ComplaintCategory;
  language: SupportedLanguage;
}): AiAnalysisOutput {
  const text = `${input.title} ${input.description}`.toLowerCase();

  let category: ComplaintCategory = input.userCategory;
  let subcategory = 'GENERAL_ISSUE';
  let priority: ComplaintPriority = 'MEDIUM';
  let severity = 3;

  if (/(pothole|asphalt|road|pavement|speed\s*breaker|சாலை|குழி)/.test(text)) {
    category = 'ROAD_INFRASTRUCTURE';
    subcategory = 'ROAD_SURFACE_DAMAGE';
    priority = 'HIGH';
    severity = 4;
  } else if (/(streetlight|lamp|dark|bulb|wire|மின்|விளக்கு)/.test(text)) {
    category = 'STREETLIGHTS';
    subcategory = 'LIGHTING_OR_ELECTRICAL';
    priority = 'HIGH';
    severity = 4;
  } else if (/(garbage|trash|waste|bin|dump|குப்பை|கழிவு)/.test(text)) {
    category = 'GARBAGE_WASTE';
    subcategory = 'WASTE_ACCUMULATION';
    priority = 'MEDIUM';
    severity = 3;
  } else if (/(water|pipe|leak|supply|tap|குடிநீர்|குழாய்)/.test(text)) {
    category = 'WATER_SUPPLY';
    subcategory = 'WATER_LINE_ISSUE';
    priority = 'HIGH';
    severity = 4;
  } else if (/(drain|sewage|manhole|flood|gutter|சாக்கடை|வடிகால்)/.test(text)) {
    category = 'DRAINAGE_SEWAGE';
    subcategory = 'DRAINAGE_BLOCKAGE';
    priority = 'HIGH';
    severity = 4;
  } else if (/(safety|danger|hazard|accident|பாதுகாப்பு|ஆபத்து)/.test(text)) {
    category = 'PUBLIC_SAFETY';
    subcategory = 'SAFETY_HAZARD';
    priority = 'HIGH';
    severity = 4;
  } else if (/(sanitation|toilet|mosquito|odor|சுகாதாரம்)/.test(text)) {
    category = 'SANITATION';
    subcategory = 'PUBLIC_HYGIENE';
    priority = 'MEDIUM';
    severity = 3;
  }

  const department = mapCategoryToDepartment(category);

  return {
    category,
    subcategory,
    priority,
    severity,
    department,
    public_impact:
      input.language === 'ta'
        ? 'அருகிலுள்ள குடியிருப்பாளர்கள் மற்றும் பயணிகளுக்கு இடையூறு ஏற்படும் அபாயம் உள்ளது.'
        : 'Potential disruption to local residents, commuters, and neighborhood service reliability.',
    explanation:
      'Classified via deterministic rule-based fallback because live Gemini AI analysis was unavailable; flagged for human administrator verification.',
    recommended_action:
      'Assign a municipal field inspector to verify conditions on site and schedule remediation.',
    confidence_estimate: 0.45,
    requires_human_review: true,
  };
}
