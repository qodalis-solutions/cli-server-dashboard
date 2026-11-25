import { useRestart } from '../../context/RestartContext';
import { useI18n } from '../../i18n';

/** "Restart the server to apply" after a change, with Restart server when the user may and the server can. */
export default function RestartNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useI18n();
  const { canRestart, requestRestart } = useRestart();
  return (
    <div role="status" data-testid="restart-notice" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
      <span className="text-text">{message}</span>
      <span className="font-medium text-warning">{t('serverMarketplace.restartToApply')}</span>
      <span className="ml-auto flex items-center gap-2">
        {canRestart && (
          <button type="button" onClick={requestRestart} className="px-3 py-1 rounded-md text-xs bg-primary hover:bg-primary-hover text-on-primary">
            {t('restart.restartServer')}
          </button>
        )}
        <button type="button" onClick={onDismiss} className="text-xs underline-offset-2 hover:underline text-muted">
          {t('marketplace.dismiss')}
        </button>
      </span>
    </div>
  );
}
