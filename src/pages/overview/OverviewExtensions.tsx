import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AttentionItem, DashboardExtensionInfo, DashboardOverview, OverviewCard } from '@qodalis/cli-server-dashboard-kit';
import ErrorBoundary from '../../components/ErrorBoundary';
import { extensionTitle } from '../../components/navItems';
import { useI18n } from '../../i18n';
import { useExtensionModules } from '../extension/useExtensionModules';
import { useExtensionHost } from '../extension/useExtensionHost';

/** How often the Overview asks the modules for their "Needs attention" items again. */
export const ATTENTION_INTERVAL = 60_000;

/** A module that fills the Overview, once loaded. */
export interface OverviewModule {
  extension: DashboardExtensionInfo;
  overview: DashboardOverview;
}

/** An attention item with the module it came from. */
export interface ModuleAttentionItem extends AttentionItem {
  extension: DashboardExtensionInfo;
}

/** The modules registered with `widgets: ["overview"]`, once loaded. */
export function useOverviewModules(): OverviewModule[] {
  const loaded = useExtensionModules('overview');
  return useMemo(() => loaded.map(({ extension, module }) => ({ extension, overview: module.overview ?? {} })), [loaded]);
}

/** The cards of the given size, with their module, in the modules' order. */
export function cardsOf(modules: readonly OverviewModule[], size: OverviewCard['size']) {
  return modules.flatMap(m => (m.overview.cards ?? []).filter(c => c.size === size).map(card => ({ module: m, card })));
}

/** One module card: its own element, mounted with the module's context (navigate opens the module's page). */
export function ExtensionCard({ module, card }: { module: OverviewModule; card: OverviewCard }) {
  const { locale } = useI18n();
  const { context, overlays } = useExtensionHost(module.extension, '/');
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = element.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: void | (() => void);
    const target = document.createElement('div');
    // A stat card's StatCard is an item of the row itself (wrapper and target are `contents`), sized as the core's own
    target.className = card.size === 'stat' ? 'contents' : 'h-full';
    host.appendChild(target);
    (async () => {
      try {
        cleanup = await card.mount(target, context);
        if (cancelled) cleanup?.();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      try {
        cleanup?.();
      } catch {
        // a failing cleanup must not keep the Overview from leaving
      }
      target.remove();
    };
  }, [card, context]);

  const label = extensionTitle(module.extension, locale);
  return (
    <ErrorBoundary label={label} resetKeys={[card]}>
      {error ? (
        <div role="alert" className={`bg-surface border border-error/30 rounded-xl p-4 text-xs text-error ${card.size === 'stat' ? 'flex-1 min-w-[140px]' : card.size === 'full' ? 'lg:col-span-2' : ''}`}>
          {label}: {error}
        </div>
      ) : (
        <div
          ref={element}
          className={card.size === 'stat' ? 'contents' : card.size === 'full' ? 'h-full lg:col-span-2' : 'h-full'}
          data-extension-card={`${module.extension.id}:${card.id}`}
        />
      )}
      {overlays}
    </ErrorBoundary>
  );
}

/** Asks one module for its attention items now and every {@link ATTENTION_INTERVAL}; reports them up. */
function ModuleAttention({ module, onItems }: { module: OverviewModule; onItems: (id: string, items: ModuleAttentionItem[]) => void }) {
  const { context } = useExtensionHost(module.extension, '/');
  const attention = module.overview.attention;

  useEffect(() => {
    if (!attention) return;
    let cancelled = false;
    const ask = () =>
      attention(context).then(
        items => {
          if (!cancelled) onItems(module.extension.id, (Array.isArray(items) ? items : []).map(item => ({ ...item, extension: module.extension })));
        },
        () => {
          if (!cancelled) onItems(module.extension.id, []);
        },
      );
    void ask();
    const timer = setInterval(ask, ATTENTION_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [attention, context, module.extension, onItems]);
  return null;
}

/** The attention items of every module, errors first, then newest first. */
export function useModuleAttention(modules: readonly OverviewModule[]): { items: ModuleAttentionItem[]; collectors: ReactNode } {
  const [byModule, setByModule] = useState<Record<string, ModuleAttentionItem[]>>({});
  const onItems = useMemo(() => (id: string, items: ModuleAttentionItem[]) => setByModule(prev => ({ ...prev, [id]: items })), []);
  const items = useMemo(
    () =>
      Object.values(byModule)
        .flat()
        .sort((a, b) => (a.level === b.level ? (b.time ?? '').localeCompare(a.time ?? '') : a.level === 'error' ? -1 : 1)),
    [byModule],
  );
  const collectors = modules
    .filter(m => m.overview.attention)
    .map(m => <ModuleAttention key={m.extension.id} module={m} onItems={onItems} />);
  return { items, collectors };
}
