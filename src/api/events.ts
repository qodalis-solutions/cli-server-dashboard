import { apiFetch } from './client';
import type { WsClientInfo, WsClientsResponse } from '../types';

/** The connected event clients. Node and Python send the list; .NET sends `{ clients, total }`. */
export function wsClientsOf(response: WsClientsResponse | { clients?: WsClientInfo[] } | null | undefined): WsClientInfo[] {
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.clients) ? response.clients : [];
}

export async function getWsClients(): Promise<WsClientsResponse> {
  return wsClientsOf(await apiFetch<unknown>('/api/v1/qcli/ws/clients') as WsClientsResponse);
}
