import { resolvePanelTheme } from '@qodalis/cli-core';
import type { DashboardTheme } from '@qodalis/cli-server-dashboard-kit';

/** The CLI's own light or dark terminal colors (its `light` and `default` themes) for the dashboard's scheme. */
export function terminalTheme(scheme: DashboardTheme) {
  return resolvePanelTheme(scheme, scheme === 'dark').terminal;
}
