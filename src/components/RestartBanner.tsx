import { useId, useState } from 'react';
import { useRestart } from '../context/RestartContext';
import { useI18n } from '../i18n';

/**
 * "Restart required" at the top of the layout while changes wait for a restart: the list behind Details, and Restart
 * server for users holding `server:restart` on a server that can restart itself; otherwise the hint to restart it by
 * hand with the reason it cannot be done from here. Dismissed per tab until the list changes.
 */
export default function RestartBanner() {
  const { t, formatRelative } = useI18n();
  const { status, pending, canRestart, requestRestart, dismissed, dismiss } = useRestart();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (pending.length === 0 || dismissed) return null;

  return (
    <div role="region" aria-label={t('restart.banner', { count: pending.length })} className="border-b border-warning/30 bg-warning/10 text-sm">
      <div className="px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span aria-hidden className="text-warning">⟳</span>
        <span className="font-medium text-warning">{t('restart.banner', { count: pending.length })}</span>
        {!canRestart && (
          <span className="text-xs text-muted" data-testid="restart-manual-hint">
            {t('restart.manualHint')} {status?.supported ? t('restart.noPermission') : t('restart.unsupported')}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls={listId}
            className="px-2.5 py-1 rounded-md text-xs text-text hover:bg-warning/15"
          >
            {open ? t('restart.hideDetails') : t('restart.details')}
          </button>
          {canRestart && (
            <button
              type="button"
              onClick={requestRestart}
              className="px-3 py-1 rounded-md text-xs bg-primary hover:bg-primary-hover text-on-primary"
            >
              {t('restart.restartServer')}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('restart.dismiss')}
            title={t('restart.dismiss')}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-warning/15"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      </div>
      {open && (
        <ul id={listId} aria-label={t('restart.pendingList')} className="px-4 sm:px-6 pb-2.5 space-y-1">
          {pending.map(p => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="text-text">{p.description || p.id}</span>
              <span className="font-mono text-[11px] text-subtle">{p.source || p.id}</span>
              {p.since && <span className="text-[11px] text-subtle">{formatRelative(p.since)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
