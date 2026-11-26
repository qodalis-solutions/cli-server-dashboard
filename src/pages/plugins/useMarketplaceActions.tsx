import { useCallback, useState, type ReactNode } from 'react';
import { Spinner } from '@qodalis/cli-server-dashboard-kit';
import { installMarketplacePlugin, removeMarketplacePlugin, updateMarketplacePlugin } from '../../api/marketplace';
import { ConfigValidationError } from '../../api/config';
import { useConfirm } from '../../components/useConfirm';
import { useExtensions } from '../../context/ExtensionsContext';
import { useI18n, type MessageKey } from '../../i18n';
import type { ConfigValue, MarketplaceRequirement } from '../../types';
import { installServerPlugin } from '../../api/serverMarketplace';
import { useMarketplaceErrorText } from './marketplaceText';
import MarketplaceActionDialog from './MarketplaceActionDialog';
import FailureNotice from './FailureNotice';
import Notice from './Notice';

export type MarketplaceAction = 'install' | 'update' | 'remove';

/** The plugin an action is about: its package, its title and, when known, its publisher. */
export interface ActionTarget {
  name: string;
  title: string;
  publisher?: string;
  /** The server plugin it needs (`requires` of its marketplace item): the install dialog says when it is missing. */
  requires?: MarketplaceRequirement | null;
}

/** What the install dialog asked besides the settings: the server plugin to install too (its marketplace name and title). */
export interface ServerPluginChoice {
  name: string;
  title: string;
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
 * Install, update and remove of marketplace plugins. Install and update open a dialog saying the plugin runs inside
 * the dashboard with the user's permissions (naming its publisher) with the settings the version declares (defaults on
 * install, current values on update; see {@link MarketplaceActionDialog}); remove asks a danger confirmation. Then the
 * request with a spinner, then a notice (an update names the settings it reset: `configDropped`), or the failure with
 * its reason (502 unreachable, 403 unverified, integrity mismatch, 409 id clash, else the server's message, or "The
 * server answered 500" without one): in the dialog, which stays open, for install and update; on the page, brought
 * into view, for remove. Settings the server refuses (400 per
 * key) keep the dialog open with the messages under their fields. The extensions are reloaded after every change, so
 * the plugin's page appears in or leaves the navigation at once (the server's `dashboard:extensions-changed` event does
 * the same for every other open dashboard).
 */
export function useMarketplaceActions(onChanged: () => void) {
  const { t } = useI18n();
  const { reload } = useExtensions();
  const { confirm, dialog } = useConfirm();
  const reason = useMarketplaceErrorText();
  const [busy, setBusy] = useState<{ name: string; action: MarketplaceAction; title: string } | null>(null);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{
    action: 'install' | 'update';
    target: ActionTarget;
    errors: Record<string, string>;
    /** The last attempt failed: shown in the dialog, which stays open (Install again, or Cancel). */
    failure?: { title: string; message: string };
  } | null>(null);

  const execute = useCallback(async (action: MarketplaceAction, target: ActionTarget, config: Record<string, ConfigValue> = {}, server?: ServerPluginChoice) => {
    const title = target.title || target.name;
    setFailure(null);
    setNotice(null);
    setBusy({ name: target.name, action, title });
    try {
      if (action === 'remove') {
        await removeMarketplacePlugin(target.name);
        setNotice(t(DONE[action], { title }));
      } else {
        const send = action === 'install' ? installMarketplacePlugin : updateMarketplacePlugin;
        const result = await send(target.name, { config });
        const dropped = result.configDropped ?? [];
        setNotice(dropped.length > 0 ? t('marketplace.didUpdateDropped', { title, keys: dropped.join(', ') }) : t(DONE[action], { title }));
        // The server plugin it needs, asked for in the dialog: the page is installed whatever happens to it
        if (action === 'install' && server) {
          try {
            await installServerPlugin(server.name);
            setNotice(t('marketplace.didInstallWithServer', { title, server: server.title }));
          } catch (err) {
            setFailure({ title: t('marketplace.serverInstallFailed', { title, server: server.title }), message: reason(err) });
          }
        }
      }
      setForm(null);
      reload();
      onChanged();
    } catch (err) {
      const failed = { title: t(FAILED[action], { title }), message: reason(err) };
      if (action === 'remove') {
        // The confirmation closed before the request: the failure is shown on the page, brought into view
        setFailure(failed);
      } else if (err instanceof ConfigValidationError) {
        setForm({ action, target, errors: err.errors });
      } else {
        // The dialog stays open with the server's message: closing it hid the failure above the list, out of view
        setForm({ action, target, errors: {}, failure: failed });
      }
    } finally {
      setBusy(null);
    }
  }, [t, reason, reload, onChanged]);

  const run = useCallback(async (action: MarketplaceAction, target: ActionTarget) => {
    if (action !== 'remove') {
      setForm({ action, target, errors: {} });
      return;
    }
    const title = target.title || target.name;
    const ok = await confirm({
      title: t('marketplace.confirmRemove', { title }),
      message: t('marketplace.confirmRemoveMessage'),
      confirmLabel: t('marketplace.remove'),
      tone: 'danger',
    });
    if (ok) await execute(action, target);
  }, [confirm, t, execute]);

  const status: ReactNode = (
    <>
      {dialog}
      {form && (
        <MarketplaceActionDialog
          key={`${form.action}:${form.target.name}`}
          action={form.action}
          target={form.target}
          busy={busy !== null}
          serverErrors={form.errors}
          failure={form.failure}
          onCancel={() => setForm(null)}
          onConfirm={(config, server) => void execute(form.action, form.target, config, server)}
        />
      )}
      {busy && (
        <div role="status" className="flex items-center gap-2 text-xs text-muted">
          <Spinner />
          {t(BUSY[busy.action], { title: busy.title })}
        </div>
      )}
      {failure && <FailureNotice title={failure.title} message={failure.message} />}
      {notice && <Notice message={notice} onDismiss={() => setNotice(null)} />}
    </>
  );

  return { run, busy, status };
}
