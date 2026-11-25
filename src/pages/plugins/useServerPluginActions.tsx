import { useCallback, useState, type ReactNode } from 'react';
import { ErrorState, Spinner } from '@qodalis/cli-server-dashboard-kit';
import { useNavigate } from 'react-router';
import { installServerPlugin, removeServerPlugin, serverPluginSettingsPath, updateServerPlugin } from '../../api/serverMarketplace';
import { useConfirm } from '../../components/useConfirm';
import { useI18n, type MessageKey } from '../../i18n';
import type { ServerPlatform } from '../../types';
import Notice from './Notice';
import RestartNotice from './RestartNotice';
import { useServerPluginErrorText } from './serverPluginText';

export type ServerPluginAction = 'install' | 'update' | 'remove';

/** The server plugin an action is about: its marketplace name, title, this server's package and, when known, its publisher. */
export interface ServerActionTarget {
  name: string;
  title: string;
  package: string;
  publisher?: { name: string; verified: boolean };
  /** The version an install or update brings, when known. */
  version?: string | null;
  platform?: ServerPlatform | null;
}

const FAILED: Record<ServerPluginAction, MessageKey> = {
  install: 'serverMarketplace.installFailed',
  update: 'serverMarketplace.updateFailed',
  remove: 'serverMarketplace.removeFailed',
};
const BUSY: Record<ServerPluginAction, MessageKey> = {
  install: 'serverMarketplace.installing',
  update: 'serverMarketplace.updating',
  remove: 'serverMarketplace.removing',
};
const CONFIRM: Record<ServerPluginAction, MessageKey> = {
  install: 'serverMarketplace.confirmInstall',
  update: 'serverMarketplace.confirmUpdate',
  remove: 'serverMarketplace.confirmRemove',
};
const LABEL: Record<ServerPluginAction, MessageKey> = {
  install: 'marketplace.install',
  update: 'marketplace.update',
  remove: 'marketplace.remove',
};

/**
 * Install, update and remove of server plugins. Each asks first: the plugin runs code inside the server process with
 * its full rights, its publisher and package, and that the change applies after a restart. Then the request with a
 * spinner, then "Restart the server to apply" with Restart server (the restart banner follows the server's
 * `server:restart-required` event); a plugin installed without its required settings (`needs-configuration`) opens its
 * settings on the Config page. Or the failure with its reason (502 unreachable, integrity mismatch, 403
 * unverified or forbidden, 400 incompatible or needs setup in code, 409 the host's own package).
 */
export function useServerPluginActions(onChanged: () => void) {
  const { t } = useI18n();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();
  const reason = useServerPluginErrorText();
  const [busy, setBusy] = useState<{ name: string; action: ServerPluginAction; title: string } | null>(null);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ message: string; restart: boolean } | null>(null);

  const execute = useCallback(async (action: ServerPluginAction, target: ServerActionTarget) => {
    const title = target.title || target.name;
    setFailure(null);
    setNotice(null);
    setBusy({ name: target.name, action, title });
    try {
      const result = action === 'install' ? await installServerPlugin(target.name)
        : action === 'update' ? await updateServerPlugin(target.name)
          : await removeServerPlugin(target.name);
      const version = result.version ?? target.version ?? '';
      if (action === 'update' && result.changed === false) {
        setNotice({ message: t('serverMarketplace.alreadyVersion', { title, version }), restart: false });
      } else {
        const message = action === 'install' ? t('serverMarketplace.didInstall', { title, version })
          : action === 'update' ? t('serverMarketplace.didUpdate', { title, version })
            : t('serverMarketplace.didRemove', { title });
        setNotice({ message, restart: result.restartRequired });
      }
      onChanged();
      // Installed without its required settings: straight to them (it loads once they are set and the server restarts)
      if (action !== 'remove' && result.status === 'needs-configuration') {
        navigate(serverPluginSettingsPath({ name: result.name ?? target.name, configProvider: result.configProvider, configSection: result.configSection }));
      }
    } catch (err) {
      setFailure({ title: t(FAILED[action], { title }), message: reason(err) });
    } finally {
      setBusy(null);
    }
  }, [t, reason, onChanged, navigate]);

  const run = useCallback(async (action: ServerPluginAction, target: ServerActionTarget) => {
    const title = target.title || target.name;
    const publisher = target.publisher?.name || '—';
    const ok = await confirm({
      title: t(CONFIRM[action], { title }),
      message: (
        <div className="space-y-2" data-testid="server-plugin-confirm">
          {action === 'remove' ? (
            <p>{t('serverMarketplace.confirmRemoveMessage', { package: target.package })}</p>
          ) : (
            <>
              <p className="text-warning">{t('serverMarketplace.confirmRisk')}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-subtle">{t('serverMarketplace.publisher')}</dt>
                <dd className="text-text">
                  {publisher}
                  {target.publisher && !target.publisher.verified && ` (${t('marketplace.unverified')})`}
                </dd>
                <dt className="text-subtle">{t('serverMarketplace.package')}</dt>
                <dd className="font-mono text-text break-all">
                  {target.package}{target.version ? `@${target.version}` : ''}
                </dd>
              </dl>
            </>
          )}
          <p className="text-xs text-muted">{t('serverMarketplace.confirmRestart')}</p>
        </div>
      ),
      confirmLabel: t(LABEL[action]),
      tone: 'danger',
    });
    if (ok) await execute(action, target);
  }, [confirm, t, execute]);

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
      {notice && (notice.restart
        ? <RestartNotice message={notice.message} onDismiss={() => setNotice(null)} />
        : <Notice message={notice.message} onDismiss={() => setNotice(null)} />)}
    </>
  );

  return { run, busy, status };
}
