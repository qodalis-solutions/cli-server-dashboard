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

/** Messages of one area for every locale; English is complete, others may omit keys (falls back to English). */
export type NamespaceMessages<K extends string = string> = { en: Record<K, string> } & {
  [L in Exclude<Locale, 'en'>]?: Partial<Record<K, string>>;
};

/** Helper so a namespace file is checked against its English keys. */
export function defineMessages<K extends string>(messages: NamespaceMessages<K>): NamespaceMessages<K> {
  return messages;
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.code === value);
}
