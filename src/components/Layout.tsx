import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Globe, LogOut, Menu, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export function LanguageSwitcher() {
  const { language, setLanguage } = useApp();

  return (
    <div
      role="group"
      aria-label="Language selection"
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5"
    >
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap shrink-0 ${
          language === 'en'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLanguage('ta')}
        aria-pressed={language === 'ta'}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap shrink-0 ${
          language === 'ta'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        தமிழ்
      </button>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, user, signOutUser } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/', label: t.navHome },
    { to: '/transparency', label: t.navTransparency },
    { to: '/citizen', label: t.navCitizenPortal },
    { to: '/admin', label: t.navAdminPortal },
  ];

  const handlePrimaryAction = async () => {
    if (user) {
      await signOutUser();
      navigate('/');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t.skipToContent}
      </a>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Zone 1: Single clean wordmark */}
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-sm"
          >
            {t.brandName}
          </Link>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            {navItems.map((item) => {
              const active =
                item.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-xs ${
                    active
                      ? 'text-blue-700 underline decoration-2 underline-offset-8'
                      : ''
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action button (+ mobile menu button on narrow screens) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="hidden md:inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 whitespace-nowrap shrink-0"
            >
              {user && <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{user ? t.navSignOut : t.navSignIn}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <nav aria-label="Mobile navigation" className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
                <LanguageSwitcher />
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void handlePrimaryAction();
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white"
                >
                  {user ? t.navSignOut : t.navSignIn}
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Secondary Workspace Utility Strip */}
      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>{t.tagline}</span>
            {user && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-800">{user.email}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] font-semibold text-teal-700">
                  {user.role}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display font-semibold text-slate-900">{t.brandName}</span>
            <span aria-hidden="true">·</span>
            <span>{t.tagline}</span>
            <span aria-hidden="true">·</span>
            <span>Cloud Firestore &amp; Gemini Flash Infrastructure Platform</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/transparency" className="hover:text-slate-900 hover:underline">
              {t.navTransparency}
            </Link>
            <Link to="/citizen" className="hover:text-slate-900 hover:underline">
              {t.navCitizenPortal}
            </Link>
            <Link to="/admin" className="hover:text-slate-900 hover:underline">
              {t.navAdminPortal}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
