import PageHeader from '../../components/PageHeader';
import { Cli, CliConfigProvider } from '@qodalis/react-cli';
import type { CliOptions } from '@qodalis/cli-core';

const options: CliOptions = {
  servers: [
    {
      name: 'current',
      url: window.location.origin,
    },
  ],
};

export default function TerminalPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Terminal"
        subtitle="Execute CLI commands directly on the server"
      />
      <div className="flex-1 p-6 min-h-0">
        <div className="h-full bg-black/40 border border-white/[0.08] rounded-xl overflow-hidden">
          <CliConfigProvider options={options}>
            <Cli style={{ height: '100%' }} />
          </CliConfigProvider>
        </div>
      </div>
    </div>
  );
}
