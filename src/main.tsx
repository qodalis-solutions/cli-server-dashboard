import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@qodalis/react-cli/styles.css';
import App from './App';
import { I18nProvider } from './i18n';
import './index.css';
import { DEFAULT_THEME, applyTheme, loadTheme } from './theme';
import { consumeFragmentToken } from './api/signIn';

// Derived from vite's `base` so the router can't drift from the deploy path.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '');

// Host handoff (`#token=…`): store the host's token and drop it from the URL before anything
// else reads the location or renders.
consumeFragmentToken();

// Defaults first, then the server's color scheme (admin plugin `theme` option)
// before the first render, so the page never paints in the wrong colors.
applyTheme(DEFAULT_THEME);
loadTheme(`${import.meta.env.BASE_URL}theme.json`).then(applyTheme).finally(render);

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <BrowserRouter basename={basename}>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </StrictMode>,
  );
}
