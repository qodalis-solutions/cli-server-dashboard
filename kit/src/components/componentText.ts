import { useKitText, type KitTextKey, type KitTextParams } from '../i18n/text';

/** Built-in texts of the shared components, in the language of the enclosing `KitProvider` (English without one). */
export function useComponentText(): (key: KitTextKey, params?: KitTextParams) => string {
  return useKitText().t;
}
