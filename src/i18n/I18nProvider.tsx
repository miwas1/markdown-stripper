import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import messages from './locales.json';

export const SUPPORTED_LOCALES = ['en', 'es', 'de', 'ja', 'fr', 'pt', 'it', 'ru', 'nl', 'pl'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
type MessageKey = keyof typeof messages.en;

const STORAGE_KEY = 'markdown-stripper.locale';

function isLocale(value: string | null): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Language detection still works when storage is disabled by the browser.
  }
  for (const browserLocale of navigator.languages ?? [navigator.language]) {
    const base = browserLocale.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey) => string };
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(detectLocale);
  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the in-memory preference for this visit when storage is unavailable.
    }
    updateLocale(next);
  }, []);
  const t = useCallback((key: MessageKey) => messages[locale][key] ?? messages.en[key], [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
