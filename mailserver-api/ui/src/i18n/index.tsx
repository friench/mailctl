import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DICTIONARIES } from './dictionaries';
import type { Locale } from './types';

export type { Locale } from './types';
export { LOCALES } from './types';

const STORAGE_KEY = 'mailctl.locale';

export type TranslateVars = Record<string, string | number>;
export type TranslateFn = (key: string, vars?: TranslateVars) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  }
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru')) {
    return 'ru';
  }
  return 'en';
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, name) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      // Prefer the active locale, fall back to English, then to the key itself.
      const value = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key;
      return interpolate(value, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useT(): TranslateFn {
  return useI18n().t;
}
