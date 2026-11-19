import { Route, Routes } from 'react-router';
import { loadPortalConfig, type PortalConfig } from './config';
import { PortalProvider } from './PortalContext';
import { applyPortalTheme } from './theme';
import { useAsync } from './useAsync';
import PortalLayout from './layout/PortalLayout';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import GuidePage from './guides/GuidePage';
import ReferencePage from './reference/ReferencePage';
import TagPage from './reference/TagPage';
import { Loading } from './components/States';

/** portal.json first; its colours are applied before the site renders, so it never paints in the wrong ones. */
async function loadAndTheme(): Promise<PortalConfig> {
  const config = await loadPortalConfig();
  applyPortalTheme(config.theme);
  return config;
}

/**
 * The portal: `/` (guides' home), `/guides/:slug`, `/reference`, `/reference/:tag`, anything else Not found. The
 * servers answer exactly these paths with index.html (contract C8).
 */
export default function App() {
  const state = useAsync('portal.json', loadAndTheme);

  if (state.status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Loading label="Loading the documentation…" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="max-w-xl mx-auto px-4 py-24">
        <div role="alert" className="p-6 rounded-xl border border-error/30 bg-error/[0.06]">
          <h1 className="text-lg font-semibold text-error">The documentation could not be loaded</h1>
          <p className="mt-2 text-sm text-muted">The server did not answer as expected. Try again in a moment.</p>
          <p className="mt-3 text-xs font-mono text-error/80 break-all">{state.error.message}</p>
        </div>
      </div>
    );
  }

  const config = state.value;
  return (
    <PortalProvider config={config}>
      <Routes>
        <Route element={<PortalLayout />}>
          <Route index element={<HomePage />} />
          <Route path="guides/:slug" element={config.docs ? <GuidePage pagesUrl={config.docs.pages} /> : <NotFoundPage />} />
          <Route path="reference" element={config.api ? <ReferencePage /> : <NotFoundPage />} />
          <Route path="reference/:tag" element={config.api ? <TagPage /> : <NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </PortalProvider>
  );
}
