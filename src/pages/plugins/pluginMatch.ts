import type { CommandDescriptor, InstalledPluginDto, PluginInfo } from '../../types';
import { commandModule } from '../commands/commandInfo';

/** The lower-case words of a name: `Qodalis.Cli.Plugin.PublicApi` → qodalis, cli, plugin, public, api. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A name's words joined with dashes, to compare ids written differently (`public-api`, `PublicApi`, `public_api`). */
export function pluginKey(name: string): string {
  return words(name).join('-');
}

/**
 * The plugin a package is named after: the words after its last `plugin` word (`@qodalis/cli-server-plugin-weather`,
 * `Qodalis.Cli.Plugin.Weather`, `qodalis-cli-server-plugin-weather` → `weather`); null for a package not named so
 * (the core package, a host's own).
 */
export function packagePluginKey(packageId: string): string | null {
  const w = words(packageId);
  const at = w.lastIndexOf('plugin');
  return at >= 0 && at < w.length - 1 ? w.slice(at + 1).join('-') : null;
}

/** Whether a package provides a module: its plugin words are exactly the module id's (no looser guesses). */
export function packageProvidesModule(packageId: string, moduleId: string): boolean {
  const key = packagePluginKey(packageId);
  return key !== null && key === pluginKey(moduleId);
}

/** The installed package that provides a module, when exactly one matches. */
export function providingPackage(packages: readonly InstalledPluginDto[] | null | undefined, moduleId: string): InstalledPluginDto | undefined {
  const matches = (packages ?? []).filter(p => packageProvidesModule(p.id, moduleId));
  return matches.length === 1 ? matches[0] : undefined;
}

/** The modules a package provides. */
export function providedModules(modules: readonly PluginInfo[] | null | undefined, packageId: string): PluginInfo[] {
  return (modules ?? []).filter(m => packageProvidesModule(packageId, m.id));
}

/**
 * A module's top-level commands: those whose module is the module's id, and, from servers that do not send a
 * command's module, those the module lists as its processors.
 */
export function moduleCommands(commands: readonly CommandDescriptor[] | null | undefined, module: PluginInfo): CommandDescriptor[] {
  const names = new Set((module.processors ?? []).map(p => p.toLowerCase()));
  return (commands ?? []).filter(cmd => {
    const owner = commandModule(cmd);
    return owner ? owner === module.id : names.has(cmd.command.toLowerCase());
  });
}

/** The permissions a command and its sub-commands require, each once. */
export function commandPermissions(cmd: CommandDescriptor): string[] {
  const all = new Set<string>();
  const visit = (c: CommandDescriptor) => {
    c.requiredPermissions?.forEach(p => all.add(p));
    c.processors?.forEach(visit);
  };
  visit(cmd);
  return [...all];
}
