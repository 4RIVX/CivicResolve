import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiClient } from '../lib/apiClient';
import { createEmptyPublicStats } from '../server/services/firestoreRestClient';
import type { PublicAggregateStats } from '../shared/types';

export function LandingPage() {
  const { t } = useApp();
  const [stats, setStats] = useState<PublicAggregateStats>(createEmptyPublicStats);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .getPublicStatistics()
      .then((res) => {
        if (active && res.statistics) {
          setStats(res.statistics);
        }
      })
      .catch(() => {
        // Keep zero-initialized honest baseline if offline
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      {/* Hero Split Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:py-16 lg:px-8">
          <div className="flex flex-col justify-center space-y-6 lg:col-span-6">
            <p className="text-sm font-semibold tracking-wide text-teal-700">
              {t.tagline}
            </p>
            <h1
              className="font-display font-bold tracking-tight text-slate-900"
              style={{ fontSize: 'clamp(2.25rem, 3.6vw, 3.25rem)', textWrap: 'balance', lineHeight: 1.1 }}
            >
              {t.heroTitle}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-600">
              {t.heroSubtitle}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                to="/citizen/report"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 whitespace-nowrap shrink-0"
              >
                <span>{t.heroPrimaryCta}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/transparency"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap shrink-0"
              >
                {t.heroSecondaryCta}
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            {heroImgFailed ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 via-blue-950 to-teal-900 p-8 text-white">
                <Building2 className="mb-3 h-12 w-12 text-teal-300" aria-hidden="true" />
                <p className="font-display text-lg font-semibold">CivicResolve Municipal Infrastructure</p>
              </div>
            ) : (
              <div className="h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src="/src/assets/images/hero_civic_city_1795247567962.jpg"
                  alt="Modern municipal civic center and safe urban crosswalks in morning daylight"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* Full-Width 4-Column Live Impact KPI Strip */}
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t.publicImpactHeading}
            </h2>
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">{t.statTotalReported}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-900">
                  {stats.totalReported}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">{t.statResolved}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-teal-700">
                  {stats.resolvedCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">{t.statInProgress}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-blue-700">
                  {stats.inProgressCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">{t.statResolutionRate}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-900">
                  {stats.resolutionRate}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Three-Step Workflow */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t.problemHeading}
            </h2>
            <p className="text-base leading-relaxed text-slate-600">{t.problemCopy}</p>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src="/src/assets/images/civic_road_repair_1795247566911.jpg"
                  alt="Municipal road engineers repairing urban asphalt surface with safety barriers"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src="/src/assets/images/civic_street_lighting_1795247567465.jpg"
                  alt="Well-illuminated urban boulevard with functioning LED streetlights at dusk"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-7">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t.howItWorksHeading}
            </h2>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              <div className="p-6">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {t.step1Title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.step1Desc}</p>
              </div>
              <div className="p-6">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {t.step2Title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.step2Desc}</p>
              </div>
              <div className="p-6">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {t.step3Title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.step3Desc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Capabilities & Safeguards */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t.aiCapabilitiesHeading}
            </h2>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-slate-700">{t.aiCap1}</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-slate-700">{t.aiCap2}</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-slate-700">{t.aiCap3}</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-slate-700">{t.aiCap4}</p>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-900 p-8 text-white">
            <div>
              <h3 className="font-display text-xl font-bold">
                {t.ctaHeading}
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                {t.ctaCopy}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                {t.navSignIn}
              </Link>
              <Link
                to="/transparency"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {t.navTransparency}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
