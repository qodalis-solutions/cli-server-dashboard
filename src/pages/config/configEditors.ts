import { useEffect, useMemo, useState, type ComponentType } from 'react';
import type { ConfigEditorMount, ConfigEditorProps, DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import { useExtensionModules } from '../extension/useExtensionModules';

export type { ConfigEditorProps } from '@qodalis/cli-server-dashboard-kit';

/**
 * A custom input of the Config page for one `editor` hint: a component built into the dashboard, or a plugin module's
 * mount function (rendered into its own element with the module's context).
 */
export type ConfigEditor =
  | { kind: 'component'; Component: ComponentType<ConfigEditorProps> }
  | { kind: 'module'; extension: DashboardExtensionInfo; mount: ConfigEditorMount };

/**
 * Custom inputs of the Config page by `editor` hint. Two ways in, as for the Overview and the palette:
 * - a plugin's dashboard module registered with `widgets: ["config"]` exports `configEditors` (`defineExtension(App,
 *   { configEditors: { cron: CronEditor } })`);
 * - code built into the dashboard calls {@link registerConfigEditor}.
 * A hint nobody registered falls back to the input of the entry's type.
 */
const registry = new Map<string, ComponentType<ConfigEditorProps>>();
const listeners = new Set<() => void>();

/** Uses `Editor` for every config entry whose `editor` hint is `hint`; returns the function that removes it again. */
export function registerConfigEditor(hint: string, Editor: ComponentType<ConfigEditorProps>): () => void {
  registry.set(hint, Editor);
  listeners.forEach(l => l());
  return () => {
    if (registry.get(hint) === Editor) registry.delete(hint);
    listeners.forEach(l => l());
  };
}

/** The editors by hint: the dashboard's own, then the modules' (a module's wins). */
export function useConfigEditors(): ReadonlyMap<string, ConfigEditor> {
  const modules = useExtensionModules('config');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion(v => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return useMemo(() => {
    void version;
    const editors = new Map<string, ConfigEditor>();
    registry.forEach((Component, hint) => editors.set(hint, { kind: 'component', Component }));
    for (const { extension, module } of modules) {
      for (const [hint, mount] of Object.entries(module.configEditors ?? {})) {
        if (typeof mount === 'function') editors.set(hint, { kind: 'module', extension, mount });
      }
    }
    return editors;
  }, [modules, version]);
}
