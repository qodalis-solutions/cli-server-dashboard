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
  const { extensions } = useExtensions();
  const withSlot = useMemo(() => (enabled ? extensions.filter(e => e.widgets?.includes(slot)) : []), [extensions, slot, enabled]);
  const [modules, setModules] = useState<LoadedExtension[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      withSlot.map(async extension => {
        injectStyles(extension.styles);
        return { extension, module: await loadExtension(extension.entry) };
      }),
    ).then(results => {
      if (!cancelled) setModules(results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : [])));
    });
    return () => {
      cancelled = true;
    };
  }, [withSlot]);
  return modules;
}
