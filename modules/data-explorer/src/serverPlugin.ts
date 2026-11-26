import type { ServerPluginRequirement } from '@qodalis/cli-server-dashboard-kit';

/**
 * The server plugin serving this page's API (as `qodalis.serverPackages` of package.json, which the marketplace reads):
 * the page says when it is not installed on the server.
 */
export const SERVER_PLUGIN: ServerPluginRequirement = {
  id: 'data-explorer',
  title: 'Data explorer',
  packages: { node: '@qodalis/cli-server-plugin-data-explorer', python: 'qodalis-cli-server-plugin-data-explorer', dotnet: 'Qodalis.Cli' },
  api: '/api/qcli/data-explorer/sources',
};
