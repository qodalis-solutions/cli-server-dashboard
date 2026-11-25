import Badge from '../../components/Badge';
import { useI18n, type MessageKey } from '../../i18n';
import type { ConfigProviderStorage, ConfigStorageKind, ConfigStoreDescription } from '../../types';
import { storeVariant, type StoreVariant } from './configStore';

const STORE_KEYS: Record<Exclude<StoreVariant, 'custom'>, MessageKey> = {
  memory: 'config.storeMemory',
  file: 'config.storeFile',
  appsettings: 'config.storeAppsettings',
  database: 'config.storeDatabase',
  redis: 'config.storeRedis',
};

/** The translated name of a store; custom stores go by the server's title. */
function useStoreLabel() {
  const { t } = useI18n();
  return (store: ConfigStoreDescription) => {
    const variant = storeVariant(store);
    return variant === 'custom' ? store.title || t('config.storeCustom') : t(STORE_KEYS[variant]);
  };
}

/** The tooltip of a store: the server's title and detail, and a warning when it does not keep changes. */
function useStoreHint() {
  const { t } = useI18n();
  const label = useStoreLabel();
  return (store: ConfigStoreDescription) =>
    [[store.title || label(store), store.detail].filter(Boolean).join(': '), store.persistent ? '' : t('config.storeNotPersistent')]
      .filter(Boolean)
      .join('\n');
}

const ICON_PATHS: Record<StoreVariant, string> = {
  // a memory chip
  memory: 'M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  // a document
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  // a document with braces
  appsettings: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M10 12c-1 0-1 .5-1 1.5S8.5 15 8 15c.5 0 1 .5 1 1.5s0 1.5 1 1.5M14 12c1 0 1 .5 1 1.5s.5 1.5 1 1.5c-.5 0-1 .5-1 1.5s0 1.5-1 1.5',
  // a cylinder
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  // stacked layers
  redis: 'M12 3 3 7.5 12 12l9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  // a box
  custom: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
};

/** The icon of a store's kind (decorative: its name is given next to it or in the tooltip). */
export function StoreIcon({ store, className = 'w-3.5 h-3.5' }: { store: ConfigStoreDescription; className?: string }) {
  const variant = storeVariant(store);
  return (
    <svg data-store-icon={variant} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d={ICON_PATHS[variant]} />
    </svg>
  );
}

/** A provider's store in the list beside the sections: its icon, its name and detail in the tooltip. */
export function ProviderStoreBadge({ store }: { store: ConfigStoreDescription }) {
  const label = useStoreLabel();
  const hint = useStoreHint();
  return (
    <span data-store-badge={storeVariant(store)} title={hint(store)} className={`ml-auto inline-flex items-center ${store.persistent ? 'text-subtle' : 'text-warning'}`}>
      <StoreIcon store={store} />
      <span className="sr-only">({label(store)})</span>
    </span>
  );
}

const STORAGE_KEYS: Record<ConfigStorageKind, MessageKey> = {
  store: 'config.storageStore',
  runtime: 'config.storageRuntime',
  options: 'config.storageOptions',
  environment: 'config.storageEnvironment',
  configuration: 'config.storageConfiguration',
  custom: 'config.storageCustom',
};

/**
 * Under the header: the default store (where providers without their own store save), with a warning when it is lost
 * on restart, and the stores in use (each kind once, the name and detail in the tooltip).
 */
export function ConfigStoreBanner({ defaultStore, stores }: { defaultStore: ConfigStoreDescription | null; stores: ConfigStoreDescription[] }) {
  const { t } = useI18n();
  const label = useStoreLabel();
  const hint = useStoreHint();
  const warn = defaultStore !== null && !defaultStore.persistent;
  return (
    <div
      role={warn ? 'alert' : 'note'}
      data-store-kind={defaultStore?.kind}
      className={`px-4 sm:px-6 py-2 border-b text-xs flex flex-wrap items-center gap-x-4 gap-y-1 ${
        warn ? 'bg-warning/10 border-warning/30 text-warning' : 'border-border/75 text-muted'
      }`}
    >
      {defaultStore && (
        <div data-default-store className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
          <span>{t('config.storeDefault')}</span>
          <StoreIcon store={defaultStore} />
          <span className="font-medium text-heading">{label(defaultStore)}</span>
          {defaultStore.detail && <span className="font-mono break-all">{defaultStore.detail}</span>}
          {warn && <span className="basis-full sm:basis-auto sm:ml-2 font-medium">{t('config.storeNotPersistent')}</span>}
        </div>
      )}
      {stores.length > 0 && (
        <div data-store-summary title={t('config.storesHint')} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
          <span>{t('config.storesInUse')}</span>
          <ul aria-label={t('config.storesInUse')} className="contents">
            {stores.map((store, i) => (
              <li key={`${storeVariant(store)}:${store.title}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-subtle">·</span>}
                <span
                  data-store-summary-item={storeVariant(store)}
                  title={hint(store)}
                  className={`inline-flex items-center gap-1 ${store.persistent ? 'text-heading' : 'text-warning'}`}
                >
                  <StoreIcon store={store} />
                  {label(store)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Where a writable provider saves its changes: `Saved to: Database (SQLite …)`, with a warning when it is not persistent. */
export function ProviderStore({ store }: { store: ConfigStoreDescription }) {
  const { t } = useI18n();
  const label = useStoreLabel();
  const hint = useStoreHint();
  return (
    <div
      role={store.persistent ? undefined : 'alert'}
      data-provider-store={store.kind}
      className={`text-xs flex flex-wrap items-center gap-x-1.5 gap-y-1 ${
        store.persistent ? 'text-subtle' : 'p-2 rounded-lg bg-warning/10 border border-warning/30 text-warning'
      }`}
    >
      <span>{t('config.storeSavedTo')}</span>
      <span title={hint(store)} className="inline-flex items-center gap-1 font-medium text-heading">
        <StoreIcon store={store} />
        {label(store)}
      </span>
      {store.detail && <span className="font-mono break-all">({store.detail})</span>}
      {!store.persistent && <span className="basis-full font-medium">{t('config.storeNotPersistent')}</span>}
    </div>
  );
}

/** Where a provider reads its settings from: its kind, the server's description and its sources (a list when several). */
export function ProviderStorage({ storage }: { storage: ConfigProviderStorage }) {
  const { t } = useI18n();
  const sources = (storage.sources ?? []).filter(s => typeof s === 'string' && s !== '');
  return (
    <div data-provider-storage={storage.kind} className="text-xs text-subtle space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span>{t('config.storageReadsFrom')}</span>
        <Badge variant="neutral">{t(STORAGE_KEYS[storage.kind] ?? 'config.storageCustom')}</Badge>
        {storage.description && <span>{storage.description}</span>}
        {sources.length === 1 && <span className="font-mono">({sources[0]})</span>}
      </div>
      {sources.length > 1 && (
        <div>
          <div>{t('config.storageSources')}</div>
          <ol aria-label={t('config.storageSources')} className="mt-0.5 ml-4 list-decimal font-mono">
            {sources.map(s => <li key={s}>{s}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}
