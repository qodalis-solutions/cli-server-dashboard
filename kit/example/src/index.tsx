import './styles.css';
import { useEffect, useState } from 'react';
import {
  Badge,
  DataTable,
  PageHeader,
  StatCard,
  defineMessages,
  defineExtension,
  useApi,
  useDashboard,
  useTranslations,
} from '@qodalis/cli-server-dashboard-kit';

const messages = {
  hello: defineMessages({
    en: {
      title: 'Hello',
      subtitle: 'Signed in as {name}',
      commands: 'Commands',
      name: 'Name',
      description: 'Description',
    },
    de: {
      title: 'Hallo',
      subtitle: 'Angemeldet als {name}',
      commands: 'Befehle',
      name: 'Name',
      description: 'Beschreibung',
    },
  }),
};

interface Command {
  command: string;
  description?: string;
}

/** A page listing the server's commands, styled and translated like the dashboard's own pages. */
function Hello() {
  const { user, hasPermission } = useDashboard();
  const api = useApi();
  // The page's own texts, in the dashboard's language
  const { t } = useTranslations(messages);
  const [commands, setCommands] = useState<Command[]>([]);

  useEffect(() => {
    api.get<Command[]>('/api/v1/qcli/commands').then(setCommands, () => setCommands([]));
  }, [api]);

  return (
    <>
      <PageHeader title={t('hello.title')} subtitle={t('hello.subtitle', { name: user.name })} />
      {/* The dashboard's page padding */}
      <div className="p-4 sm:p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label={t('hello.commands')} value={commands.length} />
          <StatCard label="admin" value={hasPermission('*') ? 'yes' : 'no'} />
        </div>
        <DataTable
          data={commands}
          keyExtractor={(c) => c.command}
          columns={[
            {
              key: 'command',
              header: t('hello.name'),
              sortValue: (c) => c.command,
              render: (c) => <span className="font-mono text-primary">{c.command}</span>,
            },
            {
              key: 'description',
              header: t('hello.description'),
              render: (c) => c.description ?? <Badge variant="neutral">-</Badge>,
            },
          ]}
        />
      </div>
    </>
  );
}

export default defineExtension(Hello);
