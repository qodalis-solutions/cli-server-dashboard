import { useCallback, useState, type ReactNode } from 'react';
import { ErrorState, Spinner } from '@qodalis/cli-server-dashboard-kit';
import { installMarketplacePlugin, removeMarketplacePlugin, updateMarketplacePlugin } from '../../api/marketplace';
import { useConfirm } from '../../components/useConfirm';
import { useExtensions } from '../../context/ExtensionsContext';
import { useI18n, type MessageKey } from '../../i18n';
import { useMarketplaceErrorText } from './marketplaceText';
import Notice from './Notice';

export type MarketplaceAction = 'install' | 'update' | 'remove';

/** The plugin an action is about: its package, its title and, when known, its publisher. */
export interface ActionTarget {
  name: string;
  title: string;
  publisher?: string;
}

const FAILED: Record<MarketplaceAction, MessageKey> = {
  install: 'marketplace.installFailed',
  update: 'marketplace.updateFailed',
  remove: 'marketplace.removeFailed',
};
const BUSY: Record<MarketplaceAction, MessageKey> = {
  install: 'marketplace.installing',
  update: 'marketplace.updating',
  remove: 'marketplace.removing',
};
const DONE: Record<MarketplaceAction, MessageKey> = {
  install: 'marketplace.didInstall',
  update: 'marketplace.didUpdate',
  remove: 'marketplace.didRemove',
};

/**
 * Install, update and remove of marketplace plugins: a confirmation first (install and update say the plugin runs
 * inside the dashboard with the user's permissions and name its publisher), then the request with a spinner, then a
 * notice, or the failure with its reason (502 unreachable, 403 unverified, integrity mismatch, 409 id clash). The
 * extensions are reloaded after every change, so the plugin's page appears in or leaves the navigation at once
 * (the server's `dashboard:extensions-changed` event does the same for every other open dashboard).
 */
export function useMarketplaceActions(onChanged: () => void) {
  const { t } = useI18n();
  const { reload } = useExtensions();
  const { confirm, dialog } = useConfirm();
  const reason = useMarketplaceErrorText();
  const [busy, setBusy] = useState<{ name: string; action: MarketplaceAction; title: string } | null>(null);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(async (action: MarketplaceAction, target: ActionTarget) => {
    const title = target.title || target.name;
    const ok = await confirm(
      action === 'install'
        ? {
            title: t('marketplace.confirmInstall', { title }),
            message: t('marketplace.confirmInstallMessage', { title, publisher: target.publisher || '—' }),
            confirmLabel: t('marketplace.install'),
          }
        : action === 'update'
          ? {
              title: t('marketplace.confirmUpdate', { title }),
              message: target.publisher
                ? t('marketplace.confirmUpdateMessage', { publisher: target.publisher })
                : t('marketplace.confirmUpdatePlain'),
              confirmLabel: t('marketplace.update'),
            }
          : {
              title: t('marketplace.confirmRemove', { title }),
              message: t('marketplace.confirmRemoveMessage'),
              confirmLabel: t('marketplace.remove'),
              tone: 'danger',
            },
    );
    if (!ok) return;
    setFailure(null);
    setNotice(null);
    setBusy({ name: target.name, action, title });
    try {
      if (action === 'install') await installMarketplacePlugin(target.name);
      else if (action === 'update') await updateMarketplacePlugin(target.name);
      else await removeMarketplacePlugin(target.name);
      setNotice(t(DONE[action], { title }));
      reload();
      onChanged();
    } catch (err) {
      setFailure({ title: t(FAILED[action], { title }), message: reason(err) });
    } finally {
      setBusy(null);
    }
  }, [confirm, t, reason, reload, onChanged]);

  const status: ReactNode = (
    <>
      {dialog}
      {busy && (
        <div role="status" className="flex items-center gap-2 text-xs text-muted">
          <Spinner />
          {t(BUSY[busy.action], { title: busy.title })}
        </div>
      )}
      {failure && <ErrorState title={failure.title} error={failure.message} compact />}
      {notice && <Notice message={notice} onDismiss={() => setNotice(null)} />}
    </>
  );

  return { run, busy, status };
}
