import type {
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
  SupportedLanguage,
} from './types';

export interface TranslationDictionary {
  brandName: string;
  tagline: string;
  navHome: string;
  navTransparency: string;
  navCitizenPortal: string;
  navAdminPortal: string;
  navSignIn: string;
  navSignOut: string;
  skipToContent: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  problemHeading: string;
  problemCopy: string;
  howItWorksHeading: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  aiCapabilitiesHeading: string;
  aiCap1: string;
  aiCap2: string;
  aiCap3: string;
  aiCap4: string;
  publicImpactHeading: string;
  statTotalReported: string;
  statResolved: string;
  statInProgress: string;
  statResolutionRate: string;
  statPending: string;
  statCritical: string;
  statAvgResolution: string;
  citizenWelcome: string;
  quickReport: string;
  myComplaints: string;
  searchPlaceholder: string;
  filterCategory: string;
  filterPriority: string;
  filterStatus: string;
  allCategories: string;
  allPriorities: string;
  allStatuses: string;
  submitFormTitle: string;
  fieldTitle: string;
  fieldDescription: string;
  fieldLocation: string;
  fieldCategory: string;
  fieldPhoto: string;
  fieldGps: string;
  detectGps: string;
  submitComplaint: string;
  submitting: string;
  aiConfidenceDisclaimer: string;
  aiSourceGemini: string;
  aiSourceFallback: string;
  safetyEscalatedNotice: string;
  humanReviewRequired: string;
  assignedDepartment: string;
  publicImpactLabel: string;
  recommendedActionLabel: string;
  statusTimeline: string;
  adminUpdates: string;
  internalNotes: string;
  potentialDuplicates: string;
  noAutoMergeNote: string;
  adminConsoleTitle: string;
  saveUpdate: string;
  addInternalNote: string;
  auditTrail: string;
  transparencyTitle: string;
  transparencySubtitle: string;
  privacyGuarantee: string;
  emptyComplaints: string;
  signInTitle: string;
  signInSubtitle: string;
  signInWithGoogle: string;
  ctaHeading: string;
  ctaCopy: string;
  backToCitizenPortal: string;
  backToAdminConsole: string;
  selectPhotograph: string;
  previewAiTriage: string;
  analyzingPreview: string;
  aiPreviewHeading: string;
  loginSecurityNote: string;
  complaintSubmittedHeading: string;
  complaintSubmittedCopy: string;
  trackProgress: string;
  returnToPortal: string;
  previousPage: string;
  nextPage: string;
  categories: Record<ComplaintCategory, string>;
  statuses: Record<ComplaintStatus, string>;
  priorities: Record<ComplaintPriority, string>;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    brandName: 'CivicResolve',
    tagline: 'Report. Track. Resolve.',
    navHome: 'Overview',
    navTransparency: 'Transparency',
    navCitizenPortal: 'Citizen Portal',
    navAdminPortal: 'Admin Console',
    navSignIn: 'Sign In',
    navSignOut: 'Sign Out',
    skipToContent: 'Skip to main content',
    heroTitle: 'AI-Assisted Civic Grievance Resolution Built for Public Accountability',
    heroSubtitle:
      'Report local infrastructure hazards in English or Tamil without guessing the right municipal department. CivicResolve pairs Google Gemini analysis with deterministic safety checks to route urgent issues faster and track every resolution publicly.',
    heroPrimaryCta: 'Report an Issue',
    heroSecondaryCta: 'View Public Dashboard',
    problemHeading: 'Why Traditional Grievance Systems Stall',
    problemCopy:
      'Citizens frequently abandon civic reports because municipal forms demand department jargon, critical safety hazards get buried in chronological queues, and residents lack transparent visibility into whether action is underway.',
    howItWorksHeading: 'Three-Step Resolution Workflow',
    step1Title: '01. Submit Plain-Language Evidence',
    step1Desc:
      'Describe the issue in English or Tamil, attach an optional compressed photograph, and include street location or GPS coordinates.',
    step2Title: '02. Gemini Triage & Safety Checks',
    step2Desc:
      'Server-side Gemini Flash analysis classifies category, severity, and public impact, guarded by deterministic safety rules for exposed wires or open manholes.',
    step3Title: '03. Department Action & Live Tracking',
    step3Desc:
      'Municipal administrators inspect potential duplicates, assign departments, post updates, and record every status change in an immutable audit log.',
    aiCapabilitiesHeading: 'Responsible Municipal Intelligence',
    aiCap1: 'Bilingual English and Tamil classification without altering the citizen’s original report.',
    aiCap2: 'Deterministic safety escalation overrides AI priority when life-safety hazards are detected.',
    aiCap3: 'Transparent duplicate scoring across GPS, location, category, and text without blind auto-merging.',
    aiCap4: 'Clear rule-based fallback labeling whenever live AI services are unavailable.',
    publicImpactHeading: 'Live Civic Accountability Metrics',
    statTotalReported: 'Total Reported',
    statResolved: 'Resolved Issues',
    statInProgress: 'In Progress',
    statResolutionRate: 'Resolution Rate',
    statPending: 'Pending Review',
    statCritical: 'Critical Priority',
    statAvgResolution: 'Avg Resolution',
    citizenWelcome: 'Citizen Grievance Workspace',
    quickReport: 'New Complaint',
    myComplaints: 'Your Submitted Grievances',
    searchPlaceholder: 'Search by reference ID, title, or location...',
    filterCategory: 'Category',
    filterPriority: 'Priority',
    filterStatus: 'Status',
    allCategories: 'All Categories',
    allPriorities: 'All Priorities',
    allStatuses: 'All Statuses',
    submitFormTitle: 'Report a Civic Infrastructure Issue',
    fieldTitle: 'Complaint Title',
    fieldDescription: 'Detailed Description',
    fieldLocation: 'Street Address or Landmark',
    fieldCategory: 'Issue Category',
    fieldPhoto: 'Optional Photograph Evidence (JPG, PNG, WEBP)',
    fieldGps: 'Optional GPS Coordinates',
    detectGps: 'Use Current Location',
    submitComplaint: 'Submit Complaint & Analyze',
    submitting: 'Validating & Analyzing...',
    aiConfidenceDisclaimer:
      'Model confidence estimate (heuristic indicator, not a statistically calibrated probability).',
    aiSourceGemini: 'Verified Gemini Flash Analysis',
    aiSourceFallback: 'Rule-Based Fallback (AI Unavailable — Flagged for Human Review)',
    safetyEscalatedNotice: 'Priority escalated by deterministic backend safety policy.',
    humanReviewRequired: 'Flagged for Administrator Human Review',
    assignedDepartment: 'Assigned Department',
    publicImpactLabel: 'Public Impact Assessment',
    recommendedActionLabel: 'Recommended First Response',
    statusTimeline: 'Resolution Progress Timeline',
    adminUpdates: 'Official Municipal Updates',
    internalNotes: 'Internal Administrator Notes',
    potentialDuplicates: 'Potential Duplicate Reports',
    noAutoMergeNote: 'Transparent similarity signals only; human review required before linking.',
    adminConsoleTitle: 'Municipal Administrator Console',
    saveUpdate: 'Save Status & Dispatch Update',
    addInternalNote: 'Save Internal Note',
    auditTrail: 'Governance Audit Trail',
    transparencyTitle: 'Public Civic Transparency Dashboard',
    transparencySubtitle:
      'Aggregated municipal grievance metrics and resolution trends. Individual citizen emails, descriptions, and personal details are never exposed publicly.',
    privacyGuarantee: 'Privacy Verified: Zero citizen PII is displayed or queried on this page.',
    emptyComplaints: 'No complaints match your current filters yet.',
    signInTitle: 'Sign In to CivicResolve',
    signInSubtitle:
      'Authenticate securely with Firebase to submit private grievances, track official updates, or access authorized municipal administration tools.',
    signInWithGoogle: 'Continue with Google (Firebase Auth)',
    ctaHeading: 'Ready to report or review municipal issues?',
    ctaCopy:
      'Sign in with Firebase Authentication to submit private complaints or inspect live public metrics.',
    backToCitizenPortal: 'Back to Citizen Portal',
    backToAdminConsole: 'Back to Admin Console',
    selectPhotograph: 'Select Photograph',
    previewAiTriage: 'Preview AI Triage',
    analyzingPreview: 'Analyzing Preview...',
    aiPreviewHeading: 'Pre-Submission AI Triage Preview',
    loginSecurityNote:
      'Administrator access is verified server-side against the authorized municipal email allowlist. Standard accounts receive private Citizen Portal access.',
    complaintSubmittedHeading: 'Complaint Submitted & Triaged',
    complaintSubmittedCopy:
      'Your grievance has been saved to Cloud Firestore and analyzed for routing.',
    trackProgress: 'Track Complaint Progress',
    returnToPortal: 'Return to Citizen Portal',
    previousPage: 'Previous',
    nextPage: 'Next',
    categories: {
      ROAD_INFRASTRUCTURE: 'Road Infrastructure',
      GARBAGE_WASTE: 'Garbage & Waste Management',
      STREETLIGHTS: 'Streetlights',
      WATER_SUPPLY: 'Water Supply',
      DRAINAGE_SEWAGE: 'Drainage & Sewage',
      PUBLIC_SAFETY: 'Public Safety',
      SANITATION: 'Sanitation',
      OTHER: 'Other',
    },
    statuses: {
      REPORTED: 'Reported',
      IN_PROGRESS: 'In Progress',
      RESOLVED: 'Resolved',
    },
    priorities: {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
      CRITICAL: 'Critical',
    },
  },
  ta: {
    brandName: 'CivicResolve',
    tagline: 'புகார் அளி. கண்காணி. தீர்வு காண்.',
    navHome: 'முகப்பு',
    navTransparency: 'வெளிப்படைத்தன்மை',
    navCitizenPortal: 'குடிமக்கள் தளம்',
    navAdminPortal: 'நிர்வாக தளம்',
    navSignIn: 'உள்நுழை',
    navSignOut: 'வெளியேறு',
    skipToContent: 'முதன்மை உள்ளடக்கத்திற்குச் செல்லவும்',
    heroTitle: 'பொதுப் பொறுப்புணர்வுடன் கூடிய AI குடிமக்கள் குறைதீர் தளம்',
    heroSubtitle:
      'அரசுத் துறையை அறியாமலேயே தமிழ் அல்லது ஆங்கிலத்தில் உள்ளூர் பிரச்சனைகளைப் புகாரளியுங்கள். Google Gemini பகுப்பாய்வு மற்றும் பாதுகாப்பு விதிகள் மூலம் அவசரப் புகார்கள் விரைந்து தீர்க்கப்படுகின்றன.',
    heroPrimaryCta: 'புகார் அளிக்கவும்',
    heroSecondaryCta: 'பொது புள்ளிவிவரம் பார்க்க',
    problemHeading: 'பாரம்பரிய குறைதீர் முறைகள் ஏன் தாமதமாகின்றன?',
    problemCopy:
      'சரியான துறையைத் தேர்ந்தெடுப்பதில் உள்ள சிரமம், அவசர ஆபத்துகளுக்கு முன்னுரிமை கிடைக்காதது மற்றும் வெளிப்படைத்தன்மை இல்லாமை ஆகியவை குடிமக்களின் நம்பிக்கையைக் குறைக்கின்றன.',
    howItWorksHeading: 'மூன்று-படி தீர்வு செயல்முறை',
    step1Title: '01. எளிய மொழியில் புகார் பதிவு',
    step1Desc:
      'தமிழ் அல்லது ஆங்கிலத்தில் பிரச்சனையை விவரித்து, விருப்பப்பட்டால் புகைப்படம் மற்றும் இருப்பிட விவரத்தை இணைக்கவும்.',
    step2Title: '02. Gemini AI பகுப்பாய்வு & பாதுகாப்பு விதி',
    step2Desc:
      'மின்கம்பி அல்லது திறந்த ஆள்துளை போன்ற ஆபத்துகளைக் கண்டறிந்து முன்னுரிமை மற்றும் துறையைப் பரிந்துரைக்கிறது.',
    step3Title: '03. துறை நடவடிக்கை & நேரடி கண்காணிப்பு',
    step3Desc:
      'நிர்வாகிகள் நகல் புகார்களை ஆய்வு செய்து, துறைகளுக்குப் பகிர்ந்து, ஒவ்வொரு மாற்றத்தையும் தணிக்கைப் பதிவில் சேமிக்கின்றனர்.',
    aiCapabilitiesHeading: 'பொறுப்பான நகராட்சி நுண்ணறிவு',
    aiCap1: 'குடிமகனின் அசல் புகாரை மாற்றாமல் தமிழ் மற்றும் ஆங்கிலத்தில் துல்லியமான வகைப்படுத்தல்.',
    aiCap2: 'உயிர் பாதுகாப்பு ஆபத்துகள் கண்டறியப்பட்டால் AI மதிப்பை விட பாதுகாப்பு விதி முன்னுரிமை பெறும்.',
    aiCap3: 'GPS மற்றும் விளக்க ஒற்றுமை அடிப்படையில் வெளிப்படையான நகல் புகார் கண்டறிதல்.',
    aiCap4: 'AI சேவை கிடைக்காதபோது தெளிவான விதி-அடிப்படையிலான மாற்று வகைப்படுத்தல்.',
    publicImpactHeading: 'நேரடி பொதுப் பொறுப்புணர்வு அளவுகோல்கள்',
    statTotalReported: 'மொத்த புகார்கள்',
    statResolved: 'தீர்க்கப்பட்டவை',
    statInProgress: 'நடவடிக்கையில்',
    statResolutionRate: 'தீர்வு விகிதம்',
    statPending: 'நிலுவையில்',
    statCritical: 'மிக அவசரம்',
    statAvgResolution: 'சராசரி தீர்வு நேரம்',
    citizenWelcome: 'குடிமக்கள் குறைதீர் பணிமனை',
    quickReport: 'புதிய புகார்',
    myComplaints: 'நீங்கள் அளித்த புகார்கள்',
    searchPlaceholder: 'குறிப்பு எண், தலைப்பு அல்லது இடத்தைத் தேடுக...',
    filterCategory: 'வகை',
    filterPriority: 'முன்னுரிமை',
    filterStatus: 'நிலை',
    allCategories: 'அனைத்து வகைகள்',
    allPriorities: 'அனைத்து முன்னுரிமைகள்',
    allStatuses: 'அனைத்து நிலைகள்',
    submitFormTitle: 'பொது உள்கட்டமைப்புப் புகார் பதிவு',
    fieldTitle: 'புகார் தலைப்பு',
    fieldDescription: 'விரிவான விளக்கம்',
    fieldLocation: 'தெரு முகவரி அல்லது அடையாளம்',
    fieldCategory: 'பிரச்சனை வகை',
    fieldPhoto: 'புகைப்பட ஆதாரம் (விருப்பத்திற்குரியது: JPG, PNG, WEBP)',
    fieldGps: 'GPS இருப்பிட ஆயத்தொலைவுகள் (விருப்பத்திற்குரியது)',
    detectGps: 'தற்போதைய இடத்தைப் பெறு',
    submitComplaint: 'புகாரைச் சமர்ப்பித்து பகுப்பாய்வு செய்',
    submitting: 'சரிபார்த்து பகுப்பாய்வு செய்கிறது...',
    aiConfidenceDisclaimer:
      'மாதிரி நம்பகத்தன்மை மதிப்பீடு (இது புள்ளிவிவர நிகழ்தகவு அல்ல, ஒரு வழிகாட்டி மதிப்பீடு மட்டுமே).',
    aiSourceGemini: 'சரிபார்க்கப்பட்ட Gemini Flash பகுப்பாய்வு',
    aiSourceFallback: 'விதி-அடிப்படையிலான மாற்று (AI கிடைக்கவில்லை — மனித ஆய்வு தேவை)',
    safetyEscalatedNotice: 'பின்தள பாதுகாப்பு விதிகளால் முன்னுரிமை உயர்த்தப்பட்டது.',
    humanReviewRequired: 'நிர்வாகி மனித ஆய்வு தேவை எனக் குறிக்கப்பட்டது',
    assignedDepartment: 'ஒதுக்கப்பட்ட துறை',
    publicImpactLabel: 'பொதுத் தாக்க மதிப்பீடு',
    recommendedActionLabel: 'பரிந்துரைக்கப்பட்ட முதற்கட்ட நடவடிக்கை',
    statusTimeline: 'தீர்வு முன்னேற்ற காலவரிசை',
    adminUpdates: 'அதிகாரப்பூர்வ நகராட்சி அறிவிப்புகள்',
    internalNotes: 'உள் நிர்வாகக் குறிப்புகள்',
    potentialDuplicates: 'சாத்தியமான நகல் புகார்கள்',
    noAutoMergeNote: 'வெளிப்படையான ஒற்றுமை அடையாளம் மட்டுமே; தானாக இணைக்கப்படாது.',
    adminConsoleTitle: 'நகராட்சி நிர்வாகி கட்டுப்பாட்டு அறை',
    saveUpdate: 'நிலை மாற்றத்தைச் சேமி',
    addInternalNote: 'உள் குறிப்பைச் சேமி',
    auditTrail: 'நிர்வாகத் தணிக்கைப் பதிவு',
    transparencyTitle: 'பொது வெளிப்படைத்தன்மைப் பலகை',
    transparencySubtitle:
      'தொகுக்கப்பட்ட நகராட்சிப் புகார் புள்ளிவிவரங்கள். தனிப்பட்ட குடிமக்கள் மின்னஞ்சல் அல்லது தனிநபர் விவரங்கள் ஒருபோதும் பொதுவில் காட்டப்படாது.',
    privacyGuarantee: 'தனியுரிமை பாதுகாப்பு: தனிப்பட்ட குடிமக்கள் தரவு எதுவும் இங்கு வெளியிடப்படவில்லை.',
    emptyComplaints: 'உங்கள் தேடலுக்குப் பொருந்தும் புகார்கள் இல்லை.',
    signInTitle: 'CivicResolve-இல் உள்நுழையவும்',
    signInSubtitle:
      'புகார்களைப் பதிவு செய்ய, நிலையைக் கண்காணிக்க அல்லது நிர்வாகக் கருவிகளை அணுக Firebase மூலம் பாதுகாப்பாக உள்நுழையவும்.',
    signInWithGoogle: 'Google கணக்குடன் தொடரவும் (Firebase Auth)',
    ctaHeading: 'புகார்களைப் பதிவு செய்ய அல்லது ஆய்வு செய்யத் தயாரா?',
    ctaCopy:
      'தனிப்பட்ட புகார்களைச் சமர்ப்பிக்க அல்லது பொது புள்ளிவிவரங்களைப் பார்க்க Firebase மூலம் உள்நுழையவும்.',
    backToCitizenPortal: 'குடிமக்கள் தளத்திற்குத் திரும்பு',
    backToAdminConsole: 'நிர்வாக தளத்திற்குத் திரும்பு',
    selectPhotograph: 'புகைப்படத்தைத் தேர்ந்தெடு',
    previewAiTriage: 'AI முன்னுரிமை முன்னோட்டம்',
    analyzingPreview: 'முன்னோட்டம் பகுப்பாய்வு செய்கிறது...',
    aiPreviewHeading: 'சமர்ப்பிப்பதற்கு முன் AI முன்னுரிமை முன்னோட்டம்',
    loginSecurityNote:
      'நிர்வாக அணுகல் சேவையகத்தில் உள்ள அங்கீகரிக்கப்பட்ட நகராட்சி மின்னஞ்சல் பட்டியல் மூலம் சரிபார்க்கப்படுகிறது. சாதாரண கணக்குகளுக்கு தனிப்பட்ட குடிமக்கள் தளம் வழங்கப்படும்.',
    complaintSubmittedHeading: 'புகார் சமர்ப்பிக்கப்பட்டு வகைப்படுத்தப்பட்டது',
    complaintSubmittedCopy:
      'உங்கள் புகார் Cloud Firestore-இல் பாதுகாப்பாக சேமிக்கப்பட்டு துறைக்குப் பரிந்துரைக்கப்பட்டது.',
    trackProgress: 'புகார் நிலையைக் கண்காணிக்கவும்',
    returnToPortal: 'குடிமக்கள் தளத்திற்குத் திரும்பு',
    previousPage: 'முந்தையது',
    nextPage: 'அடுத்தது',
    categories: {
      ROAD_INFRASTRUCTURE: 'சாலை உள்கட்டமைப்பு',
      GARBAGE_WASTE: 'குப்பை மற்றும் கழிவு மேலாண்மை',
      STREETLIGHTS: 'தெருவிளக்குகள்',
      WATER_SUPPLY: 'குடிநீர் விநியோகம்',
      DRAINAGE_SEWAGE: 'வடிகால் மற்றும் கழிவுநீர்',
      PUBLIC_SAFETY: 'பொதுப் பாதுகாப்பு',
      SANITATION: 'சுகாதாரம்',
      OTHER: 'மற்றவை',
    },
    statuses: {
      REPORTED: 'பதிவு செய்யப்பட்டது',
      IN_PROGRESS: 'நடவடிக்கையில்',
      RESOLVED: 'தீர்க்கப்பட்டது',
    },
    priorities: {
      LOW: 'குறைவு',
      MEDIUM: 'நடுத்தரம்',
      HIGH: 'அதிகம்',
      CRITICAL: 'மிக அவசரம்',
    },
  },
};
