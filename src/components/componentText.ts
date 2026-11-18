import { useOptionalI18n, type MessageParams } from '../i18n';
import componentMessages from '../i18n/messages/components';

type ComponentKey = keyof typeof componentMessages.en;

/**
 * Built-in texts of the shared components (`components.*`), translated inside the I18nProvider and in English outside
 * it (components rendered on their own, in tests).
 */
export function useComponentText(): (key: ComponentKey, params?: MessageParams) => string {
  const i18n = useOptionalI18n();
  if (i18n) return (key, params) => i18n.t(`components.${key}`, params);
  return (key, params) =>
    componentMessages.en[key].replace(/\{(\w+)\}/g, (match, name: string) => (params && name in params ? String(params[name]) : match));
}
