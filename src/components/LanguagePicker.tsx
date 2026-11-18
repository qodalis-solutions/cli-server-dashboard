import { LOCALES, useI18n, type Locale } from '../i18n';

/** Compact language selector (remembered per browser); `touch`: a full-size target for the navigation drawer. */
export default function LanguagePicker({ touch = false }: { touch?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={`flex items-center gap-1.5 text-subtle ${touch ? 'min-h-11 px-3 rounded-lg bg-control text-sm' : 'text-[10px]'}`}>
      <span aria-hidden>🌐</span>
      <span className="sr-only">{t('common.language')}</span>
      <select
        aria-label={t('common.language')}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className={`bg-transparent text-muted hover:text-text border-none outline-none cursor-pointer ${touch ? 'flex-1 min-h-11 text-sm' : 'text-[11px]'}`}
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
