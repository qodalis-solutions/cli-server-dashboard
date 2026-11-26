import { useSearchParams } from 'react-router';
import { ButtonGroup } from '@qodalis/cli-server-dashboard-kit';
import { useI18n } from '../../i18n';
import type { ServerPlatform } from '../../types';
import { installedFilter, platformFilter, type InstalledFilter, type PlatformFilter } from './pluginPath';
import { platformLabel } from './serverPluginText';

/** Sets (or, for the default, drops) a query parameter of the page, replacing the history entry. */
function useParam(): (name: string, value: string | null) => void {
  const [, setParams] = useSearchParams();
  return (name, value) => setParams(prev => {
    const query = new URLSearchParams(prev);
    if (value === null) query.delete(name);
    else query.set(name, value);
    return query;
  }, { replace: true });
}

/** All / Installed / Not installed, kept in the URL (`&installed=yes|no`). */
export function InstalledFilterChips() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const value = installedFilter(params);
  const set = useParam();
  const items: Array<{ key: InstalledFilter; label: string }> = [
    { key: 'any', label: t('marketplace.filterAll') },
    { key: 'yes', label: t('marketplace.filterInstalled') },
    { key: 'no', label: t('marketplace.filterNotInstalled') },
  ];
  return (
    <ButtonGroup
      label={t('marketplace.filterInstalledLabel')}
      items={items.map(item => ({
        key: item.key,
        label: item.label,
        pressed: value === item.key,
        tone: value === item.key ? 'primary' : 'default',
        onClick: () => set('installed', item.key === 'any' ? null : item.key),
      }))}
    />
  );
}

/** This server (its platform, the default), All platforms, Node, Python, .NET; kept in the URL (`&platform=`). */
export function PlatformFilterChips({ platform }: { platform: ServerPlatform | null }) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const value = platformFilter(params);
  const set = useParam();
  const items: Array<{ key: PlatformFilter; label: string }> = [
    { key: 'this', label: platform ? t('serverMarketplace.filterThisServerPlatform', { platform: platformLabel(platform) }) : t('serverMarketplace.filterThisServer') },
    { key: 'all', label: t('serverMarketplace.filterAllPlatforms') },
    { key: 'node', label: platformLabel('node') },
    { key: 'python', label: platformLabel('python') },
    { key: 'dotnet', label: platformLabel('dotnet') },
  ];
  return (
    <ButtonGroup
      label={t('serverMarketplace.filterPlatformLabel')}
      items={items.map(item => ({
        key: item.key,
        label: item.label,
        pressed: value === item.key,
        tone: value === item.key ? 'primary' : 'default',
        onClick: () => set('platform', item.key === 'this' ? null : item.key),
      }))}
    />
  );
}
