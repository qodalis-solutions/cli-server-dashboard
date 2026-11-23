import { createContext, useContext, useMemo, type ReactNode } from 'react';
import kitMessages from './messages';
import { isLocale, type Locale } from './locales';

export type KitTextKey = keyof typeof kitMessages.en;
export type KitTextParams = Record<string, string | number>;

const KitLocaleContext = createContext<Locale>('en');

/**
 * The language of the kit's components (their built-in texts and number formats). The dashboard
 * passes its own; an extension gets it from its context (`defineExtension` does this). Without a
 * provider the components speak English. An unknown language falls back to English.
 */
export function KitProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const base = locale.toLowerCase().split('-')[0];
  return <KitLocaleContext.Provider value={isLocale(base) ? base : 'en'}>{children}</KitLocaleContext.Provider>;
}

/** The kit's current language. */
export function useKitLocale(): Locale {
  return useContext(KitLocaleContext);
}

function translate(locale: Locale, key: KitTextKey, params?: KitTextParams): string {
  const table = (kitMessages as Record<string, Partial<Record<KitTextKey, string>> | undefined>)[locale];
  const text = table?.[key] ?? kitMessages.en[key];
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (params && name in params ? String(params[name]) : match));
}

/** The kit's built-in texts and number format in the current language. */
export function useKitText(): { t: (key: KitTextKey, params?: KitTextParams) => string; formatNumber: (value: number) => string } {
  const locale = useKitLocale();
  return useMemo(() => {
    const numbers = new Intl.NumberFormat(locale);
    return { t: (key, params) => translate(locale, key, params), formatNumber: (value) => numbers.format(value) };
  }, [locale]);
}
