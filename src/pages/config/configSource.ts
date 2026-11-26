import type { MessageKey } from '../../i18n';
import type { ConfigProviderStorage, ConfigSource } from '../../types';

const SOURCE_KEYS: Record<ConfigSource, { label: MessageKey; hint: MessageKey }> = {
  default: { label: 'config.sourceDefault', hint: 'config.sourceDefaultHint' },
  file: { label: 'config.sourceFile', hint: 'config.sourceFileHint' },
  environment: { label: 'config.sourceEnvironment', hint: 'config.sourceEnvironmentHint' },
  database: { label: 'config.sourceDatabase', hint: 'config.sourceDatabaseHint' },
  runtime: { label: 'config.sourceRuntime', hint: 'config.sourceRuntimeHint' },
  code: { label: 'config.sourceCode', hint: 'config.originCodeHint' },
};

/**
 * The label and tooltip of an entry's source. A provider reading the host's configuration (.NET's IConfiguration) says
 * so for values from files: they come from appsettings and the other host sources.
 */
export function sourceText(source: ConfigSource, storage: ConfigProviderStorage | undefined): { label: MessageKey; hint: MessageKey } {
  if (source === 'file' && storage?.kind === 'configuration') {
    return { label: 'config.sourceConfiguration', hint: 'config.sourceConfigurationHint' };
  }
  return SOURCE_KEYS[source] ?? SOURCE_KEYS.default;
}
