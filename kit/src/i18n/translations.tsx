import { useMemo } from 'react';
import { useKitLocale } from './text';
import type { NamespaceMessages, StripPlural } from './locales';

/** Every `namespace.key` of a plugin's messages; plural keys without their suffix (`items_one` → `ns.items`). */
export type TranslationKey<N extends Record<string, NamespaceMessages>> = {
  [K in keyof N]: `${K & string}.${StripPlural<keyof N[K]['en'] & string>}`;
}[keyof N];

export type TranslationParams = Record<string, string | number>;

export interface Translations<K extends string> {
  /** The dashboard's language (`en`, `de`, …). */
  locale: string;
  /**
   * `namespace.key` in the dashboard's language, else English, else the key. `{name}` placeholders come from
   * `params`; with a numeric `count`, `key_one` / `key_few` / `key_many` / `key_other` follow the language's
   * plural rules.
   */
  t: (key: K, params?: TranslationParams) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** "5 minutes ago" / "in 30 seconds". */
  formatRelative: (value: string | number | Date) => string;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
];

/**
 * A plugin's own texts, in the dashboard's language: each plugin ships its messages (one `defineMessages` per
 * namespace) and translates them with this, like the dashboard does its own.
 *
 * ```ts
 * const messages = { billing: defineMessages({ en: { title: 'Billing' }, de: { title: 'Abrechnung' } }) };
 * const { t } = useTranslations(messages); // t('billing.title')
 * ```
 */
export function useTranslations<N extends Record<string, NamespaceMessages>>(messages: N): Translations<TranslationKey<N>> {
  const locale = useKitLocale();
  return useMemo(() => createTranslations(messages, locale), [messages, locale]);
}

/** {@link useTranslations} outside React. */
export function createTranslations<N extends Record<string, NamespaceMessages>>(messages: N, locale: string): Translations<TranslationKey<N>> {
  const plural = new Intl.PluralRules(locale);
  const numbers = new Intl.NumberFormat(locale);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const lookup = (namespace: string, name: string): string | undefined => {
    const ns = (messages as Record<string, Record<string, Record<string, string> | undefined> | undefined>)[namespace];
    return ns?.[locale]?.[name] ?? ns?.en?.[name];
  };

  const t = (key: string, params?: TranslationParams): string => {
    const dot = key.indexOf('.');
    const namespace = key.slice(0, dot);
    const name = key.slice(dot + 1);
    if (params && 'count' in params && typeof params.count !== 'number') {
      // A missing count must not leak `{count}` or "undefined" into the text
      const n = Number(params.count);
      params = { ...params, count: Number.isFinite(n) ? n : 0 };
    }
    let text: string | undefined;
    if (params && typeof params.count === 'number') {
      text = lookup(namespace, `${name}_${plural.select(params.count)}`) ?? lookup(namespace, `${name}_other`);
    }
    text ??= lookup(namespace, name) ?? lookup(namespace, `${name}_other`) ?? key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, p: string) =>
      params[p] != null ? (typeof params[p] === 'number' ? numbers.format(params[p] as number) : String(params[p])) : match,
    );
  };

  return {
    locale,
    t,
    formatDate: (value, options) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, options);
    },
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
    formatRelative: value => {
      const time = new Date(value).getTime();
      if (Number.isNaN(time)) return '—';
      const seconds = Math.round((time - Date.now()) / 1000);
      for (const [unit, size] of RELATIVE_UNITS) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
      }
      return relative.format(seconds, 'second');
    },
  };
}
