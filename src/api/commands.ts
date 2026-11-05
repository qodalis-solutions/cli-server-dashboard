import { apiFetch } from './client';
import type { CommandDescriptor, CommandStatsResponse } from '../types';

export function getCommands(): Promise<CommandDescriptor[]> {
  return apiFetch<CommandDescriptor[]>('/api/v1/qcli/commands');
}

/** Executions of each command since the server started (servers since 1.0.0-beta.19). */
export function getCommandStats(): Promise<CommandStatsResponse> {
  return apiFetch<CommandStatsResponse>('/api/v1/qcli/commands/stats');
}
