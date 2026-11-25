import Badge from '../../components/Badge';
import { useI18n, type MessageKey } from '../../i18n';
import type { ConfigProviderStorage, ConfigStorageKind, ConfigStoreDescription, ConfigStoreKind } from '../../types';

const STORE_KEYS: Record<Exclude<ConfigStoreKind, 'custom'>, MessageKey> = {
  memory: 'config.storeMemory',
  file: 'config.storeFile',
  database: 'config.storeDatabase',
};

const STORAGE_KEYS: Record<ConfigStorageKind, MessageKey> = {
  store: 'config.storageStore',
  runtime: 'config.storageRuntime',
  options: 'config.storageOptions',
  environment: 'config.storageEnvironment',
  configuration: 'config.storageConfiguration',
  custom: 'config.storageCustom',
};

/** Where changes are saved, under the header; a warning when they are lost on restart. */
export function ConfigStoreBanner({ store }: { store: ConfigStoreDescription }) {
  const { t } = useI18n();
  const known = store.kind !== 'custom' && STORE_KEYS[store.kind];
  const title = known ? t(known) : store.title || t('config.storeCustom');
  return (
    <div
      role={store.persistent ? 'note' : 'alert'}
      data-store-kind={store.kind}
      className={`px-4 sm:px-6 py-2 border-b text-xs flex flex-wrap items-center gap-x-1.5 gap-y-1 ${
        store.persistent ? 'border-border/75 text-muted' : 'bg-warning/10 border-warning/30 text-warning'
      }`}
    >
      <span>{t('config.storeSavedTo')}</span>
      <span className="font-medium text-heading">{title}</span>
      {store.detail && <span className="font-mono break-all">{store.detail}</span>}
      {!store.persistent && <span className="basis-full sm:basis-auto sm:ml-2 font-medium">{t('config.storeNotPersistent')}</span>}
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
