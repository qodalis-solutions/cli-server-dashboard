import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { basePath } from './config';
import { DEFAULT_PORTAL_THEME, applyPortalTheme } from './theme';
import './index.css';

// The default colours (in the reader's saved scheme) until portal.json brings the host's
applyPortalTheme(DEFAULT_PORTAL_THEME);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The mount comes from the <base href> the server writes, so the site works at any path */}
    <BrowserRouter basename={basePath()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
