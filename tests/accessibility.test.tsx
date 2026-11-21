import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axe from 'axe-core';
import { AppProvider } from '../src/contexts/AppContext';
import { AppLayout } from '../src/components/Layout';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { LandingPage } from '../src/pages/LandingPage';
import { PublicTransparencyPage } from '../src/pages/PublicTransparencyPage';
import { LoginPage } from '../src/pages/LoginPage';
import { CitizenReportPage } from '../src/pages/CitizenReportPage';
import { AdminComplaintReviewPage } from '../src/pages/AdminComplaintReviewPage';
import { PriorityIndicator, StatusIndicator } from '../src/components/StatusBadges';
import { AccessibleBarChart, MonthlyTrendsChart } from '../src/components/charts/CivicCharts';

const mockAuthState = {
  currentUser: null as null | {
    uid: string;
    email: string;
    emailVerified: boolean;
    displayName: string;
    getIdToken: () => Promise<string>;
  },
};

vi.mock('../src/lib/firebase', () => ({
  auth: {
    get currentUser() {
      return mockAuthState.currentUser;
    },
  },
  googleProvider: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    cb(mockAuthState.currentUser);
    return () => {};
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(async () => {
    mockAuthState.currentUser = null;
  }),
}));

const SAMPLE_STATS = {
  totalReported: 12,
  reportedCount: 3,
  inProgressCount: 4,
  resolvedCount: 5,
  criticalCount: 2,
  resolutionRate: 41.7,
  avgResolutionHours: 14.5,
  byCategory: { ROAD_INFRASTRUCTURE: 6, STREETLIGHTS: 6 },
  byPriority: { CRITICAL: 2, HIGH: 4, MEDIUM: 4, LOW: 2 },
  byDepartment: { ROADS_PUBLIC_WORKS: 6, ELECTRICAL_LIGHTING: 6 },
  byArea: { 'Anna Nagar': 7, Adyar: 5 },
  monthlyTrends: [{ month: '2026-11', reported: 12, resolved: 5 }],
  updatedAt: '2026-11-20T00:00:00Z',
};

const SAMPLE_COMPLAINT = {
  id: 'cmp_1',
  referenceId: 'CR-2026-TEST01',
  citizenUid: 'uid-citizen',
  citizenEmail: 'citizen@example.com',
  citizenName: 'Citizen User',
  title: 'Sparking pole near school gate',
  description: 'Exposed live wire near school crossing after evening rain.',
  location: 'Anna Nagar West',
  area: 'Anna Nagar',
  hasImage: false,
  userCategory: 'STREETLIGHTS',
  language: 'en',
  status: 'REPORTED',
  priority: 'CRITICAL',
  severity: 5,
  department: 'ELECTRICAL_LIGHTING',
  assignedDepartment: 'ELECTRICAL_LIGHTING',
  subcategory: 'EXPOSED_WIRE',
  aiSource: 'GEMINI',
  aiModel: 'gemini-4-hydrogen',
  aiExplanation: 'Live electrical hazard.',
  publicImpact: 'High risk to students.',
  recommendedAction: 'Isolate power immediately.',
  confidenceEstimate: 0.94,
  safetyEscalated: true,
  safetyReasons: ['Electrical live-wire keyword rule triggered.'],
  requiresHumanReview: true,
  citizenVisibleUpdate: 'Crew dispatched.',
  potentialDuplicateIds: [],
  duplicateScore: 0,
  isDemo: false,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
};

vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/auth/me')) {
      return {
        ok: true,
        json: async () => ({
          user: {
            uid: mockAuthState.currentUser?.uid || 'uid-citizen',
            email: mockAuthState.currentUser?.email || 'citizen@example.com',
            name: mockAuthState.currentUser?.displayName || 'Citizen User',
            emailVerified: true,
            role: mockAuthState.currentUser?.email === 'admin@city.gov' ? 'ADMIN' : 'CITIZEN',
            isAdmin: mockAuthState.currentUser?.email === 'admin@city.gov',
          },
          departments: [
            { code: 'ELECTRICAL_LIGHTING', labelEn: 'Electrical & Street Lighting', labelTa: 'மின்சாரம்' },
          ],
        }),
      };
    }
    if (url.includes('/api/ai/analyze')) {
      return {
        ok: true,
        json: async () => ({
          analysis: {
            category: 'STREETLIGHTS',
            subcategory: 'EXPOSED_WIRE',
            priority: 'CRITICAL',
            finalPriority: 'CRITICAL',
            severity: 5,
            department: 'ELECTRICAL_LIGHTING',
            public_impact: 'High safety risk.',
            publicImpact: 'High safety risk.',
            explanation: 'Exposed wire hazard.',
            recommended_action: 'Dispatch crew immediately.',
            recommendedAction: 'Dispatch crew immediately.',
            confidence_estimate: 0.9,
            confidenceEstimate: 0.9,
            requires_human_review: true,
            requiresHumanReview: true,
            safetyEscalated: true,
            safetyReasons: ['Electrical hazard detected.'],
            source: 'GEMINI',
            model: 'gemini-4-hydrogen',
          },
        }),
      };
    }
    if (url.includes('/api/admin/complaints/cmp_1')) {
      return {
        ok: true,
        json: async () => ({
          complaint: SAMPLE_COMPLAINT,
          history: [
            {
              id: 'h1',
              complaintId: 'cmp_1',
              previousStatus: 'NONE',
              newStatus: 'REPORTED',
              changedByUid: 'uid-citizen',
              changedByRole: 'CITIZEN',
              note: 'Submitted.',
              citizenVisible: true,
              createdAt: '2026-11-20T10:00:00.000Z',
            },
          ],
          notes: [],
          duplicates: [
            {
              complaintId: 'cmp_2',
              referenceId: 'CR-2026-DUP002',
              title: 'Pole wire sparking near school',
              score: 0.78,
              reasons: ['Same category', 'Similar wording'],
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ statistics: SAMPLE_STATS }),
    };
  })
);

function ThrowingWidget({ jsonError }: { jsonError?: boolean }): React.ReactElement {
  throw new Error(
    jsonError
      ? JSON.stringify({ operationType: 'get', error: 'Permission denied' })
      : 'Unexpected widget crash'
  );
}

describe('WCAG 2.2 AA Accessibility, Components & Bilingual UI Tests', () => {
  it('renders LandingPage inside AppLayout with zero axe-core accessibility violations and working Tamil toggle', async () => {
    mockAuthState.currentUser = null;
    const { container } = render(
      <AppProvider>
        <MemoryRouter>
          <AppLayout>
            <LandingPage />
          </AppLayout>
        </MemoryRouter>
      </AppProvider>
    );

    expect(screen.getByRole('link', { name: /skip to main content/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('41.7%')).toBeInTheDocument();

    const tamilBtn = screen.getByRole('button', { name: 'தமிழ்' });
    fireEvent.click(tamilBtn);
    expect(tamilBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('பொதுப் பொறுப்புணர்வுடன்');

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('renders PublicTransparencyPage and switches charts cleanly to Table View with zero axe violations', async () => {
    mockAuthState.currentUser = null;
    const { container } = render(
      <AppProvider>
        <MemoryRouter>
          <AppLayout>
            <PublicTransparencyPage />
          </AppLayout>
        </MemoryRouter>
      </AppProvider>
    );

    expect(await screen.findByText(/Privacy Verified: Zero citizen PII/i)).toBeInTheDocument();
    const tableToggles = screen.getAllByRole('button', { name: /Table View/i });
    fireEvent.click(tableToggles[0]);
    expect(screen.getByRole('table')).toBeInTheDocument();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('renders LoginPage in English and Tamil with enabled sign-in button and zero axe violations', async () => {
    mockAuthState.currentUser = null;
    const { container } = render(
      <AppProvider>
        <MemoryRouter>
          <AppLayout>
            <LoginPage />
          </AppLayout>
        </MemoryRouter>
      </AppProvider>
    );

    const signInBtn = screen.getByRole('button', { name: /Continue with Google/i });
    expect(signInBtn).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'தமிழ்' }));
    expect(screen.getByText(/நிர்வாக அணுகல் சேவையகத்தில்/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('validates CitizenReportPage form errors, runs AI Triage Preview, and passes axe audit', async () => {
    mockAuthState.currentUser = {
      uid: 'uid-citizen',
      email: 'citizen@example.com',
      emailVerified: true,
      displayName: 'Citizen User',
      getIdToken: async () => 'tok-citizen-123456',
    };

    const { container } = render(
      <AppProvider>
        <MemoryRouter>
          <AppLayout>
            <CitizenReportPage />
          </AppLayout>
        </MemoryRouter>
      </AppProvider>
    );

    expect(await screen.findByText(/Sign Out/i)).toBeInTheDocument();

    // Trigger client validation error
    fireEvent.click(screen.getByRole('button', { name: /Submit Complaint/i }));
    expect(await screen.findByText(/at least 5 characters/i)).toBeInTheDocument();

    // Fill valid complaint & click Preview AI Triage
    fireEvent.change(screen.getByLabelText(/Complaint Title/i), {
      target: { value: 'Live wire sparking near school gate' },
    });
    fireEvent.change(screen.getByLabelText(/Street Address/i), {
      target: { value: 'Anna Nagar West' },
    });
    fireEvent.change(screen.getByLabelText(/Detailed Description/i), {
      target: { value: 'Exposed electrical pole cable sparking after rain near school gate.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Preview AI Triage/i }));
    expect(await screen.findByText(/Pre-Submission AI Triage Preview/i)).toBeInTheDocument();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('renders AdminComplaintReviewPage with duplicate evidence and passes axe audit', async () => {
    mockAuthState.currentUser = {
      uid: 'uid-admin',
      email: 'admin@city.gov',
      emailVerified: true,
      displayName: 'City Admin',
      getIdToken: async () => 'tok-admin-123456',
    };

    const { container } = render(
      <AppProvider>
        <MemoryRouter initialEntries={['/admin/complaints/cmp_1']}>
          <AppLayout>
            <Routes>
              <Route path="/admin/complaints/:id" element={<AdminComplaintReviewPage />} />
            </Routes>
          </AppLayout>
        </MemoryRouter>
      </AppProvider>
    );

    expect(await screen.findByText('Sparking pole near school gate')).toBeInTheDocument();
    expect(screen.getByText(/78% similarity/i)).toBeInTheDocument();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('renders ErrorBoundary, all Status/Priority badges, and empty chart fallback cleanly', () => {
    mockAuthState.currentUser = null;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingWidget jsonError />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Database get could not be completed');
    spy.mockRestore();

    render(
      <AppProvider>
        <StatusIndicator status="REPORTED" />
        <StatusIndicator status="IN_PROGRESS" />
        <StatusIndicator status="RESOLVED" />
        <PriorityIndicator priority="LOW" />
        <PriorityIndicator priority="MEDIUM" />
        <PriorityIndicator priority="HIGH" />
        <PriorityIndicator priority="CRITICAL" />
        <AccessibleBarChart title="Empty Bars" data={[]} />
        <MonthlyTrendsChart title="Empty Trends" trends={[]} />
      </AppProvider>
    );
    expect(screen.getAllByText('Reported').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(
      screen.getByText('Monthly trend bars appear as complaints are reported and resolved.')
    ).toBeInTheDocument();
  });
});
