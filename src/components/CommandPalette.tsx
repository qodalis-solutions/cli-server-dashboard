import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFeatures } from '../context/FeaturesContext';
import { getJobs } from '../api/jobs';
import { getCommands } from '../api/commands';
import { useI18n, type MessageKey } from '../i18n';
import type { CommandDescriptor, JobDto } from '../types';
import { navItems } from './navItems';
import { onOpenCommandPalette } from './commandPaletteEvents';
import { searchPalette, type PaletteItem } from './paletteSearch';

const GROUP_LABELS: Record<PaletteItem['group'], MessageKey> = {
  search: 'components.paletteSearchGroup',
  pages: 'components.palettePages',
  jobs: 'nav.jobs',
  commands: 'nav.commands',
};

/**
 * Ctrl+K / ⌘K: jump to a page, a job or a command, or search the jobs, logs or audit log for what was typed.
 * Jobs and commands load when it opens.
 */
export default function CommandPalette() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { hasFeature, loading: featuresLoading } = useFeatures();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [commands, setCommands] = useState<CommandDescriptor[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const show = () => {
    setQuery('');
    setActive(0);
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(wasOpen => {
          if (!wasOpen) { setQuery(''); setActive(0); }
          return !wasOpen;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    const off = onOpenCommandPalette(show);
    return () => { window.removeEventListener('keydown', onKey); off(); };
  }, []);

  const jobsEnabled = !featuresLoading && hasFeature('jobs');
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    let cancelled = false;
    // Failures leave the group out: the palette still finds pages
    getCommands().then(list => { if (!cancelled) setCommands(list); }).catch(() => {});
    if (jobsEnabled) getJobs().then(list => { if (!cancelled) setJobs(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, jobsEnabled]);

  const items = useMemo<PaletteItem[]>(() => {
    const pages = navItems
      .filter(item => !item.feature || (!featuresLoading && hasFeature(item.feature)))
      .map(item => ({ id: `page:${item.path}`, group: 'pages' as const, label: t(item.label), icon: item.icon, to: item.path }));
    const jobItems = jobs.map(job => ({
      id: `job:${job.id}`, group: 'jobs' as const, label: job.name, hint: [job.group, job.id].filter(Boolean).join(' · '),
      icon: '⏱', to: `/jobs/${encodeURIComponent(job.id)}`,
    }));
    const commandItems = commands.map(cmd => ({
      id: `command:${cmd.command}`, group: 'commands' as const, label: cmd.command, hint: cmd.description,
      icon: '⌘', to: `/commands?q=${encodeURIComponent(cmd.command)}`,
    }));
    return [...pages, ...jobItems, ...commandItems];
  }, [t, jobs, commands, featuresLoading, hasFeature]);

  const results = useMemo(() => {
    const found = searchPalette(items, query);
    const text = query.trim();
    if (!text) return found;
    // What was typed, as a search on the pages that have one
    const searches: PaletteItem[] = [
      ...(jobsEnabled ? [{ id: 'search:jobs', group: 'search' as const, label: t('components.paletteSearchJobs', { query: text }), icon: '⌕', to: `/jobs?q=${encodeURIComponent(text)}` }] : []),
      { id: 'search:logs', group: 'search', label: t('components.paletteSearchLogs', { query: text }), icon: '⌕', to: `/logs?q=${encodeURIComponent(text)}` },
      ...(!featuresLoading && hasFeature('audit') ? [{ id: 'search:audit', group: 'search' as const, label: t('components.paletteSearchAudit', { query: text }), icon: '⌕', to: `/audit?q=${encodeURIComponent(text)}` }] : []),
    ];
    // One heading per group: groups in a fixed order, best match first within each
    const order: PaletteItem['group'][] = ['pages', 'jobs', 'commands', 'search'];
    return [...found, ...searches].map((item, index) => ({ item, index }))
      .sort((a, b) => order.indexOf(a.item.group) - order.indexOf(b.item.group) || a.index - b.index)
      .map(entry => entry.item);
  }, [items, query, t, jobsEnabled, featuresLoading, hasFeature]);

  const selected = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  if (!open) return null;

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(results.length - 1, selected + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, selected - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[selected]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-overlay pt-[12vh]" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('components.paletteTitle')}
        className="bg-popover border border-border rounded-xl w-full max-w-xl mx-4 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-results"
          aria-activedescendant={results[selected] ? `palette-${results[selected].id}` : undefined}
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder={t('components.palettePlaceholder')}
          className="w-full px-4 py-3 bg-transparent border-b border-border/75 text-sm text-text placeholder-subtle focus:outline-none"
        />
        <ul id="command-palette-results" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-subtle">{t('components.paletteEmpty')}</li>}
          {results.map((item, i) => (
            <li key={item.id}>
              {(i === 0 || results[i - 1].group !== item.group) && (
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide text-subtle">{t(GROUP_LABELS[item.group])}</div>
              )}
              <div
                id={`palette-${item.id}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={`mx-1 flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${i === selected ? 'bg-primary/15 text-accent' : 'text-text'}`}
              >
                <span className="w-5 text-center text-muted" aria-hidden>{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {item.hint && <span className="ml-auto truncate text-xs text-subtle max-w-[50%]">{item.hint}</span>}
              </div>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-border/75 text-[11px] text-subtle flex gap-4">
          <span>↑↓ {t('components.paletteMove')}</span>
          <span>↵ {t('components.paletteOpenItem')}</span>
          <span>Esc {t('components.paletteClose')}</span>
        </div>
      </div>
    </div>
  );
}
