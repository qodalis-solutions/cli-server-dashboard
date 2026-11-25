import { useI18n } from '../../i18n';

/** A quiet notice above the list (a plugin installed, a page that was removed), until dismissed. */
export default function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-info/30 bg-info/[0.06] px-3 py-2 text-sm text-info">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs underline-offset-2 hover:underline">
        {t('marketplace.dismiss')}
      </button>
    </div>
  );
}
