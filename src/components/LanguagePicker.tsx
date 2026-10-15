import { LOCALES, useI18n, type Locale } from '../i18n';

/** Compact language selector (remembered per browser). */
export default function LanguagePicker() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
      <span aria-hidden>🌐</span>
      <span className="sr-only">{t('common.language')}</span>
      <select
        aria-label={t('common.language')}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-transparent text-slate-400 hover:text-slate-200 border-none outline-none cursor-pointer text-[11px]"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} className="bg-slate-900 text-slate-200">
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
