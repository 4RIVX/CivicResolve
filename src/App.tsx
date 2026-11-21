import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './contexts/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppLayout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';

const PublicTransparencyPage = lazy(() =>
  import('./pages/PublicTransparencyPage').then((m) => ({ default: m.PublicTransparencyPage }))
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);

const CitizenDashboardPage = lazy(() =>
  import('./pages/CitizenDashboardPage').then((m) => ({ default: m.CitizenDashboardPage }))
);
const CitizenReportPage = lazy(() =>
  import('./pages/CitizenReportPage').then((m) => ({ default: m.CitizenReportPage }))
);
const ComplaintDetailPage = lazy(() =>
  import('./pages/ComplaintDetailPage').then((m) => ({ default: m.ComplaintDetailPage }))
);
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage }))
);
const AdminComplaintReviewPage = lazy(() =>
  import('./pages/AdminComplaintReviewPage').then((m) => ({
    default: m.AdminComplaintReviewPage,
  }))
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useApp();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12" aria-busy="true">
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12" aria-busy="true">
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <AppLayout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/transparency" element={<PublicTransparencyPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/citizen"
                  element={
                    <ProtectedRoute>
                      <CitizenDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/citizen/report"
                  element={
                    <ProtectedRoute>
                      <CitizenReportPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/citizen/complaints/:id"
                  element={
                    <ProtectedRoute>
                      <ComplaintDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/complaints/:id"
                  element={
                    <ProtectedRoute>
                      <AdminComplaintReviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
