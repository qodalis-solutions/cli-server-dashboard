import { useCallback, useEffect } from 'react';
import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { EXTENSIONS_CHANGED_EVENT, marketplaceErrorKind, type MarketplaceErrorKind } from '../../api/marketplace';
import { useOptionalWebSocket } from '../../context/WebSocketContext';
import { useI18n, type MessageKey } from '../../i18n';

/** Milliseconds the marketplace search waits after the last key before it asks the server. */
export const SEARCH_DELAY = 250;

/** Characters of a readme shown in the details dialog. */
export const README_EXCERPT = 1200;

/** The start of a readme, cut at a line end when one is near. */
export function readmeExcerpt(readme: string, max = README_EXCERPT): string {
  const text = readme.trim();
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n', max);
  return `${text.slice(0, cut > max / 2 ? cut : max).trimEnd()}\n…`;
}

const ERROR_MESSAGES: Record<Exclude<MarketplaceErrorKind, 'other'>, MessageKey> = {
  unreachable: 'marketplace.errUnreachable',
  unverified: 'marketplace.errUnverified',
  integrity: 'marketplace.errIntegrity',
  clash: 'marketplace.errClash',
  forbidden: 'marketplace.errForbidden',
};

/** The readable reason of a marketplace failure: a translated message for the known ones, else the server's text. */
export function useMarketplaceErrorText(): (err: unknown) => string {
  const { t } = useI18n();
  return useCallback((err: unknown) => {
    const kind = marketplaceErrorKind(err);
    return kind === 'other' ? errorText(err) : t(ERROR_MESSAGES[kind]);
  }, [t]);
}

/** The server's `blockedReason` in the reader's language (unknown reasons as the server wrote them). */
export function useBlockedText(): (reason: string) => string {
  const { t } = useI18n();
  return useCallback((reason: string) => {
    const api = /dashboard api (\d+)/i.exec(reason);
    if (api) return t('marketplace.blockedApi', { version: api[1] });
    if (/verified/i.test(reason)) return t('marketplace.blockedUnverified');
    if (/disabled|\boff\b/i.test(reason)) return t('marketplace.blockedOff');
    return reason;
  }, [t]);
}

/** Calls `refresh` when a dashboard plugin is installed, updated or removed anywhere (outside the events socket: never). */
export function useExtensionsChanged(refresh: () => void) {
  const subscribe = useOptionalWebSocket()?.subscribe;
  useEffect(() => subscribe?.(EXTENSIONS_CHANGED_EVENT, () => refresh()), [subscribe, refresh]);
}
