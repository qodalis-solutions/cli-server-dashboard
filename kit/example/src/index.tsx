import './styles.css';
import { useEffect, useState } from 'react';
import {
    Badge,
    DataTable,
    PageHeader,
    StatCard,
    createTranslator,
    defineExtension,
    useApi,
    useDashboard,
} from '@qodalis/cli-server-dashboard-kit';

const messages = {
    en: { title: 'Hello', subtitle: 'Signed in as {name}', commands: 'Commands', name: 'Name', description: 'Description' },
    de: { title: 'Hallo', subtitle: 'Angemeldet als {name}', commands: 'Befehle', name: 'Name', description: 'Beschreibung' },
};

interface Command {
    command: string;
    description?: string;
}

/** A page listing the server's commands, styled and translated like the dashboard's own pages. */
function Hello() {
    const { user, language, hasPermission } = useDashboard();
    const api = useApi();
    const t = createTranslator(messages, language);
    const [commands, setCommands] = useState<Command[]>([]);

    useEffect(() => {
        api.get<Command[]>('/api/v1/qcli/commands').then(setCommands, () => setCommands([]));
    }, [api]);

    return (
        <div className="space-y-6">
            <PageHeader title={t('title')} subtitle={t('subtitle', { name: user.name })} />
            <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label={t('commands')} value={commands.length} />
                <StatCard label="admin" value={hasPermission('*') ? 'yes' : 'no'} />
            </div>
            <DataTable
                data={commands}
                keyExtractor={(c) => c.command}
                columns={[
                    {
                        key: 'command',
                        header: t('name'),
                        sortValue: (c) => c.command,
                        render: (c) => <span className="font-mono text-primary">{c.command}</span>,
                    },
                    { key: 'description', header: t('description'), render: (c) => c.description ?? <Badge variant="neutral">-</Badge> },
                ]}
            />
        </div>
    );
}

export default defineExtension(Hello);
