import PageHeader from '../../components/PageHeader';
import ErrorBoundary from '../../components/ErrorBoundary';
import { Cli, CliConfigProvider } from '@qodalis/react-cli';
import { ICliServerAuthTokenProvider_TOKEN } from '@qodalis/cli-core';
import type { CliOptions, ICliModule } from '@qodalis/cli-core';
import { getToken } from '../../api/client';

const SERVER_NAME = 'current';

/**
 * Lets the embedded CLI use the dashboard's sign-in: the admin token as bearer
 * header for HTTP, and a single-use ticket for WebSockets (protected servers
 * reject tokens in URLs; CLI versions without ticket support ignore it).
 */
const dashboardAuthModule: ICliModule = {
  apiVersion: 2,
  name: 'dashboard-auth',
  async onInit(context) {
    context.services.set({
      provide: ICliServerAuthTokenProvider_TOKEN,
      multi: true,
      useValue: {
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
          const { ticket } = (await res.json()) as { ticket: string };
          return { ticket };
        },
      },
    } as never);
  },
};

const options: CliOptions = {
  servers: [{ name: SERVER_NAME, url: window.location.origin }],
};

export default function TerminalPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Terminal" subtitle="Execute CLI commands directly on the server" />
      <div className="flex-1 p-6 min-h-0">
        <div className="h-full bg-black/40 border border-white/[0.08] rounded-xl overflow-hidden">
          <ErrorBoundary label="Terminal">
            <CliConfigProvider options={options} modules={[dashboardAuthModule]}>
              <Cli style={{ height: '100%' }} />
            </CliConfigProvider>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
