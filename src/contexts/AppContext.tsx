import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { apiClient } from '../lib/apiClient';
import { TRANSLATIONS, type TranslationDictionary } from '../shared/i18n';
import type { AuthenticatedUser, DepartmentConfig, SupportedLanguage } from '../shared/types';
import { DEPARTMENT_DIRECTORY } from '../shared/safetyRules';

interface AppContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: TranslationDictionary;
  firebaseUser: User | null;
  user: AuthenticatedUser | null;
  departments: DepartmentConfig[];
  authLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const saved = window.localStorage.getItem('civicresolve_lang');
      return saved === 'ta' ? 'ta' : 'en';
    } catch {
      return 'en';
    }
  });

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [departments, setDepartments] = useState<DepartmentConfig[]>(
    Object.values(DEPARTMENT_DIRECTORY)
  );
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem('civicresolve_lang', lang);
    } catch {
      // Ignore storage errors in restricted environments
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      setAuthError(null);
      if (!fbUser) {
        setUser(null);
        setAuthLoading(false);
        return;
      }

      try {
        const token = await fbUser.getIdToken();
        const me = await apiClient.getAuthMe(token);
        setUser(me.user);
        if (me.departments?.length) {
          setDepartments(me.departments);
        }
      } catch (err) {
        setUser(null);
        setAuthError(
          err instanceof Error ? err.message : 'Unable to verify authentication session.'
        );
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in cancelled or failed.';
      setAuthError(message);
      throw err;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
    setUser(null);
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        t: TRANSLATIONS[language],
        firebaseUser,
        user,
        departments,
        authLoading,
        authError,
        signInWithGoogle,
        signOutUser,
        getToken,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
