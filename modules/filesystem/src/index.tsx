import './styles.css';
import { useEffect, useRef, useState } from 'react';
import {
  ButtonGroup,
  ConfirmDialog,
  DataTable,
  DeleteIcon,
  DownloadIcon,
  ErrorState,
  Modal,
  MonoPanel,
  PageHeader,
  Skeleton,
  SkeletonTable,
  SkeletonText,
  defineExtension,
  useApi,
  useDashboard,
  useLiveReload,
  useTranslations,
} from '@qodalis/cli-server-dashboard-kit';
import { createDir, deleteEntry, downloadFile, listDir, pathIn, readFile, uploadFile, type FsEntry } from './api';
import Breadcrumb from './Breadcrumb';
import { fsChangeAffects } from './fsChanges';
import { messages } from './messages';
import { SERVER_PLUGIN } from './serverPlugin';

/** The folder in the extension's path (`/?path=/reports`); the root without one. */
export function folderOf(path: string): string {
  const query = path.split('#')[0].split('?')[1] ?? '';
  return new URLSearchParams(query).get('path') || '/';
}

/** The server's files: browse folders, read, upload, download, create folders and delete. */
function FilesystemPage() {
  const { t, formatNumber, formatRelative } = useTranslations(messages);
  const api = useApi();
  const { path, navigate: navigateTo, fetch } = useDashboard();

  function formatSize(bytes: number): string {
    if (bytes === 0) return '—';
    const units: Array<[string, number, number]> = [['GB', 1024 ** 3, 2], ['MB', 1024 ** 2, 1], ['KB', 1024, 1]];
    for (const [unit, size, digits] of units) {
      if (bytes >= size) {
        return `${formatNumber(bytes / size, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
      }
    }
    return `${formatNumber(bytes)} B`;
  }

  // The folder lives in the URL: reloading or sharing keeps it, and Back returns to the previous folder
  const currentPath = folderOf(path);
  const setCurrentPath = (folder: string) => navigateTo(folder === '/' ? '/' : `/?path=${encodeURIComponent(folder)}`);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);
  // Retry after a failed listing lists the folder again
  const [attempt, setAttempt] = useState(0);

  const [fileContent, setFileContent] = useState<string[] | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  const [createDirOpen, setCreateDirOpen] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [createDirError, setCreateDirError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FsEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Latest file preview request: a slower earlier read must not replace it
  const fileRequestRef = useRef(0);
  // Latest directory listing request, and the folder currently shown: a refresh
  // after an action must list the folder the user is in now, not the one the
  // action started in.
  const dirRequestRef = useRef(0);
  const currentPathRef = useRef(currentPath);

  // Another folder: show it loading, without the previous folder's error or preview
  const [shownPath, setShownPath] = useState<string | null>(null);
  if (shownPath !== currentPath) {
    setShownPath(currentPath);
    setLoadingDir(true);
    setDirError(null);
    setFileContent(null);
    setFileLoading(false);
  }

  // Fetch directory listing when path changes
  useEffect(() => {
    let stale = false;
    currentPathRef.current = currentPath;
    dirRequestRef.current++; // drop a refresh still loading for the previous directory
    fileRequestRef.current++; // drop a preview still loading for the previous directory
    listDir(api, currentPath)
      .then(data => { if (!stale) setEntries(data); })
      // '' = failed without a server message (shown as the translated generic text)
      .catch(err => { if (!stale) setDirError(err instanceof Error ? err.message : ''); })
      .finally(() => { if (!stale) setLoadingDir(false); });
    return () => { stale = true; };
  }, [api, currentPath, attempt]);

  async function refreshCurrentDir() {
    const path = currentPathRef.current;
    const request = ++dirRequestRef.current;
    const data = await listDir(api, path);
    if (request === dirRequestRef.current && path === currentPathRef.current) setEntries(data);
  }

  // Changed by someone else (another tab, the terminal, MCP): list the folder again, keeping the rows until then
  useLiveReload('fs:changed', async () => {
    const path = currentPathRef.current;
    const request = ++dirRequestRef.current;
    try {
      const data = await listDir(api, path);
      if (request !== dirRequestRef.current || path !== currentPathRef.current) return;
      setEntries(data);
      setDirError(null);
    } catch (err) {
      // The folder itself was deleted or moved
      if (request === dirRequestRef.current && path === currentPathRef.current) setDirError(err instanceof Error ? err.message : '');
    }
  }, { filter: event => fsChangeAffects(currentPathRef.current, event) });

  function navigate(folder: string) {
    setCurrentPath(folder);
  }

  async function handleEntryClick(entry: FsEntry) {
    if (entry.type === 'directory') {
      navigate(entry.path);
    } else {
      const request = ++fileRequestRef.current;
      setFileLoading(true);
      setFileContent(null);
      setFileTitle(entry.name);
      try {
        const content = await readFile(api, entry.path);
        if (request !== fileRequestRef.current) return;
        setFileContent(typeof content === 'string' ? content.split('\n') : [JSON.stringify(content)]);
      } catch (err) {
        if (request !== fileRequestRef.current) return;
        setFileContent([t('filesystem.readError', { message: err instanceof Error ? err.message : t('filesystem.unknownError') })]);
      } finally {
        if (request === fileRequestRef.current) setFileLoading(false);
      }
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadFile(fetch, currentPath, file);
      await refreshCurrentDir();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('filesystem.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleCreateDir() {
    if (!newDirName.trim()) return;
    setCreating(true);
    setCreateDirError(null);
    try {
      const fullPath = pathIn(currentPath, newDirName);
      await createDir(api, fullPath);
      await refreshCurrentDir();
      setCreateDirOpen(false);
      setNewDirName('');
    } catch (err) {
      setCreateDirError(err instanceof Error ? err.message : t('filesystem.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEntry(api, deleteTarget.path);
      await refreshCurrentDir();
      setDeleteTarget(null);
      if (fileTitle === deleteTarget.name) setFileContent(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('filesystem.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleDownload(filePath: string, filename: string) {
    try {
      const blob = await downloadFile(fetch, filePath);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Download failed silently
    }
  }

  const columns = [
    {
      key: 'name',
      header: t('filesystem.colName'),
      render: (entry: FsEntry) => (
        <div className="flex items-center gap-2">
          <span className="text-base" role="img" aria-label={entry.type === 'directory' ? t('filesystem.folder') : t('filesystem.file')}>{entry.type === 'directory' ? '📁' : '📄'}</span>
          <span className={`text-sm ${entry.type === 'directory' ? 'text-accent font-medium' : 'text-text'}`}>
            {entry.name}
          </span>
        </div>
      ),
    },
    {
      key: 'size',
      header: t('filesystem.colSize'),
      render: (entry: FsEntry) => (
        <span className="text-xs text-muted font-mono">
          {entry.type === 'directory' ? '—' : formatSize(entry.size)}
        </span>
      ),
    },
    {
      key: 'modified',
      header: t('filesystem.colModified'),
      render: (entry: FsEntry) => (
        <span className="text-xs text-muted">{formatRelative(entry.modified)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (entry: FsEntry) => (
        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
          <ButtonGroup
            label={t('filesystem.rowActions', { name: entry.name })}
            labels="xl"
            items={[
              ...(entry.type === 'file' ? [{
                key: 'download', label: t('filesystem.download'), icon: <DownloadIcon />, tone: 'primary' as const,
                onClick: () => handleDownload(entry.path, entry.name),
              }] : []),
              { key: 'delete', label: t('filesystem.delete'), icon: <DeleteIcon />, tone: 'danger', onClick: () => setDeleteTarget(entry) },
            ]}
          />
        </div>
      ),
    },
  ];

  // The file name is rendered in its own styled span inside the translated sentence.
  const [confirmBefore, confirmAfter = ''] = t('filesystem.confirmDelete').split('{name}');

  return (
    <div>
      <PageHeader
        title={t('filesystem.title')}
        subtitle={t('filesystem.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-accent rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? t('filesystem.uploading') : t('filesystem.upload')}
            </button>
            <button
              onClick={() => { setCreateDirOpen(true); setNewDirName(''); setCreateDirError(null); }}
              className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
            >
              {t('filesystem.newFolder')}
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4">
        <div className="bg-surface border border-border rounded-xl px-4 py-3">
          <Breadcrumb path={currentPath} onNavigate={navigate} />
        </div>

        {uploadError && (
          <div className="text-error text-sm p-3 bg-error/10 border border-error/20 rounded-lg">
            {t('filesystem.uploadError', { message: uploadError })}
          </div>
        )}

        {loadingDir && <SkeletonTable rows={6} columns={columns.length} label={t('filesystem.loading')} />}
        {dirError !== null && (
          <ErrorState
            title={dirError ? undefined : t('filesystem.listFailed')}
            error={dirError || undefined}
            onRetry={() => { setLoadingDir(true); setDirError(null); setAttempt(n => n + 1); }}
          />
        )}

        {!loadingDir && dirError === null && (
          <DataTable
            columns={columns}
            data={entries}
            keyExtractor={entry => entry.path}
            onRowClick={handleEntryClick}
          />
        )}

        {/* File Content Viewer */}
        {fileLoading && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-border/75"><Skeleton className="h-3.5 w-40" /></div>
            <SkeletonText lines={6} label={t('filesystem.loadingFile')} className="p-4" />
          </div>
        )}
        {fileContent !== null && !fileLoading && (
          <MonoPanel
            title={fileLoading ? t('filesystem.loading') : fileTitle}
            lines={fileLoading ? [t('filesystem.loadingFile')] : (fileContent ?? [])}
            maxLines={1000}
          />
        )}
      </div>

      {/* Create Directory Modal */}
      <Modal
        open={createDirOpen}
        onClose={() => setCreateDirOpen(false)}
        title={t('filesystem.newFolder')}
        actions={
          <>
            <button
              onClick={() => setCreateDirOpen(false)}
              className="px-4 py-2 text-sm bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
            >
              {t('filesystem.cancel')}
            </button>
            <button
              onClick={handleCreateDir}
              disabled={creating || !newDirName.trim()}
              className="px-4 py-2 text-sm bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? t('filesystem.creating') : t('filesystem.create')}
            </button>
          </>
        }
      >
        <input
          type="text"
          placeholder={t('filesystem.folderName')}
          aria-label={t('filesystem.folderName')}
          value={newDirName}
          onChange={e => setNewDirName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreateDir(); }}
          autoFocus
          className="w-full px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50"
        />
        {createDirError && <p className="text-error text-xs mt-2">{createDirError}</p>}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('filesystem.confirmDeleteTitle')}
        message={
          <p>
            {confirmBefore}
            <span className="font-mono text-heading">{deleteTarget?.name}</span>
            {confirmAfter}
            {deleteTarget?.type === 'directory' && ` ${t('filesystem.deleteDirNote')}`}
          </p>
        }
        confirmLabel={t('filesystem.delete')}
        busyLabel={t('filesystem.deleting')}
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
      />
    </div>
  );
}

export default defineExtension(FilesystemPage, { serverPlugin: SERVER_PLUGIN });
