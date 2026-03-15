import { apiFetch } from './client';
import type { ServerConfigResponse, UpdateConfigRequest, UpdateConfigResponse } from '../types';

export function getConfig(): Promise<ServerConfigResponse> {
  return apiFetch<ServerConfigResponse>('/api/v1/qcli/config');
}

export function updateConfig(section: string, settings: UpdateConfigRequest['settings']): Promise<UpdateConfigResponse> {
  return apiFetch<UpdateConfigResponse>('/api/v1/qcli/config', {
    method: 'PUT',
    body: JSON.stringify({ section, settings } satisfies UpdateConfigRequest),
  });
}
