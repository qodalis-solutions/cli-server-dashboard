import type { MarketplaceInstalled } from '../../types';

/** True when the server has the plugin because the host added it in code (no install, update or removal here). */
export function addedInCode(installed: MarketplaceInstalled | null | undefined): boolean {
  return installed?.source === 'code';
}

/** True when the plugin was installed from the marketplace (update and remove it here). */
export function fromMarketplace(installed: MarketplaceInstalled | null | undefined): boolean {
  return installed?.source === 'marketplace';
}
