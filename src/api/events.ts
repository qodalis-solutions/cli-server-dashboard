import { apiFetch } from './client';
import type { WsClientsResponse } from '../types';

export function getWsClients(): Promise<WsClientsResponse> {
  return apiFetch<WsClientsResponse>('/api/v1/qcli/ws/clients');
}
