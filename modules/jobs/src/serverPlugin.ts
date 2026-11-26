import type { ServerPluginRequirement } from '@qodalis/cli-server-dashboard-kit';

/**
 * The server plugin serving this page's API (as `qodalis.serverPackages` of package.json, which the marketplace reads):
 * the page says when it is not installed on the server.
 */
export const SERVER_PLUGIN: ServerPluginRequirement = {
  id: 'jobs',
  title: 'Jobs',
  packages: { node: '@qodalis/cli-server-plugin-jobs', python: 'qodalis-cli-server-plugin-jobs', dotnet: 'Qodalis.Cli.Plugin.Jobs' },
  api: '/api/v1/qcli/jobs',
};
