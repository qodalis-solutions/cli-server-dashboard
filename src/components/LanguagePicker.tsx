import { LOCALES, useI18n, type Locale } from '../i18n';
import Select from './Select';

const OPTIONS = LOCALES.map(l => ({ value: l.code, label: l.name }));

/** Compact language selector (remembered per browser); `touch`: a full-size target for the navigation drawer. */
export default function LanguagePicker({ touch = false }: { touch?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`flex items-center gap-1.5 text-subtle ${touch ? 'text-sm' : 'text-[10px]'}`}>
      <span aria-hidden>🌐</span>
      <Select<Locale>
        label={t('common.language')}
        options={OPTIONS}
        value={locale}
        onChange={setLocale}
        size={touch ? 'md' : 'sm'}
        width="full"
        className="flex-1"
      />
    </div>
  );
}
