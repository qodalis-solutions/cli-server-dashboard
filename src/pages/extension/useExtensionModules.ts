import { useEffect, useMemo, useState } from 'react';
import type { DashboardExtension, DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import { useExtensions } from '../../context/ExtensionsContext';
import { injectStyles, loadExtension } from './loadExtension';

/** A module loaded for one of its slots. */
export interface LoadedExtension {
  extension: DashboardExtensionInfo;
  module: DashboardExtension;
}

/**
 * Loads the modules registered with `slot` in their `widgets` (`overview`, `palette`) that the user may open, while
 * `enabled`. A module that fails to load is left out (its own page shows the error).
 */
export function useExtensionModules(slot: string, enabled = true): LoadedExtension[] {
  return useExtensionModulesState(slot, enabled).modules;
}

/**
 * The modules of `slot` and whether they are still loading (the list of extensions, then the modules' code), so a
 * page can hold their places meanwhile; `pending` is how many modules are on their way.
 */
export function useExtensionModulesState(slot: string, enabled = true): { modules: LoadedExtension[]; loading: boolean; pending: number } {
  const { extensions, loading: listLoading } = useExtensions();
  const withSlot = useMemo(() => (enabled ? extensions.filter(e => e.widgets?.includes(slot)) : []), [extensions, slot, enabled]);
  const [loaded, setLoaded] = useState<{ for: DashboardExtensionInfo[]; modules: LoadedExtension[] }>({ for: [], modules: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      withSlot.map(async extension => {
        injectStyles(extension.styles);
        return { extension, module: await loadExtension(extension.entry) };
      }),
    ).then(results => {
      if (!cancelled) setLoaded({ for: withSlot, modules: results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : [])) });
    });
    return () => {
      cancelled = true;
    };
  }, [withSlot]);

  const loadingModules = withSlot.length > 0 && loaded.for !== withSlot;
  return {
    modules: loaded.modules,
    loading: enabled && (listLoading || loadingModules),
    pending: loadingModules ? withSlot.length : 0,
  };
}
