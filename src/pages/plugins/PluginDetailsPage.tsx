import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import {
  ChipList, DataTable, EmptyState, ErrorState, SkeletonPage, SkeletonTable, SkeletonText,
} from '@qodalis/cli-server-dashboard-kit';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { useApi } from '../../hooks/useApi';
import { getInstalledPlugins, getPlugins, togglePlugin } from '../../api/plugins';
import { getCommands } from '../../api/commands';
import { getConfig } from '../../api/config';
import { serverMessage } from '../../api/auth';
import { useExtensions } from '../../context/ExtensionsContext';
import { extensionTitle } from '../../components/navItems';
import type { CommandDescriptor, ConfigProvider, InstalledPluginDto, PluginInfo } from '../../types';
import { useI18n } from '../../i18n';
import ModuleIconView from './ModuleIconView';
import PluginToggle from './PluginToggle';
import { pluginPath } from './pluginPath';
import {
  commandPermissions, moduleCommands, packagePluginKey, pluginKey, providedModules, providingPackage,
} from './pluginMatch';

/** The modules and the installed packages (null on servers that do not list them, or when that list failed). */
async function loadPlugins(): Promise<{ modules: PluginInfo[]; packages: InstalledPluginDto[] | null }> {
  const [modules, packages] = await Promise.all([getPlugins(), getInstalledPlugins().catch(() => null)]);
  return { modules: Array.isArray(modules) ? modules : [], packages };
}

/** The config providers, or none when the user may not read them or the server has none. */
async function loadConfig(): Promise<ConfigProvider[]> {
  try {
    return await getConfig();
  } catch {
    return [];
  }
}

/** The text of a link to the Commands page filtered to one command. */
const commandsLink = (command: string) => `/commands?q=${encodeURIComponent(command)}`;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-heading">{title}</h3>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Breadcrumb({ current }: { current: string }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('plugins.breadcrumb')} className="text-xs text-subtle">
      <ol className="flex items-center gap-1.5 min-w-0">
        <li>
          <Link to="/plugins" className="text-accent hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            {t('nav.plugins')}
          </Link>
        </li>
        <li aria-hidden>/</li>
        <li aria-current="page" className="truncate text-muted">{current}</li>
      </ol>
    </nav>
  );
}

/** Sub-commands or permissions in a cell: three, the others behind +N more in a dialog titled `title`. */
function Chips({ items, title, label }: { items: string[]; title: string; label: string }) {
  return (
    <ChipList
      items={items}
      max={3}
      title={title}
      label={label}
      chipClassName="font-mono text-[11px] text-muted bg-control border border-border/75 px-1.5 py-0.5 rounded"
    />
  );
}

/** The card at the top: icon, name, version, author or package id, description, state and the switch. */
function HeaderCard({ icon, names, name, version, byline, description, status, action }: {
  icon?: string | null;
  names: string[];
  name: string;
  version?: string | null;
  byline?: ReactNode;
  description?: string | null;
  status?: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="bg-surface border border-border rounded-xl p-4 sm:p-5 flex items-start gap-4">
      <ModuleIconView icon={icon} names={names} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold text-heading text-base truncate">{name}</h2>
          {version && <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">v{version}</span>}
          {status}
        </div>
        {byline && <div className="text-xs text-subtle mt-0.5">{byline}</div>}
        <p className="text-sm text-muted mt-2">{description || t('plugins.noDescription')}</p>
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  );
}

function CommandsTable({ commands }: { commands: CommandDescriptor[] }) {
  const { t } = useI18n();
  const permissions = new Map(commands.map(c => [c.command, commandPermissions(c)]));
  const anyPermissions = [...permissions.values()].some(p => p.length > 0);
  return (
    <DataTable<CommandDescriptor>
      keyExtractor={c => c.command}
      data={commands}
      defaultSort={{ key: 'command', direction: 'asc' }}
      columns={[
        {
          key: 'command',
          header: t('commands.colCommand'),
          sortValue: c => c.command,
          render: c => (
            <Link
              to={commandsLink(c.command)}
              title={t('plugins.openInCommands', { command: c.command })}
              className="font-mono text-sm text-accent hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {c.icon && <span aria-hidden className="mr-1.5">{c.icon}</span>}
              {c.command}
            </Link>
          ),
        },
        { key: 'description', header: t('commands.colDescription'), render: c => <span className="text-muted">{c.description || '—'}</span> },
        { key: 'sub', header: t('commands.subCommands'), render: c => (
          <Chips items={(c.processors ?? []).map(s => s.command)} label={t('commands.subCommands')} title={t('commands.subCommandsOf', { command: c.command })} />
        ) },
        ...(anyPermissions
          ? [{ key: 'permissions', header: t('plugins.colPermissions'), render: (c: CommandDescriptor) => (
            <Chips items={permissions.get(c.command) ?? []} label={t('plugins.colPermissions')} title={t('commands.permissionsOf', { command: c.command })} />
          ) }]
          : []),
      ]}
    />
  );
}

function PagesList({ pages }: { pages: DashboardExtensionInfo[] }) {
  const { t, locale } = useI18n();
  return (
    <Section title={t('plugins.pagesTitle')} hint={t('plugins.pagesHint')}>
      <ul className="flex flex-wrap gap-2">
        {pages.map(page => (
          <li key={page.id}>
            <Link
              to={`/x/${page.id}`}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {page.icon && <span aria-hidden>{page.icon}</span>}
              {extensionTitle(page, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ConfigLinks({ providers }: { providers: ConfigProvider[] }) {
  const { t } = useI18n();
  return (
    <Section title={t('plugins.configTitle')} hint={t('plugins.configHint')}>
      <ul className="flex flex-wrap gap-2">
        {providers.map(provider => (
          <li key={provider.id}>
            <Link
              to={`/config?provider=${encodeURIComponent(provider.id)}`}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {provider.title || provider.id}
              <span className="text-xs text-subtle">{t('plugins.configSections', { count: provider.sections.length })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** A small card linking to another details page (the package of a module, the modules of a package). */
function PluginLinkCard({ id, icon, name, version, detail, status }: {
  id: string; icon?: string | null; name: string; version?: string | null; detail?: string; status?: ReactNode;
}) {
  return (
    <Link
      to={pluginPath(id)}
      className="flex items-start gap-3 bg-surface border border-border rounded-xl p-3 hover:border-primary/50 hover:bg-control/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <ModuleIconView icon={icon} names={[id, name]} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-heading text-sm truncate">{name}</span>
          {version && <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">v{version}</span>}
          {status}
        </div>
        {detail && <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={detail}>{detail}</div>}
      </div>
    </Link>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  return <Badge variant={enabled ? 'success' : 'neutral'} dot>{enabled ? t('common.enabled') : t('common.disabled')}</Badge>;
}

/**
 * One plugin: a command module (`GET /api/v1/qcli/plugins`) with its commands, dashboard pages, configuration and
 * the package that provides it, or an installed package (`/plugins/installed`) with the modules it provides.
 */
export default function PluginDetailsPage() {
  const id = useParams().id ?? '';
  const { t } = useI18n();
  const plugins = useApi(loadPlugins, []);
  const commands = useApi(getCommands, []);
  const config = useApi(loadConfig, []);
  const { extensions } = useExtensions();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const module = plugins.data?.modules.find(m => m.id === id);
  const pkg = module ? undefined : plugins.data?.packages?.find(p => p.id === id);
  // The words a page or a config provider of this plugin is named with: the module's id, or the package's plugin
  const key = module ? pluginKey(module.id) : pkg ? packagePluginKey(pkg.id) : null;
  const pages = key ? extensions.filter(e => pluginKey(e.id) === key) : [];
  const providers = key ? (config.data ?? []).filter(p => pluginKey(p.id) === key) : [];

  function refetch() {
    plugins.refetch();
    commands.refetch();
    config.refetch();
  }

  async function handleToggle(target: PluginInfo) {
    setToggleError(null);
    try {
      await togglePlugin(target.id);
    } catch (err) {
      setToggleError(t('plugins.toggleFailed', { name: target.name || target.id, message: serverMessage(err) }));
    }
    plugins.refresh();
  }

  if (plugins.loading && !plugins.data) return <SkeletonPage label={t('plugins.loadingDetails')} />;

  const title = module ? module.name || module.id : pkg ? pkg.name || pkg.id : id;
  const header = (
    <PageHeader
      title={t('nav.plugins')}
      subtitle={module ? t('plugins.moduleKind') : pkg ? t('plugins.packageKind') : undefined}
      actions={
        <button
          onClick={refetch}
          className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
        >
          {t('common.refresh')}
        </button>
      }
    />
  );

  if (plugins.error) {
    return (
      <div>
        {header}
        <div className="p-4 sm:p-6 space-y-4">
          <Breadcrumb current={id} />
          <ErrorState error={plugins.error} onRetry={plugins.refetch} />
        </div>
      </div>
    );
  }

  if (!module && !pkg) {
    return (
      <div>
        {header}
        <div className="p-4 sm:p-6 space-y-4">
          <Breadcrumb current={id} />
          <EmptyState
            className="bg-surface border border-border rounded-xl"
            message={t('plugins.notFound')}
            detail={t('plugins.notFoundDetail', { id })}
            action={<Link to="/plugins" className="text-sm text-accent hover:underline">{t('plugins.backToPlugins')}</Link>}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="p-4 sm:p-6 space-y-8">
        <div className="space-y-3">
          <Breadcrumb current={title} />
          {module ? (
            <HeaderCard
              icon={module.icon}
              names={[module.id, module.name]}
              name={title}
              version={module.version}
              byline={module.author ? t('plugins.byAuthor', { author: module.author }) : undefined}
              description={module.description}
              status={<EnabledBadge enabled={module.enabled} />}
              action={<PluginToggle enabled={module.enabled} onToggle={() => handleToggle(module)} />}
            />
          ) : pkg && (
            <HeaderCard
              icon={pkg.icon}
              names={[pkg.id, pkg.name]}
              name={title}
              version={pkg.version}
              byline={<span className="font-mono">{pkg.id}</span>}
              description={pkg.description}
            />
          )}
          {toggleError && <ErrorState error={toggleError} title={t('plugins.manager')} compact />}
        </div>

        {module && (
          <Section title={t('plugins.commandsTitle')} hint={t('plugins.commandsHint')}>
            {commands.loading && !commands.data && <SkeletonTable rows={3} columns={3} label={t('commands.loadingCommands')} />}
            {commands.error && <ErrorState error={commands.error} onRetry={commands.refetch} compact />}
            {commands.data && !commands.error && (() => {
              const own = moduleCommands(commands.data, module);
              return own.length > 0
                ? <CommandsTable commands={own} />
                : <EmptyState className="bg-surface border border-border rounded-xl" message={t('plugins.noModuleCommands')} />;
            })()}
          </Section>
        )}

        {pkg && plugins.data && (() => {
          const provided = providedModules(plugins.data.modules, pkg.id);
          return provided.length > 0 && (
            <Section title={t('plugins.commandModules')} hint={t('plugins.providedModulesHint')}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {provided.map(m => (
                  <PluginLinkCard key={m.id} id={m.id} icon={m.icon} name={m.name || m.id} version={m.version}
                    detail={t('plugins.processorCount', { count: m.processorCount ?? m.processors?.length ?? 0 })}
                    status={<EnabledBadge enabled={m.enabled} />} />
                ))}
              </div>
            </Section>
          );
        })()}

        {pages.length > 0 && <PagesList pages={pages} />}

        {config.loading && !config.data && <SkeletonText lines={2} label={t('plugins.loadingDetails')} />}
        {providers.length > 0 && <ConfigLinks providers={providers} />}

        {module && (() => {
          const provider = providingPackage(plugins.data?.packages, module.id);
          return provider && (
            <Section title={t('plugins.packageTitle')} hint={t('plugins.packageHint')}>
              <div className="max-w-md">
                <PluginLinkCard id={provider.id} icon={provider.icon} name={provider.name || provider.id}
                  version={provider.version} detail={provider.id} />
              </div>
            </Section>
          );
        })()}
      </div>
    </div>
  );
}
