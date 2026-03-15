import { apiFetch } from './client';
import type { PluginsListResponse, PluginToggleResponse } from '../types';

export function getPlugins(): Promise<PluginsListResponse> {
  return apiFetch<PluginsListResponse>('/api/v1/qcli/plugins');
}

export function togglePlugin(id: string): Promise<PluginToggleResponse> {
  return apiFetch<PluginToggleResponse>(`/api/v1/qcli/plugins/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
  });
}
