import { apiFetch } from './client';
import type { FsEntry } from '../types';

export async function listDir(path: string): Promise<FsEntry[]> {
  // Servers answer { entries: [...] } (entries carry no path); older builds returned a bare array
  const res = await apiFetch<FsEntry[] | { entries?: Array<Omit<FsEntry, 'path'> & { path?: string }> }>(
    `/api/qcli/fs/ls?path=${encodeURIComponent(path)}`,
  );
  const entries = Array.isArray(res) ? res : res?.entries ?? [];
  const dir = path.endsWith('/') ? path : `${path}/`;
  return entries.map((e) => ({ ...e, path: e.path ?? `${dir}${e.name}` }));
}

export async function readFile(path: string): Promise<string> {
  // Servers answer { content }; older builds returned the text itself
  const res = await apiFetch<string | { content?: string }>(`/api/qcli/fs/cat?path=${encodeURIComponent(path)}`);
  return typeof res === 'string' ? res : res?.content ?? '';
}

export function statFile(path: string): Promise<FsEntry> {
  return apiFetch<FsEntry>(`/api/qcli/fs/stat?path=${encodeURIComponent(path)}`);
}

export function uploadFile(path: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);
  return apiFetch<void>('/api/qcli/fs/upload', {
    method: 'POST',
    body: formData,
  });
}

export function createDir(path: string): Promise<void> {
  return apiFetch<void>('/api/qcli/fs/mkdir', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export function deleteEntry(path: string): Promise<void> {
  return apiFetch<void>(`/api/qcli/fs/rm?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}
