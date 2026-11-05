import { apiFetch } from './client';
import type { InstalledPluginDto, PluginsListResponse, PluginToggleResponse } from '../types';

export function getPlugins(): Promise<PluginsListResponse> {
  return apiFetch<PluginsListResponse>('/api/v1/qcli/plugins');
}

export function togglePlugin(id: string): Promise<PluginToggleResponse> {
  return apiFetch<PluginToggleResponse>(`/api/v1/qcli/plugins/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
  });
}

/**
 * The installed server plugin packages; null on servers that do not list them (older servers answer
 * "Plugin not found": they read `installed` as a plugin id).
 */
export async function getInstalledPlugins(): Promise<InstalledPluginDto[] | null> {
  try {
    const plugins = await apiFetch<unknown>('/api/v1/qcli/plugins/installed');
    return Array.isArray(plugins) ? (plugins as InstalledPluginDto[]) : null;
  } catch (e) {
    if (e instanceof Error && /not found/i.test(e.message)) return null;
    throw e;
  }
}
