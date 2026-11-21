import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export function LoginPage() {
  const { t, user, authLoading, authError, signInWithGoogle } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingIn, setSigningIn] = useState(false);

  const fromPath =
    (location.state as { from?: string } | null)?.from || '/citizen';

  useEffect(() => {
    if (!authLoading && user) {
      navigate(user.isAdmin && fromPath.startsWith('/admin') ? '/admin' : fromPath, {
        replace: true,
      });
    }
  }, [authLoading, user, fromPath, navigate]);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error surfaced via authError in context
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Firebase Authentication</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {t.signInTitle}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">{t.signInSubtitle}</p>
        </div>

        {authError && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
          >
            {authError}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <button
            type="button"
            disabled={signingIn}
            onClick={handleLogin}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            {signingIn ? 'Opening Google Sign-In...' : t.signInWithGoogle}
          </button>
          <p className="text-xs leading-relaxed text-slate-500">
            {t.loginSecurityNote}
          </p>
        </div>
      </div>
    </div>
  );
}
