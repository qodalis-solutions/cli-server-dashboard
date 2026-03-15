import { apiFetch } from './client';
import type { FsEntry } from '../types';

export function listDir(path: string): Promise<FsEntry[]> {
  return apiFetch<FsEntry[]>(`/api/qcli/fs/ls?path=${encodeURIComponent(path)}`);
}

export function readFile(path: string): Promise<string> {
  return apiFetch<string>(`/api/qcli/fs/cat?path=${encodeURIComponent(path)}`);
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
