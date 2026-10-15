/** Supported UI languages (same set as the CLI). `en` is the source language. */
export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'ru', name: 'Русский' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

/** CLDR plural categories used as key suffixes: `key_one`, `key_few`, … */
export type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Every plural form of keys that are plural in English (`items_one` → `items_few`, `items_many`, …). */
type PluralForms<K extends string> = K extends `${infer Base}_${PluralSuffix}` ? `${Base}_${PluralSuffix}` : never;

/** `items_one` / `items_other` → `items` (what callers pass to `t` together with `count`). */
export type StripPlural<K> = K extends `${infer Base}_${PluralSuffix}` ? Base : K;

/**
 * Messages of one area for every locale. English is complete and defines the keys; other
 * locales may omit keys (English is used) and may add plural forms English doesn't need
 * (e.g. Russian `_few` / `_many`).
 */
export type NamespaceMessages<K extends string = string> = { en: Record<K, string> } & {
  [L in Exclude<Locale, 'en'>]?: Partial<Record<K | PluralForms<K>, string>>;
};

/** Helper so a namespace file is checked against its English keys (inferred from `en` only). */
export function defineMessages<K extends string>(
  messages: { en: Record<K, string> } & {
    [L in Exclude<Locale, 'en'>]?: Partial<Record<NoInfer<K> | PluralForms<NoInfer<K>>, string>>;
  },
): NamespaceMessages<K> {
  return messages;
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.code === value);
}
