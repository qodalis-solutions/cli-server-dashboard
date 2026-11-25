/** The details page of a module or an installed package (ids such as `@qodalis/cli-server-plugin-weather` encoded). */
export function pluginPath(id: string): string {
  return `/plugins/${encodeURIComponent(id)}`;
}
