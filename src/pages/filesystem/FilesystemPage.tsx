import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Breadcrumb from '../../components/Breadcrumb';
import DataTable from '../../components/DataTable';
import MonoPanel from '../../components/MonoPanel';
import Modal from '../../components/Modal';
import { listDir, readFile, uploadFile, createDir, deleteEntry } from '../../api/filesystem';
import type { FsEntry } from '../../types';
import { useI18n } from '../../i18n';

export default function FilesystemPage() {
  const { t, formatNumber, formatRelative } = useI18n();

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

  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

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
    listDir(currentPath)
      .then(data => { if (!stale) setEntries(data); })
      // '' = failed without a server message (shown as the translated generic text)
      .catch(err => { if (!stale) setDirError(err instanceof Error ? err.message : ''); })
      .finally(() => { if (!stale) setLoadingDir(false); });
    return () => { stale = true; };
  }, [currentPath]);

  async function refreshCurrentDir() {
    const path = currentPathRef.current;
    const request = ++dirRequestRef.current;
    const data = await listDir(path);
    if (request === dirRequestRef.current && path === currentPathRef.current) setEntries(data);
  }

  function navigate(path: string) {
    setCurrentPath(path);
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
        const content = await readFile(entry.path);
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
      await uploadFile(currentPath, file);
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
      const fullPath = currentPath === '/' ? `/${newDirName}` : `${currentPath}/${newDirName}`;
      await createDir(fullPath);
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
      await deleteEntry(deleteTarget.path);
      await refreshCurrentDir();
      setDeleteTarget(null);
      if (fileTitle === deleteTarget.name) setFileContent(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('filesystem.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleDownload(path: string, filename: string) {
    try {
      const token = localStorage.getItem('qcli_admin_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`/api/qcli/fs/download?path=${encodeURIComponent(path)}`, { headers });
      if (!resp.ok) return;
      const blob = await resp.blob();
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
          <span className={`text-sm ${entry.type === 'directory' ? 'text-indigo-300 font-medium' : 'text-slate-300'}`}>
            {entry.name}
          </span>
        </div>
      ),
    },
    {
      key: 'size',
      header: t('filesystem.colSize'),
      render: (entry: FsEntry) => (
        <span className="text-xs text-slate-400 font-mono">
          {entry.type === 'directory' ? '—' : formatSize(entry.size)}
        </span>
      ),
    },
    {
      key: 'modified',
      header: t('filesystem.colModified'),
      render: (entry: FsEntry) => (
        <span className="text-xs text-slate-400">{formatRelative(entry.modified)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (entry: FsEntry) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {entry.type === 'file' && (
            <button
              onClick={() => handleDownload(entry.path, entry.name)}
              className="px-2 py-1 text-[11px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded transition-colors"
            >
              {t('filesystem.download')}
            </button>
          )}
          <button
            onClick={() => setDeleteTarget(entry)}
            className="px-2 py-1 text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      ),
    },
  ];

  // The file name is rendered in its own styled span inside the translated sentence.
  const [confirmBefore, confirmAfter = ''] = t('filesystem.confirmDelete').split('{name}');

  return (
    <div>
      <PageHeader
        title={t('nav.filesystem')}
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
              className="px-3 py-1.5 text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? t('filesystem.uploading') : t('filesystem.upload')}
            </button>
            <button
              onClick={() => { setCreateDirOpen(true); setNewDirName(''); setCreateDirError(null); }}
              className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              {t('filesystem.newFolder')}
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
          <Breadcrumb path={currentPath} onNavigate={navigate} />
        </div>

        {uploadError && (
          <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            {t('filesystem.uploadError', { message: uploadError })}
          </div>
        )}

        {loadingDir && <div className="text-slate-400 text-sm">{t('common.loading')}</div>}
        {dirError !== null && (
          <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            {dirError || t('filesystem.listFailed')}
          </div>
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
        {(fileContent !== null || fileLoading) && (
          <MonoPanel
            title={fileLoading ? t('common.loading') : fileTitle}
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
              className="px-4 py-2 text-sm bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreateDir}
              disabled={creating || !newDirName.trim()}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
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
          className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-white/[0.1] rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
        />
        {createDirError && <p className="text-red-400 text-xs mt-2">{createDirError}</p>}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        title={t('filesystem.confirmDeleteTitle')}
        actions={
          <>
            <button
              onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
              className="px-4 py-2 text-sm bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? t('filesystem.deleting') : t('common.delete')}
            </button>
          </>
        }
      >
        <p>
          {confirmBefore}
          <span className="font-mono text-white">{deleteTarget?.name}</span>
          {confirmAfter}
          {deleteTarget?.type === 'directory' && ` ${t('filesystem.deleteDirNote')}`}
        </p>
        {deleteError && <p className="text-red-400 text-xs mt-2">{deleteError}</p>}
      </Modal>
    </div>
  );
}
