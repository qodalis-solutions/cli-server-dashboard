import { useCallback, useEffect } from 'react';
import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { PLATFORM_LABELS, SERVER_PLUGINS_CHANGED_EVENT, serverErrorDetail, serverPluginErrorKind } from '../../api/serverMarketplace';
import { useOptionalWebSocket } from '../../context/WebSocketContext';
import { useI18n } from '../../i18n';
import { useFailureText } from './marketplaceText';
import type { ServerPlatform, ServerPluginItem } from '../../types';

/** A platform's name (`Node`, `Python`, `.NET`), unknown ones as written. */
export function platformLabel(platform: string | null | undefined): string {
  return platform ? (PLATFORM_LABELS as Record<string, string>)[platform] ?? platform : '';
}

/** The readable reason of a failed server plugin request: a translated message for the known ones, else the server's text. */
export function useServerPluginErrorText(platform?: ServerPlatform | null): (err: unknown) => string {
  const { t } = useI18n();
  const failureText = useFailureText();
  return useCallback((err: unknown) => {
    const detail = serverErrorDetail(err);
    switch (serverPluginErrorKind(err)) {
      case 'unreachable': return t('serverMarketplace.errUnreachable');
      case 'integrity': return t('serverMarketplace.errIntegrity');
      case 'unverified': return t('marketplace.errUnverified');
      case 'forbidden': return t('serverMarketplace.errForbidden');
      case 'incompatible': return t('serverMarketplace.errIncompatible', { reason: detail || errorText(err) });
      case 'setup': return detail ? t('serverMarketplace.errSetup', { reason: detail }) : t('serverMarketplace.errSetupPlain');
      case 'unavailable': {
        const named = /not available for (\w+)/i.exec(errorText(err))?.[1];
        return t('serverMarketplace.errUnavailable', { platform: platformLabel(named ?? platform) || detail });
      }
      case 'clash': return t('serverMarketplace.errClash');
      default: return failureText(err);
    }
  }, [t, platform, failureText]);
}

/** The server's `blockedReason` of a server plugin in the reader's language (unknown reasons as the server wrote them). */
export function useServerBlockedText(): (reason: string, platform: string | null) => string {
  const { t } = useI18n();
  return useCallback((reason: string, platform: string | null) => {
    if (/server plugins disabled/i.test(reason)) return t('serverMarketplace.blockedDisabled');
    if (/install disabled/i.test(reason)) return t('marketplace.blockedOff');
    if (/verified/i.test(reason)) return t('marketplace.blockedUnverified');
    const missing = /not available for (\w+)/i.exec(reason);
    if (missing) return t('serverMarketplace.notAvailable', { platform: platformLabel(platform ?? missing[1]) });
    if (/needs setup in code/i.test(reason)) return t('serverMarketplace.needsSetup');
    if (/needs server|incompatible/i.test(reason)) return t('serverMarketplace.incompatible', { reason });
    return reason;
  }, [t]);
}

/** Calls `refresh` when a server plugin is installed, updated or removed anywhere (outside the events socket: never). */
export function useServerPluginsChanged(refresh: () => void) {
  const subscribe = useOptionalWebSocket()?.subscribe;
  useEffect(() => subscribe?.(SERVER_PLUGINS_CHANGED_EVENT, () => refresh()), [subscribe, refresh]);
}

/** The plugin's own page for setting it up: its homepage or repository, else its page in the marketplace. */
export function setupLink(plugin: ServerPluginItem, marketplaceUrl: string): string | undefined {
  if (plugin.homepage) return plugin.homepage;
  if (plugin.repository) return plugin.repository;
  if (!/^https?:\/\//i.test(marketplaceUrl)) return undefined;
  return `${marketplaceUrl.replace(/\/+$/, '')}/plugins/${plugin.name.split('/').map(encodeURIComponent).join('/')}`;
}
