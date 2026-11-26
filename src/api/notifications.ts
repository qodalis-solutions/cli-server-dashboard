import { apiFetch, ApiError } from './client';
import type { NotificationItem, NotificationList, NotificationSeverity } from '../types';

const BASE = '/api/v1/qcli/notifications';

/** Sent on the events socket when a notification is added, changed, read, dismissed or resolved. */
export const NOTIFICATION_CHANGED_EVENT = 'notification:changed';
/** Clearing a notification for every user. */
export const NOTIFICATIONS_MANAGE_PERMISSION = 'notifications:manage';
export const NOTIFICATION_SEVERITIES: readonly NotificationSeverity[] = ['info', 'warning', 'error'];

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** One notification of a response or an event; null when malformed. */
export function readNotification(value: unknown): NotificationItem | null {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id || typeof value.title !== 'string') return null;
  const severity = NOTIFICATION_SEVERITIES.includes(value.severity as NotificationSeverity) ? (value.severity as NotificationSeverity) : 'info';
  const link = typeof value.link === 'string' && isSafeLink(value.link) ? value.link : undefined;
  return {
    id: value.id,
    key: text(value.key),
    kind: text(value.kind) || 'system',
    severity,
    title: value.title,
    message: text(value.message),
    ...(link ? { link } : {}),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt) || text(value.createdAt),
    read: value.read === true,
  };
}

/** A dashboard path (`/plugins`) or an http(s) URL; anything else (`javascript:`, `//host`) is dropped. */
export function isSafeLink(link: string): boolean {
  return /^\/(?!\/)/.test(link) || /^https?:\/\//i.test(link);
}

/** True for a link that leaves the dashboard (opened in a new tab). */
export function isExternalLink(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

/** The list and the unread count of a response; malformed items dropped. */
export function readNotificationList(value: unknown): NotificationList {
  const body = isObject(value) ? value : {};
  const items = Array.isArray(body.items) ? body.items.map(readNotification).filter((n): n is NotificationItem => n !== null) : [];
  const count = typeof body.unreadCount === 'number' && body.unreadCount >= 0 ? Math.floor(body.unreadCount) : items.filter(n => !n.read).length;
  return { items, unreadCount: count };
}

/**
 * The user's notifications (`GET /api/v1/qcli/notifications`), newest first; null on a server without them
 * (404/405).
 */
export async function getNotifications(options: { unread?: boolean; severity?: NotificationSeverity | null; limit?: number } = {}): Promise<NotificationList | null> {
  const query = new URLSearchParams();
  if (options.unread) query.set('unread', 'true');
  if (options.severity) query.set('severity', options.severity);
  if (options.limit) query.set('limit', String(options.limit));
  const qs = query.toString();
  try {
    return readNotificationList(await apiFetch<unknown>(qs ? `${BASE}?${qs}` : BASE));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return null;
    throw err;
  }
}

/** Marks one read; resolves with the user's unread count. */
export async function markNotificationRead(id: string): Promise<number | null> {
  const res = await apiFetch<unknown>(`${BASE}/${encodeURIComponent(id)}/read`, { method: 'POST' });
  return isObject(res) && typeof res.unreadCount === 'number' ? res.unreadCount : null;
}

/** Marks every notification read; resolves with the user's unread count (0). */
export async function markAllNotificationsRead(): Promise<number | null> {
  const res = await apiFetch<unknown>(`${BASE}/read-all`, { method: 'POST' });
  return isObject(res) && typeof res.unreadCount === 'number' ? res.unreadCount : null;
}

/** Hides one for this user (`everyone`: removes it for every user, `notifications:manage`). */
export async function dismissNotification(id: string, everyone = false): Promise<number | null> {
  const res = await apiFetch<unknown>(`${BASE}/${encodeURIComponent(id)}${everyone ? '?scope=all' : ''}`, { method: 'DELETE' });
  return isObject(res) && typeof res.unreadCount === 'number' ? res.unreadCount : null;
}

/** The bell's badge: the count, `99+` above 99. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}
