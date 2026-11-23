import { useTranslations } from '@qodalis/cli-server-dashboard-kit';
import { messages } from './messages';

/** The module's texts in the dashboard's language (`t('jobs.…')`), with its date and number formats. */
export const useI18n = () => useTranslations(messages);

export type Translate = ReturnType<typeof useI18n>['t'];
