import { apiFetch } from './client';
import type { ServerStatusResponse, CapabilitiesResponse } from '../types';

export function getStatus(): Promise<ServerStatusResponse> {
  return apiFetch<ServerStatusResponse>('/api/v1/qcli/status');
}

export function getCapabilities(): Promise<CapabilitiesResponse> {
  return apiFetch<CapabilitiesResponse>('/api/v1/qcli/capabilities');
}
