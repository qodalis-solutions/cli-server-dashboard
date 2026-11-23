import './styles.css';
import { defineExtension } from '@qodalis/cli-server-dashboard-kit';
import AuditPage from './AuditPage';

/** The audit log page (`/x/audit`): its filters and search live in the page's query (`/?q=…&event=…`). */
export default defineExtension(AuditPage);
