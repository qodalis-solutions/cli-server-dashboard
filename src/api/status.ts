import { apiFetch } from './client';
import type { ServerStatusResponse, CapabilitiesResponse, StatusHistoryResponse } from '../types';

export function getStatus(): Promise<ServerStatusResponse> {
  return apiFetch<ServerStatusResponse>('/api/v1/qcli/status');
}

export function getCapabilities(): Promise<CapabilitiesResponse> {
  return apiFetch<CapabilitiesResponse>('/api/v1/qcli/capabilities');
}

/** The admin plugin's samples of the status, oldest first (servers since 1.0.0-beta.19). */
export function getStatusHistory(minutes = 60): Promise<StatusHistoryResponse> {
  return apiFetch<StatusHistoryResponse>(`/api/v1/qcli/status/history?minutes=${minutes}`);
}
