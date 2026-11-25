import PageHeader from '../../components/PageHeader';
import ErrorBoundary from '../../components/ErrorBoundary';
import { Cli, CliConfigProvider } from '@qodalis/react-cli';
import { ICliServerAuthTokenProvider_TOKEN } from '@qodalis/cli-core';
import type { CliOptions } from '@qodalis/cli-core';
import { getToken } from '../../api/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CliEngine } from '@qodalis/react-cli';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { embeddedUsersModule, hasUsersSession } from './terminalUsers';
import { getBranding } from '../../branding';
import { languagePacks } from './languagePacks';
import { Skeleton, SkeletonGroup, type DashboardTheme } from '@qodalis/cli-server-dashboard-kit';
import { useDocumentTheme } from '../extension/useDocumentTheme';
import { terminalTheme } from './terminalTheme';

const SERVER_NAME = 'current';

/**
 * Lets the embedded CLI use the dashboard's sign-in: the admin token as bearer
 * header for HTTP, and a single-use ticket for WebSockets (protected servers
 * reject tokens in URLs; CLI versions without ticket support ignore it).
 *
 * Passed as a service (not a module) so it is registered before the engine
 * connects to the server.
 */
const dashboardAuthProvider = {
  getHeaders: (name: string): Record<string, string> => {
    const token = getToken();
    return name === SERVER_NAME && token ? { Authorization: `Bearer ${token}` } : {};
  },
  getWebSocketParams: async (name: string): Promise<Record<string, string> | undefined> => {
    if (name !== SERVER_NAME) return undefined;
    const token = getToken();
    if (!token) return {};
    const res = await fetch('/api/v1/qcli/sessions/ws-ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => undefined);
    if (!res?.ok) return {}; // server without the users plugin: connect without a ticket
    const body = (await res.json().catch(() => null)) as { ticket?: unknown } | null;
    return typeof body?.ticket === 'string' ? { ticket: body.ticket } : {};
  },
};

const services = { [ICliServerAuthTokenProvider_TOKEN]: dashboardAuthProvider };

/**
 * The terminal's options: the dashboard's server, the wasm accelerator, the
 * server's name for the terminal (admin plugin branding; "Web CLI" without it)
 * and the dashboard's scheme (later switches go through `engine.setTheme`).
 * Built when the page opens, after the branding was loaded.
 */
function terminalOptions(scheme: DashboardTheme): CliOptions & { wasmUrl?: string } {
  const cli = getBranding().cli;
  return {
    servers: [{ name: SERVER_NAME, url: window.location.origin }],
    // A theme the user applies with the CLI's `theme` command still wins until `theme reset`
    theme: scheme,
    // Shipped by scripts/copy-wasm.mjs; used by CLI versions that support wasmUrl
    wasmUrl: `${import.meta.env.BASE_URL}assets/wasm/qodalis_cli_wasm_bg.wasm`,
    ...(cli ? { branding: { name: cli.name } } : {}),
  };
}


/** The CLI's own translation service (same locale codes as the dashboard). */
function setCliLocale(engine: CliEngine | null, locale: string): void {
  const translator = engine?.getContext()?.services?.get<{ setLocale(l: string): void }>('cli-translation-service');
  translator?.setLocale(locale);
}

export default function TerminalPage() {
  const { t, locale } = useI18n();
  const { logout } = useAuth();
  const scheme = useDocumentTheme();
  const [options] = useState(() => terminalOptions(scheme));
  // With the users plugin the terminal's user is the dashboard's (false: no users plugin,
  // undefined: still checking; the CLI takes its modules once, so it waits for the answer)
  const [usersSession, setUsersSession] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    hasUsersSession().then(has => {
      if (!cancelled) setUsersSession(has);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // The sign-in hint stays in the language the terminal opened with
  const signInHint = t('terminal.signInHint');
  const modules = useMemo(
    () => (usersSession
      ? [embeddedUsersModule(SERVER_NAME, logout, signInHint), ...languagePacks]
      : languagePacks),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once, when the check answers
    [usersSession],
  );
  const engineRef = useRef<CliEngine | null>(null);
  // The CLI may keep the onReady callback from its first render: read the locale
  // through a ref so a language switched before the engine was ready still applies.
  const localeRef = useRef(locale);
  const schemeRef = useRef(scheme);

  // Keep the embedded CLI in the dashboard's language (on every change once ready)
  useEffect(() => {
    localeRef.current = locale;
    setCliLocale(engineRef.current, locale);
  }, [locale]);

  // Follow the dashboard's light/dark switch live (the viewer's theme control, Device following the OS)
  useEffect(() => {
    if (schemeRef.current === scheme) return;
    schemeRef.current = scheme;
    engineRef.current?.setTheme(terminalTheme(scheme));
  }, [scheme]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('terminal.title')} subtitle={t('terminal.subtitle')} />
      <div className="flex-1 p-4 sm:p-6 min-h-0">
        <div className="h-full bg-surface border border-border rounded-xl overflow-hidden">
          <ErrorBoundary label={t('terminal.title')}>
            {usersSession === undefined ? (
              <TerminalSkeleton />
            ) : (
              <CliConfigProvider options={options} services={services}>
                <Cli
                  modules={modules}
                  style={{ height: '100%' }}
                  onReady={(engine) => {
                    engineRef.current = engine;
                    setCliLocale(engine, localeRef.current);
                    // The scheme may have changed while the terminal was starting
                    if (schemeRef.current !== options.theme) engine.setTheme(terminalTheme(schemeRef.current));
                  }}
                />
              </CliConfigProvider>
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

/** Place of the terminal (a prompt and a few lines) while the session check answers. */
function TerminalSkeleton() {
  return (
    <SkeletonGroup className="p-4 space-y-2.5">
      {['40%', '65%', '30%', '55%'].map((width, i) => <Skeleton key={i} className="h-3" style={{ width }} />)}
    </SkeletonGroup>
  );
}
