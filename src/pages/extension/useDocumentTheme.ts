import { useEffect, useState } from 'react';
import type { DashboardTheme } from '@qodalis/cli-server-dashboard-kit';

const read = (): DashboardTheme => (document.documentElement.dataset.qcliTheme === 'light' ? 'light' : 'dark');

/** The theme the page shows (`data-qcli-theme` on the root, set by applyTheme), following its changes. */
export function useDocumentTheme(): DashboardTheme {
  const [theme, setTheme] = useState<DashboardTheme>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qcli-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
