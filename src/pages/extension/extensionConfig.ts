import type { DashboardExtensionConfig, DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import { getInstalledPluginConfig } from '../../api/marketplace';

/** A marketplace extension's settings as the dashboard hands them to it (`ctx.config`, `onConfigChange`). */
export interface ExtensionConfigSource {
  /** The last values read; undefined for built-in extensions, and until the first read. */
  readonly values: DashboardExtensionConfig | undefined;
  /** Reads the settings the first time (later calls wait for that read); never rejects. */
  ready(): Promise<void>;
  /** Reads them again (a `config:changed` of the plugin's section) and tells the listeners; never rejects. */
  reload(): Promise<void>;
  /** Called with the new values after each read that changed them. */
  subscribe(listener: (values: DashboardExtensionConfig) => void): () => void;
}

/** Built-in extensions have no settings: `config` stays undefined and listeners are never called. */
const BUILT_IN: ExtensionConfigSource = {
  values: undefined,
  ready: () => Promise.resolve(),
  reload: () => Promise.resolve(),
  subscribe: () => () => {},
};

/** Whether the server installed the extension from the marketplace (it then has settings, possibly none). */
export const isMarketplaceExtension = (extension: DashboardExtensionInfo) => extension.source === 'marketplace';

/**
 * The npm package of a marketplace extension, as `GET /dashboard/extensions` sends it (`package`, with
 * `source: 'marketplace'`). Without it the settings cannot be read: the extension mounts with `{}`.
 */
function packageOf(extension: DashboardExtensionInfo): string {
  if (extension.package) return extension.package;
  throw new Error(`${extension.id} has no package`);
}

/**
 * The settings of a marketplace extension (`GET /dashboard/marketplace/installed/{name}/config`: stored values over the
 * defaults). When the first read fails the extension mounts with `{}` (it applies its own defaults, as the kit
 * documents) and `onError` is called so the user is told; a failed later read keeps the last values and calls it too.
 */
export function createExtensionConfig(extension: DashboardExtensionInfo, onError: (err: unknown) => void): ExtensionConfigSource {
  if (!isMarketplaceExtension(extension)) return BUILT_IN;
  let values: DashboardExtensionConfig | undefined;
  let first: Promise<void> | null = null;
  let reads = 0;
  const listeners = new Set<(values: DashboardExtensionConfig) => void>();

  const read = async (): Promise<void> => {
    const request = ++reads;
    try {
      const next = (await getInstalledPluginConfig(packageOf(extension))).values as DashboardExtensionConfig;
      // Only the latest read may answer
      if (request !== reads) return;
      const changed = JSON.stringify(next) !== JSON.stringify(values);
      values = next;
      if (changed) listeners.forEach(fn => fn(next));
    } catch (err) {
      if (request !== reads) return;
      if (values === undefined) values = {};
      onError(err);
    }
  };

  return {
    get values() { return values; },
    ready: () => (first ??= read()),
    reload: () => {
      const reading = read();
      first ??= reading;
      return reading;
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
