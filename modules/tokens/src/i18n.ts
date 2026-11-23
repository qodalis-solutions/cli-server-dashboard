import { useTranslations } from '@qodalis/cli-server-dashboard-kit';
import { messages } from './messages';

/** The page's texts and formatters in the dashboard's language. */
export const useI18n = () => useTranslations(messages);
export type Translate = ReturnType<typeof useI18n>['t'];
export type MessageKey = Parameters<Translate>[0];
