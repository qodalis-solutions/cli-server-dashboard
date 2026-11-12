import type { ApiTokenView } from '../../api/tokens';

/** Server linking (`server add` in the web CLI) names the tokens it creates `link <client>`. */
const LINK_PREFIX = /^link\s+/i;

/** Whether the token was created by linking a terminal. */
export function isLinkedTerminal(token: Pick<ApiTokenView, 'name'>): boolean {
  return LINK_PREFIX.test(token.name);
}

/** The terminal a linked token belongs to (its name without `link `), or the name itself. */
export function linkedClient(token: Pick<ApiTokenView, 'name'>): string {
  return token.name.replace(LINK_PREFIX, '').trim() || token.name;
}

/** A token expiring within this many milliseconds is flagged. */
export const EXPIRING_SOON = 7 * 24 * 3_600_000;

export type TokenState = 'active' | 'expiring' | 'expired';

export function tokenState(token: Pick<ApiTokenView, 'expiresAt'>, now: number): TokenState {
  if (token.expiresAt === null || token.expiresAt === undefined) return 'active';
  if (token.expiresAt <= now) return 'expired';
  return token.expiresAt - now <= EXPIRING_SOON ? 'expiring' : 'active';
}

/** The error text of a failed request (the server's `{ error }` body, or the text itself). */
export function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // not JSON
  }
  return text;
}

/** Token names the server accepts. */
export const TOKEN_NAME = /^[A-Za-z0-9._ -]{1,64}$/;
export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 365;
export const DEFAULT_EXPIRY_DAYS = 90;

/** Permissions typed as a list (commas, spaces or new lines); undefined when none (all of the owner's). */
export function parsePermissions(text: string): string[] | undefined {
  const list = [...new Set(text.split(/[\s,]+/).map(p => p.trim()).filter(Boolean))];
  return list.length ? list : undefined;
}

/** Whether a typed expiry is a whole number of days the server accepts. */
export function isValidExpiry(text: string): boolean {
  if (!/^\d+$/.test(text.trim())) return false;
  const days = Number(text);
  return days >= MIN_EXPIRY_DAYS && days <= MAX_EXPIRY_DAYS;
}
