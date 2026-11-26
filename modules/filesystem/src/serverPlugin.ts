import type { ServerPluginRequirement } from '@qodalis/cli-server-dashboard-kit';

/**
 * The server plugin serving this page's API (as `qodalis.serverPackages` of package.json, which the marketplace reads):
 * the page says when it is not installed on the server.
 */
export const SERVER_PLUGIN: ServerPluginRequirement = {
  id: 'filesystem',
  title: 'Filesystem',
  packages: { node: '@qodalis/cli-server-plugin-filesystem', python: 'qodalis-cli-server-plugin-filesystem', dotnet: 'Qodalis.Cli.Plugin.FileSystem' },
  api: '/api/qcli/fs/ls',
};
