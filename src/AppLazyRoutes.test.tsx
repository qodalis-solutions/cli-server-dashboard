// @vitest-environment jsdom
/** The pages that load on first visit show a page skeleton (Suspense fallback) until their code arrives. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';
import { I18nProvider } from './i18n';
import { setToken } from './api/client';
import { FakeWebSocket, installFakeServer } from './test/fakes';

/** Releases the code of a page: each lazy page waits for its own gate. */
const gates = vi.hoisted(() => {
  const waiting = new Map<string, () => void>();
  return {
    wait: (name: string) => new Promise<void>(resolve => waiting.set(name, resolve)),
    open: (name: string) => waiting.get(name)?.(),
    has: (name: string) => waiting.has(name),
  };
});

vi.mock('./pages/logs/LogsPage', async () => {
  await gates.wait('logs');
  return { default: () => <div>logs page</div> };
});
vi.mock('./pages/terminal/TerminalPage', async () => {
  await gates.wait('terminal');
  return { default: () => <div>terminal page</div> };
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  window.history.replaceState(null, '', '/qcli/admin/');
  FakeWebSocket.install();
  installFakeServer();
  setToken('good-token');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('lazy routes', () => {
  for (const [name, path, text] of [['logs', '/logs', 'logs page'], ['terminal', '/terminal', 'terminal page']] as const) {
    it(`${path}: a page skeleton inside the layout until the page's code arrives, then the page`, async () => {
      renderApp(path);

      // Signed in: the navigation is there, the page is a skeleton
      expect(await screen.findByRole('navigation')).toBeTruthy();
      await waitFor(() => expect(gates.has(name)).toBe(true));
      const skeleton = screen.getByRole('status');
      expect(skeleton.textContent).toBe('Loading…');
      // A page skeleton: header bars and a table card
      expect(skeleton.querySelector('.rounded-xl')).not.toBeNull();
      expect(screen.queryByText(text)).toBeNull();

      await act(async () => gates.open(name));
      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull();
    });
  }

  it('keeps the Overview in the main bundle: no page skeleton on the landing page', async () => {
    renderApp('/');
    expect(await screen.findByText('Server information')).toBeTruthy();
    expect(screen.queryByText('logs page')).toBeNull();
  });
});
