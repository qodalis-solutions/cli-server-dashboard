import { useCallback, useId, useMemo, useState } from 'react';
import { ErrorState, Modal, Spinner, useKitText } from '@qodalis/cli-server-dashboard-kit';
import { getInstalledPluginConfig, getMarketplacePlugin, versionConfig } from '../../api/marketplace';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import type { ConfigEntry, ConfigValue } from '../../types';
import ConfigInput from '../config/ConfigInput';
import FailureNotice from './FailureNotice';
import type { Edit } from '../config/configValue';
import { settingsChanges, settingsEntry, updateValue } from './pluginSettings';
import type { ActionTarget, ServerPluginChoice } from './useMarketplaceActions';
import { findServerCounterpart, type ServerCounterpart } from './serverCounterpart';
import { useExtensions } from '../../context/ExtensionsContext';
import { PLUGINS_INSTALL_PERMISSION } from '../../api/serverMarketplace';

/** The settings of the version an install or update brings, or null when they could not be read. */
async function loadSettings(action: 'install' | 'update', name: string): Promise<ConfigEntry[] | null> {
  const [details, current] = await Promise.allSettled([
    getMarketplacePlugin(name),
    action === 'update' ? getInstalledPluginConfig(name) : Promise.resolve(null),
  ]);
  if (details.status === 'rejected') return null;
  const entries = versionConfig(details.value);
  if (entries.length === 0) return [];
  if (action === 'install') return entries.map(e => settingsEntry(e));
  // Without the current values an update shows no fields: defaults there would misstate what is stored
  if (current.status === 'rejected' || !current.value) return null;
  const values = current.value.values;
  return entries.map(e => settingsEntry(e, updateValue(e, values)));
}

export interface MarketplaceActionDialogProps {
  action: 'install' | 'update';
  target: ActionTarget;
  /** The request is running. */
  busy: boolean;
  /** The server's per-key messages from the last attempt (400 `validation failed`). */
  serverErrors: Record<string, string>;
  /** The last attempt failed for another reason: its title and the server's message. */
  failure?: { title: string; message: string };
  onCancel: () => void;
  /** Runs the action with the changed settings (none: `{}`) and the server plugin to install too, if chosen. */
  onConfirm: (config: Record<string, ConfigValue>, server?: ServerPluginChoice) => void;
}

/**
 * Install and update confirmation: the plugin runs inside the dashboard with your permissions (and its publisher),
 * and the settings the version declares, editable with the Config page's inputs and checked with its validators while
 * typing: Install (Update) stays disabled while any is invalid. Install starts from the plugin's defaults, Update from
 * the current values (a value the new version no longer accepts from its new default). Only changed settings are sent;
 * the server's per-key errors show under their fields and the dialog stays open.
 */
export default function MarketplaceActionDialog({ action, target, busy, serverErrors, failure, onCancel, onConfirm }: MarketplaceActionDialogProps) {
  const { t } = useI18n();
  const kitText = useKitText().t;
  const title = target.title || target.name;
  const hintId = useId();
  const fetcher = useCallback(() => loadSettings(action, target.name), [action, target.name]);
  const { data: entries, loading } = useApi(fetcher, [fetcher]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  // The server's errors stay until their field is edited (counted per answer: a new answer shows all of its own)
  const [editedSince, setEditedSince] = useState<{ errors: Record<string, string>; keys: ReadonlySet<string> }>({ errors: serverErrors, keys: new Set() });
  const edited = editedSince.errors === serverErrors ? editedSince.keys : new Set<string>();

  const fields = useMemo(() => entries ?? [], [entries]);

  // Installing a page whose server plugin is missing: say so, offer it from the marketplace or explain the code way
  const canInstallServer = useExtensions().hasPermission(PLUGINS_INSTALL_PERMISSION);
  const needs = action === 'install' && target.requires && !target.requires.installed ? target.requires.serverPackage : null;
  const counterpartFetcher = useCallback(async (): Promise<ServerCounterpart | null> => {
    if (!needs) return null;
    const details = await getMarketplacePlugin(target.name).catch(() => null);
    return findServerCounterpart(needs, details?.serverPackages ?? [], canInstallServer);
  }, [needs, target.name, canInstallServer]);
  const { data: counterpart, loading: counterpartLoading } = useApi(counterpartFetcher, [counterpartFetcher]);
  const [alsoServer, setAlsoServer] = useState(true);
  const serverChoice: ServerPluginChoice | undefined = counterpart?.kind === 'installable' && alsoServer
    ? { name: counterpart.plugin.name, title: counterpart.plugin.title || counterpart.plugin.name }
    : undefined;
  const { changes, problems } = useMemo(() => settingsChanges(fields, edits), [fields, edits]);
  const invalid = Object.keys(problems).length > 0;
  const fieldError = (key: string) => {
    const problem = problems[key];
    if (problem) return t(problem.key, problem.params);
    return edited.has(key) ? undefined : serverErrors[key];
  };
  // Errors for keys the dialog does not show (a version changed meanwhile)
  const otherErrors = Object.entries(serverErrors).filter(([key]) => !fields.some(f => f.key === key));

  function setEdit(key: string, edit: Edit | undefined) {
    setEdits(prev => {
      const next = { ...prev };
      if (edit) next[key] = edit;
      else delete next[key];
      return next;
    });
    setEditedSince(prev => ({ errors: serverErrors, keys: new Set(prev.errors === serverErrors ? prev.keys : []).add(key) }));
  }

  const confirmLabel = action === 'install' ? t('marketplace.install') : t('marketplace.update');
  const message = action === 'install'
    ? t('marketplace.confirmInstallMessage', { title, publisher: target.publisher || '—' })
    : target.publisher
      ? t('marketplace.confirmUpdateMessage', { publisher: target.publisher })
      : t('marketplace.confirmUpdatePlain');

  return (
    <Modal
      open
      onClose={() => { if (!busy) onCancel(); }}
      closeOnBackdrop={!busy}
      size={fields.length > 0 ? 'lg' : 'sm'}
      title={action === 'install' ? t('marketplace.confirmInstall', { title }) : t('marketplace.confirmUpdate', { title })}
      actions={
        <>
          {invalid && <p id={hintId} className="mr-auto text-xs text-error">{t('marketplace.settingsInvalid')}</p>}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg bg-control hover:bg-control-hover text-text disabled:opacity-50"
          >
            {kitText('confirmCancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(changes, serverChoice)}
            disabled={busy || loading || invalid || (!!needs && counterpartLoading)}
            aria-describedby={invalid ? hintId : undefined}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {failure && !busy && <FailureNotice title={failure.title} message={failure.message} />}
        <p className="text-muted">{message}</p>
        {needs && (
          <div role="note" data-testid="server-plugin-needed" className="rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2 space-y-2 text-xs">
            <p className="text-warning">{t('marketplace.serverPluginNeeded', { title, package: needs })}</p>
            {counterpart?.kind === 'installable' && (
              <label className="flex items-start gap-2 text-text">
                <input type="checkbox" checked={alsoServer} disabled={busy} onChange={e => setAlsoServer(e.target.checked)} className="mt-0.5" />
                <span>{t('marketplace.alsoInstallServer', { title: counterpart.plugin.title || counterpart.plugin.name })}</span>
              </label>
            )}
            {counterpart?.kind === 'code' && (
              <div className="space-y-1">
                <p className="text-muted">{t('marketplace.serverPluginFromCode')}</p>
                <ul className="font-mono text-[11px] text-text break-all">
                  {counterpart.packages.map(p => <li key={`${p.platform}:${p.name}`}>{p.platform ? `${p.platform}: ${p.name}` : p.name}</li>)}
                </ul>
                <p className="text-subtle">{t('marketplace.installPageAnyway')}</p>
              </div>
            )}
          </div>
        )}
        {loading && <Spinner label={t('marketplace.loadingSettings')} />}
        {!loading && entries === null && (
          <p role="note" className="rounded-lg border border-border bg-control/40 px-3 py-2 text-xs text-muted">{t('marketplace.settingsFailed')}</p>
        )}
        {otherErrors.length > 0 && (
          <ErrorState compact title={t('marketplace.settingsRejected', { message: otherErrors.map(([k, m]) => `${k}: ${m}`).join('; ') })} />
        )}
        {fields.length > 0 && (
          <section aria-labelledby={`${hintId}-settings`} className="space-y-2">
            <div>
              <h3 id={`${hintId}-settings`} className="text-xs font-semibold uppercase tracking-wide text-subtle">{t('marketplace.settings')}</h3>
              <p className="text-xs text-subtle">{action === 'install' ? t('marketplace.settingsInstallHint') : t('marketplace.settingsUpdateHint')}</p>
            </div>
            <div className="divide-y divide-border/50 rounded-lg border border-border">
              {fields.map(entry => {
                const id = `${hintId}-${entry.key}`;
                const error = fieldError(entry.key);
                return (
                  <div key={entry.key} data-setting={entry.key} className="px-3 py-2.5 flex flex-col md:flex-row md:items-start gap-2 md:gap-4">
                    <div className="md:w-52 shrink-0 min-w-0">
                      <label htmlFor={id} className="block text-sm text-text break-words">{entry.label}</label>
                      {entry.label !== entry.key && <div className="text-[11px] font-mono text-subtle break-all">{entry.key}</div>}
                      {entry.description && <div className="text-[11px] text-subtle mt-0.5">{entry.description}</div>}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <ConfigInput id={id} entry={entry} edit={edits[entry.key]} onEdit={edit => setEdit(entry.key, edit)}
                        disabled={busy} error={error} />
                      {error && <div role="alert" className="text-xs text-error">{error}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
