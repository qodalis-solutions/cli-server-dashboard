import { describe, expect, it } from 'vitest';
import { DEFAULT_PLUGIN_ICON, isIconUrl, knownPluginIcon, pluginKey, resolveModuleIcon } from './moduleIcon';

describe('resolveModuleIcon', () => {
  it('shows an emoji as text', () => {
    expect(resolveModuleIcon('🌤', 'weather')).toEqual({ kind: 'text', text: '🌤' });
    expect(resolveModuleIcon(' 👨‍💻 ', 'dev')).toEqual({ kind: 'text', text: '👨‍💻' });
  });

  it('shows a URL as an image', () => {
    expect(resolveModuleIcon('https://cdn.example.com/jobs.svg', 'jobs')).toEqual({ kind: 'image', src: 'https://cdn.example.com/jobs.svg' });
    expect(resolveModuleIcon('/qcli/admin/icons/jobs.png', 'jobs')).toEqual({ kind: 'image', src: '/qcli/admin/icons/jobs.png' });
  });

  it('never uses other schemes or long text as an icon', () => {
    for (const icon of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '//evil.example.com/a.png', 'a whole sentence here']) {
      expect(resolveModuleIcon(icon, 'acme')).toEqual({ kind: 'text', text: DEFAULT_PLUGIN_ICON });
    }
  });

  it('falls back to the icon of a known package, then to the default', () => {
    expect(resolveModuleIcon(null, 'Qodalis.Cli.Plugin.Users', 'Users')).toEqual({ kind: 'text', text: '👥' });
    expect(resolveModuleIcon('', 'jobs')).toEqual({ kind: 'text', text: '⏱️' });
    expect(resolveModuleIcon(undefined, '@acme/cli-server-plugin-billing', 'Billing')).toEqual({ kind: 'text', text: DEFAULT_PLUGIN_ICON });
    expect(resolveModuleIcon(undefined)).toEqual({ kind: 'text', text: DEFAULT_PLUGIN_ICON });
  });

  it("prefers the server's icon to the built-in one", () => {
    expect(resolveModuleIcon('🧑‍💼', 'users')).toEqual({ kind: 'text', text: '🧑‍💼' });
  });
});

describe('knownPluginIcon', () => {
  it('knows a package by its .NET, Node or Python id or name', () => {
    for (const name of [
      'Qodalis.Cli.Plugin.DataExplorer.Sql',
      '@qodalis/cli-server-plugin-data-explorer-sql',
      'qodalis-cli-server-plugin-data-explorer-sql',
      'DataExplorer.Sql',
      'Data Explorer Sql',
    ]) {
      expect(knownPluginIcon(name)).toBe('🪶');
    }
  });

  it('knows the core server of every platform', () => {
    for (const name of ['Qodalis.Cli', '@qodalis/cli-server-node', 'qodalis-cli-server', 'Core']) {
      expect(knownPluginIcon(name)).toBe('🖥️');
    }
  });

  it('knows the first-party command modules', () => {
    expect(knownPluginIcon('weather')).toBe('🌤️');
    expect(knownPluginIcon('aws')).toBe('☁️');
    expect(knownPluginIcon('filesystem')).toBe('📁');
  });

  it('takes the first known name and skips empty ones', () => {
    expect(knownPluginIcon(undefined, '', 'acme', 'Audit.EfCore', 'audit')).toBe('🗄️');
    expect(knownPluginIcon('acme', null)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('reduces a name to its key', () => {
    expect(pluginKey('Qodalis.Cli.Plugin.FileSystem.S3')).toBe('filesystems3');
    expect(pluginKey('@qodalis/cli-server-plugin-filesystem-s3')).toBe('filesystems3');
    expect(pluginKey('  Logs.Seq ')).toBe('logsseq');
  });

  it('recognizes icon URLs', () => {
    expect(isIconUrl('http://x.test/i.png')).toBe(true);
    expect(isIconUrl('/i.png')).toBe(true);
    expect(isIconUrl('/\\evil')).toBe(false);
    expect(isIconUrl('i.png')).toBe(false);
  });
});
