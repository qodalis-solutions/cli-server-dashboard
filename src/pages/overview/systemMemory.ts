import type { MessageKey, MessageParams } from '../../i18n';
import type { ServerStatusResponse } from '../../types';

type Translate = (key: MessageKey, params?: MessageParams) => string;
type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string;

/** 512 -> `512 MB`; from 1024 MB in GB with one decimal: 16384 -> `16 GB`, 10035 -> `9.8 GB`. */
export function formatMemorySize(megabytes: number, formatNumber: FormatNumber): string {
  return megabytes < 1024
    ? `${formatNumber(Math.round(megabytes), { maximumFractionDigits: 0 })} MB`
    : `${formatNumber(Math.round((megabytes / 1024) * 10) / 10, { maximumFractionDigits: 1 })} GB`;
}

/**
 * The note under the process memory: the RAM the server can use and how much of it the machine (or the container)
 * uses, e.g. `of 16 GB · machine 61% used` or `container limit 512 MB · 59% used`. Null when the server does not
 * report it (older servers, or a value it could not read).
 */
export function systemMemoryNote(
  status: Pick<ServerStatusResponse, 'systemMemoryTotalMb' | 'systemMemoryUsedMb' | 'memoryLimited'>,
  t: Translate,
  formatNumber: FormatNumber,
): string | null {
  const total = status.systemMemoryTotalMb;
  if (typeof total !== 'number' || !(total > 0)) return null;
  const used = status.systemMemoryUsedMb;
  const params = {
    total: formatMemorySize(total, formatNumber),
    ...(typeof used === 'number' ? { percent: Math.round((used / total) * 100) } : {}),
  };
  if (status.memoryLimited) return t(typeof used === 'number' ? 'overview.memoryContainer' : 'overview.memoryContainerLimit', params);
  return t(typeof used === 'number' ? 'overview.memoryMachine' : 'overview.memoryOfTotal', params);
}
