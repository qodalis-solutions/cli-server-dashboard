// Moved to @qodalis/cli-server-dashboard-kit (kit/); kept so the dashboard's imports stay short.
import { useKitText } from '@qodalis/cli-server-dashboard-kit';

/** Built-in texts of the shared components (the kit's). */
export function useComponentText() {
  return useKitText().t;
}
