import { describe, expect, it } from 'vitest';
import {
  commandPermissions, moduleCommands, packagePluginKey, packageProvidesModule, pluginKey, providedModules, providingPackage,
} from './pluginMatch';
import type { PluginInfo } from '../../types';

const module = (id: string, processors: string[] = []): PluginInfo =>
  ({ id, name: id, version: '1.0.0', description: '', enabled: true, processorCount: processors.length, processors });

describe('plugin matching', () => {
  it('reads the plugin of npm, NuGet and PyPI package names', () => {
    expect(packagePluginKey('@qodalis/cli-server-plugin-weather')).toBe('weather');
    expect(packagePluginKey('Qodalis.Cli.Plugin.Weather')).toBe('weather');
    expect(packagePluginKey('qodalis-cli-server-plugin-weather')).toBe('weather');
    expect(packagePluginKey('Qodalis.Cli.Plugin.PublicApi')).toBe('public-api');
    expect(packagePluginKey('@qodalis/cli-server-plugin-data-explorer-sql')).toBe('data-explorer-sql');
    expect(packagePluginKey('@qodalis/cli-server-node')).toBeNull();
    expect(packagePluginKey('Qodalis.Cli')).toBeNull();
    expect(pluginKey('public_api')).toBe('public-api');
  });

  it('matches a package to a module only by its whole plugin name', () => {
    expect(packageProvidesModule('@qodalis/cli-server-plugin-weather', 'weather')).toBe(true);
    expect(packageProvidesModule('Qodalis.Cli.Plugin.Weather', 'weather')).toBe(true);
    expect(packageProvidesModule('@qodalis/cli-server-plugin-public-api', 'public-api')).toBe(true);
    expect(packageProvidesModule('Qodalis.Cli.Plugin.PublicApi', 'api')).toBe(false);
    expect(packageProvidesModule('@qodalis/cli-server-plugin-data-explorer-sql', 'sql')).toBe(false);
    expect(packageProvidesModule('@qodalis/cli-server-plugin-data-explorer-sql', 'data-explorer')).toBe(false);
    expect(packageProvidesModule('@qodalis/cli-server-node', 'core')).toBe(false);
  });

  it('finds the package of a module and the modules of a package', () => {
    const packages = [
      { id: '@qodalis/cli-server-node', name: 'Core' },
      { id: '@qodalis/cli-server-plugin-weather', name: 'Weather' },
    ];
    expect(providingPackage(packages, 'weather')?.name).toBe('Weather');
    expect(providingPackage(packages, 'core')).toBeUndefined();
    expect(providingPackage(null, 'weather')).toBeUndefined();
    expect(providedModules([module('weather'), module('demo')], '@qodalis/cli-server-plugin-weather').map(m => m.id)).toEqual(['weather']);
  });

  it("takes a module's commands by their module, else by the module's processors", () => {
    const commands = [
      { command: 'weather', description: '', module: 'weather' },
      { command: 'echo', description: '', module: 'demo' },
      { command: 'forecast', description: '' },
      { command: 'time', description: '' },
      { command: 'legacy', description: '', metadata: { module: 'weather' } },
    ];
    expect(moduleCommands(commands, module('weather', ['forecast', 'echo'])).map(c => c.command)).toEqual(['weather', 'forecast', 'legacy']);
  });

  it("collects a command's permissions with its sub-commands'", () => {
    expect(commandPermissions({
      command: 'users', description: '', requiredPermissions: ['users:read'],
      processors: [{ command: 'add', description: '', requiredPermissions: ['users:write', 'users:read'] }],
    })).toEqual(['users:read', 'users:write']);
    expect(commandPermissions({ command: 'echo', description: '' })).toEqual([]);
    // the servers' payload: each level's own permissions, sub-commands two levels down included
    expect(commandPermissions({
      command: 'aws', description: '', requiredPermissions: ['aws:read'],
      processors: [{ command: 's3', description: '', processors: [{ command: 'ls', description: '' }, { command: 'rm', description: '', requiredPermissions: ['aws:write'] }] }],
    })).toEqual(['aws:read', 'aws:write']);
  });
});
