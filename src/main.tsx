import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@qodalis/react-cli/styles.css';
import App from './App';
import { I18nProvider } from './i18n';
import './index.css';

// Derived from vite's `base` so the router can't drift from the deploy path.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
