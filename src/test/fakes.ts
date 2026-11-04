import { vi } from 'vitest';

/** A WebSocket stand-in that records every socket the app opens. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  /** Server accepted the connection. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Server sent an event. */
  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  /** Server (or network) closed the connection. */
  drop(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  send(): void {}

  close(): void {
    this.drop();
  }

  static get live(): FakeWebSocket[] {
    return FakeWebSocket.instances.filter(ws => ws.readyState !== FakeWebSocket.CLOSED);
  }

  static install(): void {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface FakeServer {
  mode: Response | 'network-error' | (() => Response);
  /** Requests are signed in when they carry this token (or when `hostSession` is true). */
  validToken: string | null;
  /** External mode with a host cookie session: signed in without a bearer token. */
  hostSession: boolean;
  enabledFeatures: string[] | undefined;
  shell: boolean;
  plugins: unknown[];
  /** Paths that answer 401 regardless of the token. */
  unauthorized: Set<string>;
  login: () => Response;
  requests: string[];
}

/** A fetch stub answering the dashboard's API calls. */
export function installFakeServer(overrides: Partial<FakeServer> = {}): FakeServer {
  const server: FakeServer = {
    mode: json({ mode: 'password', signInUrl: null }),
    validToken: 'good-token',
    hostSession: false,
    enabledFeatures: [],
    shell: false,
    plugins: [],
    unauthorized: new Set(),
    login: () => json({ error: 'Invalid credentials' }, 401),
    requests: [],
    ...overrides,
  };

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).split('?')[0];
    server.requests.push(path);
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    const signedIn = server.hostSession || (!!server.validToken && auth === `Bearer ${server.validToken}`);

    if (path === '/api/v1/qcli/auth/mode') {
      if (server.mode === 'network-error') throw new TypeError('Failed to fetch');
      return typeof server.mode === 'function' ? server.mode() : server.mode.clone();
    }
    if (path === '/api/v1/qcli/auth/login') return server.login();
    if (path === '/api/v1/qcli/capabilities') {
      return json({ os: 'linux', shell: server.shell, platform: 'dotnet', version: '1.0.0', features: [] });
    }
    if (path === '/api/v1/qcli/sessions/ws-ticket') return new Response('', { status: 404 });
    if (!signedIn || server.unauthorized.has(path)) return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);

    switch (path) {
      case '/api/v1/qcli/auth/me':
        return json({ username: 'alice', authenticatedAt: new Date(0).toISOString() });
      case '/api/v1/qcli/status':
        return json({
          uptimeSeconds: 10, startedAt: new Date(0).toISOString(), memoryUsageMb: 1, cpuUsagePercent: null,
          platform: 'dotnet', platformVersion: '10', activeWsConnections: 1, activeShellSessions: 0,
          registeredCommands: 2, registeredJobs: 0, os: 'linux',
          ...(server.enabledFeatures ? { enabledFeatures: server.enabledFeatures } : {}),
        });
      case '/api/v1/qcli/plugins':
        return json(server.plugins);
      case '/api/v1/qcli/config':
        return json({ sections: [] });
      case '/api/v1/qcli/logs':
        return json({ entries: [], total: 0, limit: 100, offset: 0 });
      default:
        return json([]);
    }
  }));
  return server;
}
