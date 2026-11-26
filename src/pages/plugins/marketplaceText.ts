import { useCallback, useEffect } from 'react';
import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { EXTENSIONS_CHANGED_EVENT, marketplaceErrorKind, type MarketplaceErrorKind } from '../../api/marketplace';
import { ApiError } from '../../api/client';
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

/** Reason phrases of the statuses a proxy or a server answers without a body (HTTP/2 sends no status text). */
const REASON_PHRASES: Record<number, string> = {
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * A failed request whose answer says nothing readable: no body, an HTML error page (a proxy's), or JSON without a
 * message. Its status and status text (the standard phrase when the server sent none); null for any other failure.
 */
export function bareFailure(err: unknown): { status: number; statusText: string } | null {
  if (!(err instanceof ApiError) || err.status < 400) return null;
  const body = err.body.trim();
  const readable = body !== '' && !body.startsWith('<') && errorText(body).trim() !== '' && !(body.startsWith('{') && errorText(body) === body);
  if (readable) return null;
  return { status: err.status, statusText: err.statusText.trim() || REASON_PHRASES[err.status] || '' };
}

/** "The server answered 500 Internal Server Error" for a failure without a readable answer, else the server's message. */
export function useFailureText(): (err: unknown) => string {
  const { t } = useI18n();
  return useCallback((err: unknown) => {
    const bare = bareFailure(err);
    if (!bare) return errorText(err);
    return `${t('marketplace.errStatus', { status: String(bare.status) })}${bare.statusText ? ` ${bare.statusText}` : ''}`;
  }, [t]);
}

/** The readable reason of a marketplace failure: a translated message for the known ones, else the server's text. */
export function useMarketplaceErrorText(): (err: unknown) => string {
  const { t } = useI18n();
  const failureText = useFailureText();
  return useCallback((err: unknown) => {
    const kind = marketplaceErrorKind(err);
    return kind === 'other' ? failureText(err) : t(ERROR_MESSAGES[kind]);
  }, [t, failureText]);
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
