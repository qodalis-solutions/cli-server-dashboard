import { LOCALES, useI18n, type Locale } from '../i18n';

/** Compact language selector (remembered per browser). */
export default function LanguagePicker() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-subtle">
      <span aria-hidden>🌐</span>
      <span className="sr-only">{t('common.language')}</span>
      <select
        aria-label={t('common.language')}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-transparent text-muted hover:text-text border-none outline-none cursor-pointer text-[11px]"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} className="bg-popover text-text">
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
