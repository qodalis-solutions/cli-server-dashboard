import { ApiError, responseErrorText, type ExtensionApi } from '@qodalis/cli-server-dashboard-kit';

/** The filesystem API of the server (`/api/qcli/fs`), the same on the three servers. */
export const FS_API = '/api/qcli/fs';

export interface FsEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

type Fetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function listDir(api: ExtensionApi, path: string): Promise<FsEntry[]> {
  // Servers answer { entries: [...] } (entries carry no path); older builds returned a bare array
  const res = await api.get<FsEntry[] | { entries?: Array<Omit<FsEntry, 'path'> & { path?: string }> }>(
    `${FS_API}/ls?path=${encodeURIComponent(path)}`,
  );
  const entries = Array.isArray(res) ? res : res?.entries ?? [];
  const dir = path.endsWith('/') ? path : `${path}/`;
  return entries.map((e) => ({ ...e, path: e.path ?? `${dir}${e.name}` }));
}

export async function readFile(api: ExtensionApi, path: string): Promise<string> {
  // Servers answer { content }; older builds returned the text itself
  const res = await api.get<string | { content?: string }>(`${FS_API}/cat?path=${encodeURIComponent(path)}`);
  return typeof res === 'string' ? res : res?.content ?? '';
}

/** A file's path in a folder: `/` + name at the root, `<folder>/<name>` elsewhere. */
export function pathIn(folder: string, name: string): string {
  const base = folder.replace(/\/+$/, '');
  return `${base}/${name}`;
}

/** The server's `error` text of a failed response, else its status. */
async function failure(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // not JSON: an HTML or text page
  }
  return new ApiError(res.status, responseErrorText(res.status, res.statusText, text), body);
}

/**
 * Uploads a file into `folder`. The servers take the file's full path (folder and file name), so a folder alone is
 * refused (400 on .NET, an error on Node and Python). Sent as multipart: the browser sets the boundary header.
 */
export async function uploadFile(fetch: Fetch, folder: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('path', pathIn(folder, file.name));
  const res = await fetch(`${FS_API}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw await failure(res);
}

export function createDir(api: ExtensionApi, path: string): Promise<void> {
  return api.post<void>(`${FS_API}/mkdir`, { path });
}

export function deleteEntry(api: ExtensionApi, path: string): Promise<void> {
  return api.del<void>(`${FS_API}/rm?path=${encodeURIComponent(path)}`);
}

/** The file's bytes, for a download (with the dashboard's credentials). */
export async function downloadFile(fetch: Fetch, path: string): Promise<Blob> {
  const res = await fetch(`${FS_API}/download?path=${encodeURIComponent(path)}`, { headers: { Accept: '*/*' } });
  if (!res.ok) throw await failure(res);
  return res.blob();
}
