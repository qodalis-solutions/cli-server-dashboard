import './styles.css';
import { defineExtension } from '@qodalis/cli-server-dashboard-kit';
import TokensPage from './TokensPage';

/** The API tokens page (`/x/tokens`): the user's own tokens, everyone's with `tokens:read` (`/?all=true`). */
export default defineExtension(TokensPage);
