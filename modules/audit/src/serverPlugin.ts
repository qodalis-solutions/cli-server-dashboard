import type { ServerPluginRequirement } from '@qodalis/cli-server-dashboard-kit';

/**
 * The server plugin serving this page's API (as `qodalis.serverPackages` of package.json, which the marketplace reads):
 * the page says when it is not installed on the server.
 */
export const SERVER_PLUGIN: ServerPluginRequirement = {
  id: 'audit',
  title: 'Audit',
  packages: { node: '@qodalis/cli-server-plugin-audit', python: 'qodalis-cli-server-plugin-audit', dotnet: 'Qodalis.Cli.Plugin.Audit' },
  api: '/api/v1/qcli/audit',
};
