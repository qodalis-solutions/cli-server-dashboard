import type { ServerPluginRequirement } from '@qodalis/cli-server-dashboard-kit';

/**
 * The server plugin serving this page's API (as `qodalis.serverPackages` of package.json, which the marketplace reads):
 * the page says when it is not installed on the server.
 */
export const SERVER_PLUGIN: ServerPluginRequirement = {
  id: 'databases',
  title: 'Databases',
  packages: { node: '@qodalis/cli-server-plugin-databases', python: 'qodalis-cli-server-plugin-databases', dotnet: 'Qodalis.Cli.Plugin.Databases' },
  api: '/api/v1/qcli/databases',
};
