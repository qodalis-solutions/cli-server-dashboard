import { describe, expect, it } from 'vitest';
import { resolveFeatures } from './FeaturesContext';
import type { CapabilitiesResponse, PluginInfo, ServerStatusResponse } from '../types';

const status = (enabledFeatures?: string[]) => ({ enabledFeatures }) as ServerStatusResponse;
const caps = (shell: boolean | string, features: string[] = []) => ({ shell, features }) as CapabilitiesResponse;
const plugin = (id: string, enabled = true) => ({ id, name: id, enabled }) as PluginInfo;

describe('resolveFeatures', () => {
  it('reads jobs/filesystem from the status and the shell from capabilities', () => {
    expect(resolveFeatures(status(['jobs', 'filesystem']), caps(true), []).sort()).toEqual(['filesystem', 'jobs', 'shell']);
  });

  it('reports nothing for a server without shell, jobs or filesystem', () => {
    expect(resolveFeatures(status([]), caps(false), [plugin('Qodalis.Cli.Plugin.Jobs')])).toEqual([]);
  });

  it('falls back to the plugin list when the status has no enabledFeatures', () => {
    const plugins = [plugin('@qodalis/cli-server-plugin-jobs'), plugin('Qodalis.Cli.Plugin.FileSystem'), plugin('weather')];
    expect(resolveFeatures(status(undefined), caps(false), plugins).sort()).toEqual(['filesystem', 'jobs']);
  });

  it('ignores disabled plugins in the fallback', () => {
    expect(resolveFeatures(status(undefined), caps(false), [plugin('jobs', false)])).toEqual([]);
  });

  it('treats endpoints that failed to load as missing features', () => {
    expect(resolveFeatures(null, null, null)).toEqual([]);
  });

  it('adds probed features whose endpoint answered a list', () => {
    expect(resolveFeatures(status([]), caps(false), [], { 'data-explorer': [], tokens: null }).sort()).toEqual(['data-explorer']);
    expect(resolveFeatures(status([]), caps(false), [], { 'data-explorer': { error: 'x' }, tokens: [{ id: 't' }] })).toEqual(['tokens']);
  });
});
