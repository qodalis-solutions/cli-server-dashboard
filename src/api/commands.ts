import { apiFetch } from './client';
import type { CommandDescriptor } from '../types';

export function getCommands(): Promise<CommandDescriptor[]> {
  return apiFetch<CommandDescriptor[]>('/api/v1/qcli/commands');
}
