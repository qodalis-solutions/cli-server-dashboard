import type { ConfigProvider, ConfigStoreDescription } from '../../types';

/** How a store is shown: its kind, with JSON files holding appsettings told apart. */
export type StoreVariant = 'memory' | 'file' | 'appsettings' | 'database' | 'redis' | 'custom';

const KNOWN = new Set<string>(['memory', 'database', 'redis']);

/** The variant of a store; unknown kinds (newer servers) are custom. */
export function storeVariant(store: ConfigStoreDescription): StoreVariant {
  if (store.kind === 'file') return /appsettings/i.test(`${store.detail} ${store.title}`) ? 'appsettings' : 'file';
  return KNOWN.has(store.kind) ? (store.kind as StoreVariant) : 'custom';
}

/** The store a provider saves to: its own, else the default store when it is writable; null when it saves nowhere. */
export function effectiveStore(provider: ConfigProvider, defaultStore: ConfigStoreDescription | null): ConfigStoreDescription | null {
  return provider.store ?? (provider.writable ? defaultStore : null);
}

/** The stores in use, each variant once (custom stores by their title), in the order they first appear. */
export function distinctStores(stores: (ConfigStoreDescription | null | undefined)[]): ConfigStoreDescription[] {
  const seen = new Map<string, ConfigStoreDescription>();
  for (const store of stores) {
    if (!store) continue;
    const variant = storeVariant(store);
    const key = variant === 'custom' ? `custom:${store.title}` : variant;
    const known = seen.get(key);
    // A kind is shown as not persistent when any of its stores is not
    if (!known) seen.set(key, store);
    else if (known.persistent && !store.persistent) seen.set(key, store);
  }
  return [...seen.values()];
}
