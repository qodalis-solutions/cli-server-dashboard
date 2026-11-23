/** 1536 -> `1.5 KB` (binary units, as servers and databases report sizes), with the reader's number format. */
export function formatBytes(
    bytes: number,
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string = (v, o) => new Intl.NumberFormat(undefined, o).format(v),
): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${formatNumber(value, { maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1 })} ${units[unit]}`;
}

/** A duration in short form: `850ms`, `4.2s`, `12s`, `3m 5s`, `2h 14m`; `—` when unknown. */
export function shortDuration(ms: number | null | undefined): string {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}
