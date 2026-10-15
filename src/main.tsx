import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@qodalis/react-cli/styles.css';
import App from './App';
import { I18nProvider } from './i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter basename="/qcli/admin">
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
