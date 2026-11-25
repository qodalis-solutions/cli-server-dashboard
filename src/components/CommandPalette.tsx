import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { PaletteEntry } from '@qodalis/cli-server-dashboard-kit';
import { getCommands } from '../api/commands';
import { useExtensions } from '../context/ExtensionsContext';
import { useI18n, type MessageKey } from '../i18n';
import type { CommandDescriptor } from '../types';
import { accountExtensions, extensionPath, extensionTitle, navItemText } from './navItems';
import { useExtensionHost } from '../pages/extension/useExtensionHost';
import { useExtensionModules, type LoadedExtension } from '../pages/extension/useExtensionModules';
import NavIcon from './NavIcon';
import { useVisibleNavItems } from '../hooks/useVisibleNavItems';
import { onOpenCommandPalette } from './commandPaletteEvents';
import { searchPalette, type PaletteItem } from './paletteSearch';
import { THEME_CHOICES, useThemeChoice, type ThemeChoice } from '../theme';

const GROUP_LABELS: Record<Exclude<PaletteItem['group'], 'module'>, MessageKey> = {
  search: 'components.paletteSearchGroup',
  pages: 'components.palettePages',
  commands: 'nav.commands',
  theme: 'common.theme',
};

const THEME_ITEMS: Record<ThemeChoice, { label: MessageKey; icon: string }> = {
  system: { label: 'common.themeDevice', icon: '🖥' },
  light: { label: 'common.themeLight', icon: '☀' },
  dark: { label: 'common.themeDark', icon: '☾' },
};

/** Asks one module for its palette entries (when the palette opens) and reports them up. */
function ModuleEntries({ loaded, onEntries }: { loaded: LoadedExtension; onEntries: (id: string, entries: PaletteEntry[]) => void }) {
  const { context } = useExtensionHost(loaded.extension, '/');
  const palette = loaded.module.palette;
  useEffect(() => {
    if (!palette) return;
    let cancelled = false;
    palette(context).then(
      entries => { if (!cancelled) onEntries(loaded.extension.id, Array.isArray(entries) ? entries : []); },
      () => { if (!cancelled) onEntries(loaded.extension.id, []); },
    );
    return () => { cancelled = true; };
  }, [palette, context, loaded.extension.id, onEntries]);
  return null;
}

/**
 * Ctrl+K / ⌘K: jump to a page, a command or what the plugins' modules list (a job), or search the logs and the
 * modules that search (jobs, audit) for what was typed. Commands and module entries load when it opens.
 */
export default function CommandPalette() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { extensions } = useExtensions();
  const pageItems = useVisibleNavItems();
  const [themeChoice, setThemeChoice] = useThemeChoice();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [moduleEntries, setModuleEntries] = useState<Record<string, PaletteEntry[]>>({});
  const onEntries = useCallback((id: string, entries: PaletteEntry[]) => setModuleEntries(prev => ({ ...prev, [id]: entries })), []);
  const paletteModules = useExtensionModules('palette', open);
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

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    let cancelled = false;
    // Failures leave the group out: the palette still finds pages
    getCommands().then(list => { if (!cancelled) setCommands(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const pages = [
      ...pageItems.map(item => ({ id: `page:${item.path}`, group: 'pages' as const, label: navItemText(item, t), icon: item.icon, to: item.path })),
      // The account menu's pages (not in the sidebar) are pages too
      ...accountExtensions(extensions).map(extension => ({
        id: `page:${extensionPath(extension.id)}`, group: 'pages' as const, label: extensionTitle(extension, locale),
        icon: extension.icon ?? '◆', to: extensionPath(extension.id),
      })),
    ];
    const entryItems = extensions.flatMap(extension =>
      (moduleEntries[extension.id] ?? []).map(entry => ({
        id: `module:${extension.id}:${entry.id}`, group: 'module' as const, section: extensionTitle(extension, locale),
        label: entry.label, hint: entry.hint, icon: entry.icon ?? extension.icon, to: `${extensionPath(extension.id)}${entry.path}`,
      })),
    );
    const commandItems = commands.map(cmd => ({
      id: `command:${cmd.command}`, group: 'commands' as const, label: cmd.command, hint: cmd.description,
      icon: '⌘', to: `/commands?q=${encodeURIComponent(cmd.command)}`,
    }));
    // Switch the color scheme from the keyboard; the theme's name is the hint, so "theme" finds all three
    const themeItems = THEME_CHOICES.map(choice => ({
      id: `theme:${choice}`, group: 'theme' as const, label: t(THEME_ITEMS[choice].label),
      hint: choice === themeChoice ? `✓ ${t('common.theme')}` : t('common.theme'),
      icon: THEME_ITEMS[choice].icon, run: () => setThemeChoice(choice),
    }));
    return [...pages, ...entryItems, ...commandItems, ...themeItems];
  }, [t, locale, extensions, moduleEntries, commands, pageItems, themeChoice, setThemeChoice]);

  const results = useMemo(() => {
    const found = searchPalette(items, query);
    const text = query.trim();
    if (!text) return found;
    // What was typed, as a search on the pages that have one
    const searches: PaletteItem[] = [
      { id: 'search:logs', group: 'search', label: t('components.paletteSearchLogs', { query: text }), icon: '⌕', to: `/logs?q=${encodeURIComponent(text)}` },
      ...extensions
        .filter(e => e.search)
        .map(e => ({
          id: `search:${e.id}`, group: 'search' as const, icon: '⌕',
          label: t('components.paletteSearchIn', { page: extensionTitle(e, locale), query: text }),
          to: `${extensionPath(e.id)}${e.search}${encodeURIComponent(text)}`,
        })),
    ];
    // One heading per group: groups in a fixed order, best match first within each
    const order: PaletteItem['group'][] = ['pages', 'module', 'commands', 'theme', 'search'];
    return [...found, ...searches].map((item, index) => ({ item, index }))
      .sort((a, b) => order.indexOf(a.item.group) - order.indexOf(b.item.group) || a.index - b.index)
      .map(entry => entry.item);
  }, [items, query, t, locale, extensions]);

  const selected = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  if (!open) return null;

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    if (item.run) item.run();
    else if (item.to) navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(results.length - 1, selected + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, selected - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[selected]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-overlay pt-[12vh]" onClick={() => setOpen(false)}>
      {paletteModules.map(loaded => <ModuleEntries key={loaded.extension.id} loaded={loaded} onEntries={onEntries} />)}
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
              {(i === 0 || results[i - 1].group !== item.group || results[i - 1].section !== item.section) && (
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide text-subtle">
                  {item.group === 'module' ? item.section : t(GROUP_LABELS[item.group])}
                </div>
              )}
              <div
                id={`palette-${item.id}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={`mx-1 flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${i === selected ? 'bg-primary/15 text-accent' : 'text-text'}`}
              >
                <NavIcon icon={item.icon ?? ''} className="w-5 text-center text-muted" />
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
