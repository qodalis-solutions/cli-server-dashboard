import { Badge } from '@qodalis/cli-server-dashboard-kit';
import { useI18n } from '../../i18n';
import type { MarketplaceInstalled } from '../../types';

/**
 * The card layout shared by the plugin cards (Installed and Marketplace tabs) and the details dialogs: rows that keep a
 * gap between text and chips and wrap on narrow cards, chips that never shrink into the text.
 */
export const TITLE_ROW = 'flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0';
export const META_ROW = 'flex items-center flex-wrap gap-x-2 gap-y-1 mt-1 text-xs text-subtle';
export const BADGE_ROW = 'flex items-center flex-wrap gap-2';
export const VERSION_CHIP = 'shrink-0 inline-flex items-center leading-none text-[10px] text-subtle font-mono bg-control px-1.5 py-1 rounded';

/**
 * How the server has a marketplace plugin: "Added in code · v1.2.0" (with "Newer version v1.3.0 in the marketplace;
 * update it in code" when there is one), or "Installed: v1.2.0" with "Update available". Nothing when it is not there.
 */
export function InstallStateBadges({ installed, updateAvailable, latest }: {
  installed: MarketplaceInstalled | null;
  updateAvailable: boolean;
  /** The marketplace's newest version, for the note on a plugin added in code. */
  latest: string | null;
}) {
  const { t } = useI18n();
  if (!installed) return null;
  if (installed.source === 'code') {
    return (
      <>
        <span data-testid="added-in-code" title={t('marketplace.addedInCodeHint')} className="inline-flex shrink-0">
          <Badge variant="info">
            {installed.version ? t('marketplace.addedInCodeVersion', { version: installed.version }) : t('marketplace.addedInCode')}
          </Badge>
        </span>
        {updateAvailable && latest && (
          <span data-testid="newer-in-code" className="inline-flex max-w-full">
            <Badge variant="warning">{t('marketplace.newerInCode', { version: latest })}</Badge>
          </span>
        )}
      </>
    );
  }
  return (
    <>
      <span className="inline-flex shrink-0"><Badge variant="info">{t('marketplace.installedVersion', { version: installed.version ?? '' })}</Badge></span>
      {updateAvailable && <span className="inline-flex shrink-0"><Badge variant="warning">{t('marketplace.updateAvailable')}</Badge></span>}
    </>
  );
}
