import { useState, type ReactNode } from 'react';
import { EmptyState, ErrorState, SkeletonList, Spinner } from '@qodalis/cli-server-dashboard-kit';
import Badge from '../../components/Badge';
import { useConfirm } from '../../components/useConfirm';
import { useI18n } from '../../i18n';
import { useExtensions } from '../../context/ExtensionsContext';
import type { AsyncResult } from '../../hooks/useApi';
import { checkUpdates, UPDATES_PERMISSION } from '../../api/updates';
import { INSTALL_PERMISSION, updateMarketplacePlugin } from '../../api/marketplace';
import { PLUGINS_INSTALL_PERMISSION, updateServerPlugin } from '../../api/serverMarketplace';
import { serverMessage } from '../../api/auth';
import type { UpdateItem, UpdatesResult } from '../../types';
import ModuleIconView from './ModuleIconView';
import { BADGE_ROW, TITLE_ROW, VERSION_CHIP } from './InstallState';
import { ActionButton } from './MarketplaceTab';
import FailureNotice from './FailureNotice';
import Notice from './Notice';
import RestartNotice from './RestartNotice';
import { useMarketplaceActions } from './useMarketplaceActions';
import { useServerPluginActions } from './useServerPluginActions';
import { platformLabel } from './serverPluginText';
import { useExtensionsChanged } from './marketplaceText';
import { useServerPluginsChanged } from './serverPluginText';

const ACTION = 'px-3 py-1.5 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50';
const ACTION_PRIMARY = `${ACTION} bg-primary text-on-primary hover:bg-primary-hover`;
const ACTION_SECONDARY = `${ACTION} bg-control hover:bg-control-hover text-text`;

/** The updates that can be applied from the dashboard (marketplace installs the policy allows). */
function updatableItems(result: UpdatesResult | null): UpdateItem[] {
  return result ? [...result.dashboardPlugins, ...result.serverPlugins].filter(i => i.canUpdate) : [];
}

function SectionTitle({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-3">
      <div className="flex-1 min-w-[12rem]">
        <h3 className="text-sm font-semibold text-heading">{title}</h3>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A command with Copy (the clipboard, when the browser allows it). */
function CommandLine({ platform, command }: { platform: string; command: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const label = platformLabel(platform) || platform;
  return (
    <div className="flex items-stretch gap-2 min-w-0">
      <span className="w-14 shrink-0 self-center text-[11px] text-subtle">{label}</span>
      <code className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-control text-[11px] font-mono text-text break-all">{command}</code>
      <button
        type="button"
        aria-label={t('updates.copyCommand', { platform: label })}
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }, () => {});
        }}
        className={`${ACTION_SECONDARY} shrink-0`}
      >
        {copied ? t('updates.copied') : t('updates.copy')}
      </button>
    </div>
  );
}

function Versions({ item }: { item: UpdateItem }) {
  const { t } = useI18n();
  return (
    <span className={VERSION_CHIP} data-testid="update-versions">
      {t('updates.versions', { current: item.current ?? t('updates.unknownVersion'), latest: item.latest ?? t('updates.unknownVersion') })}
    </span>
  );
}

function UpdateCard({ item, children }: { item: UpdateItem; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <article aria-label={item.title} data-testid="update-card" className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ModuleIconView icon={item.icon} names={[item.package, item.name]} />
        <div className="flex-1 min-w-0">
          <div className={TITLE_ROW}>
            <span className="font-semibold text-heading text-sm truncate min-w-0">{item.title}</span>
            <Versions item={item} />
          </div>
          <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={item.package}>{item.package}</div>
        </div>
      </div>
      <div className={BADGE_ROW}>
        <Badge variant="neutral">{item.kind === 'dashboard' ? t('updates.kindDashboard') : t('updates.kindServer')}</Badge>
        <Badge variant="warning">{t('updates.updateAvailable')}</Badge>
      </div>
      {children}
    </article>
  );
}

/** The server package: running and newest version, and the commands to update it in code. */
function ServerSection({ server }: { server: UpdateItem }) {
  const { t } = useI18n();
  return (
    <section>
      <SectionTitle title={t('updates.serverTitle')} hint={t('updates.serverHint')} />
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3" data-testid="server-update">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-text">{server.package}</span>
          <span className={VERSION_CHIP}>{t('updates.running', { version: server.current ?? t('updates.unknownVersion') })}</span>
          {server.latest && <span className={VERSION_CHIP}>{t('updates.newest', { version: server.latest })}</span>}
          {server.updateAvailable
            ? <Badge variant="warning">{t('updates.updateAvailable')}</Badge>
            : server.latest ? <Badge variant="success" dot>{t('updates.serverUpToDate')}</Badge> : null}
        </div>
        {!server.latest && <p className="text-xs text-subtle">{t('updates.serverUnknown')}</p>}
        {server.updateAvailable && Object.entries(server.install).map(([platform, command]) => (
          <CommandLine key={platform} platform={platform} command={command} />
        ))}
      </div>
    </section>
  );
}

/**
 * Plugins → Updates: the update checker's last result. Marketplace installs with a newer version (Update, Update all,
 * with the usual confirmation and restart notice), plugins added in code (what to change, the install command per
 * platform), the server version, Check now and when it last checked; "Everything is up to date" when nothing is newer.
 */
export default function UpdatesTab({ updates }: { updates: AsyncResult<UpdatesResult | null> }) {
  const { t, formatRelative, formatDate } = useI18n();
  const { hasPermission, reload } = useExtensions();
  const { confirm, dialog } = useConfirm();
  const dashboardActions = useMarketplaceActions(updates.refresh);
  const serverActions = useServerPluginActions(updates.refresh);
  useExtensionsChanged(updates.refresh);
  useServerPluginsChanged(updates.refresh);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checked, setChecked] = useState<UpdatesResult | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ updated: number; restart: boolean; failures: string[] } | null>(null);

  const canDashboard = hasPermission(INSTALL_PERMISSION);
  const canServer = hasPermission(PLUGINS_INSTALL_PERMISSION);
  const canCheck = hasPermission(UPDATES_PERMISSION) || canServer;
  // The answer of Check now until the next load
  const result = updates.data && checked && (checked.checkedAt ?? '') >= (updates.data.checkedAt ?? '') ? checked : updates.data;
  const canUpdate = (item: UpdateItem) => item.canUpdate && (item.kind === 'dashboard' ? canDashboard : canServer);
  const updatable = updatableItems(result).filter(canUpdate);

  async function checkNow() {
    setChecking(true);
    setCheckError(null);
    try {
      setChecked(await checkUpdates());
      updates.refresh();
    } catch (err) {
      setCheckError(serverMessage(err));
    } finally {
      setChecking(false);
    }
  }

  async function updateAll() {
    const ok = await confirm({
      title: t('updates.confirmUpdateAll', { count: updatable.length }),
      message: (
        <div className="space-y-2">
          <p>{t('updates.confirmUpdateAllMessage')}</p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">
            {updatable.map(i => <li key={`${i.kind}:${i.name}`}><span className="text-text">{i.title}</span> <span className="font-mono text-subtle">{i.current} → {i.latest}</span></li>)}
          </ul>
        </div>
      ),
      confirmLabel: t('updates.updateAll'),
      tone: 'danger',
    });
    if (!ok) return;
    setBulkResult(null);
    const failures: string[] = [];
    let updated = 0;
    let restart = false;
    for (const [index, item] of updatable.entries()) {
      setBulk({ done: index + 1, total: updatable.length });
      try {
        if (item.kind === 'dashboard') {
          await updateMarketplacePlugin(item.name);
        } else {
          const change = await updateServerPlugin(item.name);
          restart ||= change.restartRequired;
        }
        updated++;
      } catch (err) {
        failures.push(t('updates.updateAllFailed', { title: item.title, message: serverMessage(err) }));
      }
    }
    setBulk(null);
    setBulkResult({ updated, restart, failures });
    reload();
    updates.refresh();
  }

  if (updates.loading && !updates.data) return <SkeletonList items={3} label={t('updates.tab')} className="bg-surface border border-border rounded-xl p-4" />;
  if (updates.error && !updates.data) return <ErrorState title={t('updates.loadFailed')} error={updates.error} onRetry={updates.refetch} />;
  if (!result) return <EmptyState className="bg-surface border border-border rounded-xl" message={t('updates.unavailable')} />;

  const marketplace = [...result.dashboardPlugins, ...result.serverPlugins];
  const busy = checking || result.checking;

  return (
    <div className="space-y-8" data-testid="updates-tab">
      {dialog}
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-[12rem] text-xs text-muted" data-testid="last-checked">
          {result.checkedAt
            ? <time dateTime={result.checkedAt} title={formatDate(result.checkedAt)}>{t('updates.lastChecked', { time: formatRelative(result.checkedAt) })}</time>
            : t('updates.neverChecked')}
        </p>
        {canCheck && (
          <button type="button" onClick={() => void checkNow()} disabled={busy} className={ACTION_SECONDARY}>
            {busy && <Spinner />}
            {busy ? t('updates.checking') : t('updates.checkNow')}
          </button>
        )}
      </div>
      {checkError && <FailureNotice title={t('updates.checkFailed', { message: checkError })} message="" />}
      {result.error && <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{t('updates.partial', { message: result.error })}</div>}

      {result.count === 0 && (
        <EmptyState
          className="bg-surface border border-border rounded-xl"
          message={result.checkedAt ? <span className="text-heading"><span aria-hidden className="text-success">✓ </span>{t('updates.upToDate')}</span> : t('updates.notChecked')}
          detail={result.checkedAt ? t('updates.upToDateHint') : t('updates.notCheckedHint')}
        />
      )}

      {marketplace.length > 0 && (
        <section>
          <SectionTitle
            title={t('updates.marketplaceTitle')}
            hint={t('updates.marketplaceHint')}
            actions={updatable.length > 1 ? (
              <button type="button" onClick={() => void updateAll()} disabled={bulk !== null} className={ACTION_PRIMARY}>
                {bulk && <Spinner />}
                {t('updates.updateAll')}
              </button>
            ) : undefined}
          />
          <div className="space-y-3 mb-3">
            {dashboardActions.status}
            {serverActions.status}
            {bulk && (
              <div role="status" className="flex items-center gap-2 text-xs text-muted"><Spinner />{t('updates.updatingAll', { done: bulk.done, total: bulk.total })}</div>
            )}
            {bulkResult && bulkResult.failures.map(f => <FailureNotice key={f} title={f} message="" />)}
            {bulkResult && bulkResult.updated > 0 && (bulkResult.restart
              ? <RestartNotice message={t('updates.didUpdateAll', { count: bulkResult.updated })} onDismiss={() => setBulkResult(null)} />
              : <Notice message={t('updates.didUpdateAll', { count: bulkResult.updated })} onDismiss={() => setBulkResult(null)} />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {marketplace.map(item => {
              const actions = item.kind === 'dashboard' ? dashboardActions : serverActions;
              const working = actions.busy !== null || bulk !== null;
              return (
                <UpdateCard key={`${item.kind}:${item.name}`} item={item}>
                  {!item.canUpdate && item.reason && <p className="text-xs text-warning">{t('updates.blocked', { reason: item.reason })}</p>}
                  {canUpdate(item) && (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        label={t('marketplace.update')}
                        className={ACTION_PRIMARY}
                        busy={actions.busy?.name === item.name}
                        disabled={working}
                        onClick={() => void (item.kind === 'dashboard'
                          ? dashboardActions.run('update', { name: item.name, title: item.title })
                          : serverActions.run('update', { name: item.name, title: item.title, package: item.package, version: item.latest }))}
                      />
                    </div>
                  )}
                </UpdateCard>
              );
            })}
          </div>
        </section>
      )}

      {result.codePlugins.length > 0 && (
        <section>
          <SectionTitle title={t('updates.codeTitle')} hint={t('updates.codeHint')} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {result.codePlugins.map(item => (
              <UpdateCard key={`${item.kind}:${item.name}`} item={item}>
                <div className="space-y-1.5">
                  {Object.entries(item.install).map(([platform, command]) => <CommandLine key={platform} platform={platform} command={command} />)}
                </div>
              </UpdateCard>
            ))}
          </div>
        </section>
      )}

      {result.server && <ServerSection server={result.server} />}
    </div>
  );
}
