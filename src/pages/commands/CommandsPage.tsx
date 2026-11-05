import { useState } from 'react';
import { useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader';
import { ChartCard, ChartLegend } from '../../components/charts/chartParts';
import { useApi } from '../../hooks/useApi';
import { ApiError } from '../../api/client';
import { getCommandStats, getCommands } from '../../api/commands';
import type { CommandDescriptor, CommandStatsResponse, CommandUsage, ParameterDescriptor } from '../../types';
import { useI18n } from '../../i18n';
import { shortDuration } from '../jobs/jobInsights';

type CommandSort = 'name' | 'executions' | 'failures';

/** Usage since the server started, or null on servers without it (before 1.0.0-beta.19). */
async function loadUsage(): Promise<CommandStatsResponse | null> {
  try {
    const stats = await getCommandStats();
    return Array.isArray(stats?.commands) ? stats : null;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) return null;
    throw err;
  }
}

function ParamRow({ param }: { param: ParameterDescriptor }) {
  const { t } = useI18n();
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="px-3 py-1.5 font-mono text-xs text-accent">{param.name}</td>
      <td className="px-3 py-1.5 text-xs text-muted">{param.type}</td>
      <td className="px-3 py-1.5 text-xs text-muted">{param.description}</td>
      <td className="px-3 py-1.5 text-xs">
        {param.required ? (
          <span className="text-error font-medium">{t('commands.yes')}</span>
        ) : (
          <span className="text-subtle">{t('commands.no')}</span>
        )}
      </td>
    </tr>
  );
}

function CommandRow({ cmd, depth = 0, usage }: { cmd: CommandDescriptor; depth?: number; usage?: Map<string, CommandUsage> }) {
  const { t, formatNumber } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasDetails = (cmd.parameters && cmd.parameters.length > 0) || (cmd.processors && cmd.processors.length > 0);
  const indent = depth * 16;

  return (
    <>
      <tr
        className={`border-b border-border/50 last:border-0 ${hasDetails ? 'cursor-pointer hover:bg-surface' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${indent}px` }}>
            {hasDetails && (
              <span className={`text-subtle transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}>▶</span>
            )}
            <span className="font-mono text-sm text-accent">{cmd.command}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted">{cmd.description || '—'}</td>
        <td className="px-4 py-3 text-xs text-subtle font-mono">
          {cmd.metadata?.module as string ?? '—'}
        </td>
        <td className="px-4 py-3 text-xs text-subtle text-center">
          {formatNumber(cmd.parameters?.length ?? 0)}
        </td>
        {usage && depth === 0 && (() => {
          const used = usage.get(cmd.command.toLowerCase());
          return (
            <>
              <td className="px-4 py-3 text-xs text-right tabular-nums text-text">{used ? formatNumber(used.executions) : '—'}</td>
              <td className={`px-4 py-3 text-xs text-right tabular-nums ${used?.failures ? 'text-error' : 'text-subtle'}`}>{used ? formatNumber(used.failures) : '—'}</td>
            </>
          );
        })()}
        {usage && depth > 0 && <><td /><td /></>}
      </tr>
      {expanded && hasDetails && (
        <tr className="border-b border-border/50">
          <td colSpan={usage ? 6 : 4} className="px-4 py-3 bg-surface/50">
            {cmd.parameters && cmd.parameters.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-subtle uppercase tracking-wider font-medium mb-1.5">{t('commands.parameters')}</div>
                <div className="bg-surface/75 border border-border/75 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/75">
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium">{t('commands.colName')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium">{t('commands.colType')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium">{t('commands.colDescription')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium">{t('commands.colRequired')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmd.parameters.map(p => <ParamRow key={p.name} param={p} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {cmd.processors && cmd.processors.length > 0 && (
              <div>
                <div className="text-[10px] text-subtle uppercase tracking-wider font-medium mb-1.5">{t('commands.subCommands')}</div>
                <div className="bg-surface/75 border border-border/75 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/75">
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium">{t('commands.colCommand')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium">{t('commands.colDescription')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium">{t('commands.colModule')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium text-center">{t('commands.colParams')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmd.processors.map(sub => (
                        <CommandRow key={sub.command} cmd={sub} depth={1} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function CommandsPage() {
  const { data, loading, error, refetch } = useApi(getCommands, []);
  const { data: stats, refetch: refetchStats } = useApi(loadUsage, []);
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const sort = (['executions', 'failures'] as const).find(s => s === params.get('sort')) ?? 'name';
  const { t, formatNumber, formatDate, formatRelative } = useI18n();

  const setParam = (name: string, value: string | null) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value) next.set(name, value);
    else next.delete(name);
    return next;
  }, { replace: true });

  const usage = stats ? new Map(stats.commands.map(c => [c.command.toLowerCase(), c])) : undefined;
  const used = (cmd: CommandDescriptor, field: 'executions' | 'failures') => usage?.get(cmd.command.toLowerCase())?.[field] ?? 0;

  const filtered = (data
    ? data.filter(cmd =>
        cmd.command.toLowerCase().includes(search.toLowerCase()) ||
        (cmd.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : []).sort((a, b) => sort === 'name' || !usage
      ? a.command.localeCompare(b.command)
      : used(b, sort as Exclude<CommandSort, 'name'>) - used(a, sort as Exclude<CommandSort, 'name'>) || a.command.localeCompare(b.command));

  const top = stats ? stats.commands.filter(c => c.executions > 0).slice(0, 8) : [];
  const totalRuns = stats ? stats.commands.reduce((sum, c) => sum + c.executions, 0) : 0;
  const totalFailures = stats ? stats.commands.reduce((sum, c) => sum + c.failures, 0) : 0;

  return (
    <div>
      <PageHeader
        title={t('nav.commands')}
        subtitle={data ? t('commands.subtitle', { count: data.length }) : t('common.loading')}
        actions={
          <button
            onClick={() => { refetch(); refetchStats(); }}
            className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
          >
            {t('common.refresh')}
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {stats && (
          <ChartCard
            title={t('commands.usage')}
            note={t('commands.usageSince', { time: formatDate(stats.since) })}
            legend={<ChartLegend items={[
              { label: t('commands.succeeded'), color: 'var(--qcli-primary)', value: formatNumber(totalRuns - totalFailures) },
              { label: t('commands.failed'), color: 'var(--qcli-error)', value: formatNumber(totalFailures) },
            ]} />}
          >
            {top.length === 0 ? (
              <div className="text-sm text-subtle">{t('commands.noUsage')}</div>
            ) : (
              <ul className="space-y-2">
                {top.map(c => (
                  <li key={c.command}>
                    <button
                      onClick={() => setParam('q', c.command)}
                      className="w-full grid grid-cols-[minmax(80px,160px)_1fr_auto] items-center gap-3 text-xs group"
                      title={`${c.command}: ${formatNumber(c.executions)} · ${t('commands.failed')} ${formatNumber(c.failures)} · ${shortDuration(c.avgDuration)}${c.lastExecutedAt ? ` · ${formatRelative(c.lastExecutedAt)}` : ''}`}
                    >
                      <span className="font-mono text-left truncate text-accent group-hover:underline">{c.command}</span>
                      <span className="flex h-3 gap-[2px]" aria-hidden>
                        <span className="h-full rounded-l-sm bg-primary" style={{ width: `${((c.executions - c.failures) / top[0].executions) * 100}%` }} />
                        {c.failures > 0 && <span className="h-full rounded-r-sm bg-error" style={{ width: `${(c.failures / top[0].executions) * 100}%` }} />}
                      </span>
                      <span className="tabular-nums text-muted text-right w-24">
                        {formatNumber(c.executions)}{c.failures > 0 && <span className="text-error"> · {formatNumber(c.failures)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder={t('commands.searchPlaceholder')}
            aria-label={t('commands.searchPlaceholder')}
            value={search}
            onChange={e => setParam('q', e.target.value || null)}
            className="w-full max-w-sm px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50"
          />
          {usage && (
            <select
              aria-label={t('commands.sort')}
              value={sort}
              onChange={e => setParam('sort', e.target.value === 'name' ? null : e.target.value)}
              className="px-3 py-2 text-sm bg-control border border-border rounded-lg text-text"
            >
              <option value="name">{t('commands.sortName')}</option>
              <option value="executions">{t('commands.sortExecutions')}</option>
              <option value="failures">{t('commands.sortFailures')}</option>
            </select>
          )}
        </div>

        {loading && <div className="text-muted text-sm">{t('commands.loadingCommands')}</div>}
        {error && <div className="text-error text-sm">{t('commands.error', { message: error })}</div>}

        {!loading && !error && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/75">
                  <th className="px-4 py-3 text-left text-xs text-subtle font-medium uppercase tracking-wide">{t('commands.colCommand')}</th>
                  <th className="px-4 py-3 text-left text-xs text-subtle font-medium uppercase tracking-wide">{t('commands.colDescription')}</th>
                  <th className="px-4 py-3 text-left text-xs text-subtle font-medium uppercase tracking-wide">{t('commands.colModule')}</th>
                  <th className="px-4 py-3 text-center text-xs text-subtle font-medium uppercase tracking-wide">{t('commands.colParams')}</th>
                  {usage && (
                    <>
                      <th className="px-4 py-3 text-right text-xs text-subtle font-medium uppercase tracking-wide">{t('commands.colRuns')}</th>
                      <th className="px-4 py-3 text-right text-xs text-subtle font-medium uppercase tracking-wide">{t('commands.failed')}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(cmd => (
                  <CommandRow key={cmd.command} cmd={cmd} usage={usage} />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-subtle text-sm">
                {search ? t('commands.noMatch') : t('commands.noCommands')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
