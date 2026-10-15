import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages } from './messages';
import { isLocale, LOCALES, type Locale } from './locales';

type Registry = typeof messages;
/** Every valid message key, e.g. `nav.overview` (checked at compile time). */
export type MessageKey = {
  [N in keyof Registry]: `${N & string}.${keyof Registry[N]['en'] & string}`;
}[keyof Registry];

export type MessageParams = Record<string, string | number>;

const STORAGE_KEY = 'qcli_admin_locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // storage unavailable
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const base = lang?.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

function lookup(locale: Locale, namespace: string, key: string): string | undefined {
  const ns = (messages as Record<string, Record<string, Record<string, string> | undefined>>)[namespace];
  return ns?.[locale]?.[key] ?? ns?.en?.[key];
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /**
   * Translate `namespace.key`. `{name}` placeholders are replaced from `params`.
   * With a numeric `count`, `key_one` / `key_few` / `key_many` / `key_other`
   * are used when defined (plural rules of the active locale).
   */
  t: (key: MessageKey, params?: MessageParams) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** "5 minutes ago" / "in 30 seconds" in the active locale */
  formatRelative: (value: string | number | Date) => string;
}

const I18nCtx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable: keep it for this page only
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const plural = new Intl.PluralRules(locale);
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    const t = (key: MessageKey, params?: MessageParams): string => {
      const dot = key.indexOf('.');
      const namespace = key.slice(0, dot);
      const name = key.slice(dot + 1);
      let text: string | undefined;
      if (params && typeof params.count === 'number') {
        const form = plural.select(params.count);
        text = lookup(locale, namespace, `${name}_${form}`) ?? lookup(locale, namespace, `${name}_other`);
      }
      text ??= lookup(locale, namespace, name) ?? key;
      if (!params) return text;
      return text.replace(/\{(\w+)\}/g, (match, p: string) =>
        p in params ? String(typeof params[p] === 'number' ? new Intl.NumberFormat(locale).format(params[p] as number) : params[p]) : match,
      );
    };

    const formatRelative = (value: string | number | Date): string => {
      const time = new Date(value).getTime();
      if (Number.isNaN(time)) return '—';
      const seconds = Math.round((time - Date.now()) / 1000);
      const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
      ];
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
      }
      return relative.format(seconds, 'second');
    };

    return {
      locale,
      setLocale,
      t,
      formatDate: (v, options) => {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale, options);
      },
      formatNumber: (v, options) => new Intl.NumberFormat(locale, options).format(v),
      formatRelative,
    };
  }, [locale, setLocale]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

/** Like useI18n, but `null` outside the provider (error fallbacks). */
export function useOptionalI18n(): I18nValue | null {
  return useContext(I18nCtx);
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export { LOCALES };
