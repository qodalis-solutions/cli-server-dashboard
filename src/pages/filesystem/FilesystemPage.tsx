import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Breadcrumb from '../../components/Breadcrumb';
import DataTable from '../../components/DataTable';
import MonoPanel from '../../components/MonoPanel';
import Modal from '../../components/Modal';
import { listDir, readFile, uploadFile, createDir, deleteEntry } from '../../api/filesystem';
import type { FsEntry } from '../../types';

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function FilesystemPage() {
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

  // Fetch directory listing when path changes
  useEffect(() => {
    setLoadingDir(true);
    setDirError(null);
    setFileContent(null);
    listDir(currentPath)
      .then(data => setEntries(data))
      .catch(err => setDirError(err instanceof Error ? err.message : 'Failed to list directory'))
      .finally(() => setLoadingDir(false));
  }, [currentPath]);

  function navigate(path: string) {
    setCurrentPath(path);
  }

  async function handleEntryClick(entry: FsEntry) {
    if (entry.type === 'directory') {
      navigate(entry.path);
    } else {
      setFileLoading(true);
      setFileContent(null);
      setFileTitle(entry.name);
      try {
        const content = await readFile(entry.path);
        setFileContent(typeof content === 'string' ? content.split('\n') : [JSON.stringify(content)]);
      } catch (err) {
        setFileContent([`Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`]);
      } finally {
        setFileLoading(false);
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
      const data = await listDir(currentPath);
      setEntries(data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
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
      const data = await listDir(currentPath);
      setEntries(data);
      setCreateDirOpen(false);
      setNewDirName('');
    } catch (err) {
      setCreateDirError(err instanceof Error ? err.message : 'Failed to create directory');
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
      const data = await listDir(currentPath);
      setEntries(data);
      setDeleteTarget(null);
      if (fileTitle === deleteTarget.name) setFileContent(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function getDownloadUrl(path: string) {
    const base = (window as Window & { __CLI_SERVER_BASE__?: string }).__CLI_SERVER_BASE__ ?? '';
    return `${base}/api/qcli/fs/download?path=${encodeURIComponent(path)}`;
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (entry: FsEntry) => (
        <div className="flex items-center gap-2">
          <span className="text-base">{entry.type === 'directory' ? '📁' : '📄'}</span>
          <span className={`text-sm ${entry.type === 'directory' ? 'text-indigo-300 font-medium' : 'text-slate-300'}`}>
            {entry.name}
          </span>
        </div>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (entry: FsEntry) => (
        <span className="text-xs text-slate-400 font-mono">
          {entry.type === 'directory' ? '—' : formatSize(entry.size)}
        </span>
      ),
    },
    {
      key: 'modified',
      header: 'Modified',
      render: (entry: FsEntry) => (
        <span className="text-xs text-slate-400">{relativeTime(entry.modified)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (entry: FsEntry) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {entry.type === 'file' && (
            <a
              href={getDownloadUrl(entry.path)}
              download={entry.name}
              className="px-2 py-1 text-[11px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded transition-colors"
            >
              Download
            </a>
          )}
          <button
            onClick={() => setDeleteTarget(entry)}
            className="px-2 py-1 text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Filesystem"
        subtitle="Browse and manage server files"
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
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={() => { setCreateDirOpen(true); setNewDirName(''); setCreateDirError(null); }}
              className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              New Folder
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
            Upload error: {uploadError}
          </div>
        )}

        {loadingDir && <div className="text-slate-400 text-sm">Loading...</div>}
        {dirError && (
          <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            {dirError}
          </div>
        )}

        {!loadingDir && !dirError && (
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
            title={fileLoading ? 'Loading...' : fileTitle}
            lines={fileLoading ? ['Loading file content...'] : (fileContent ?? [])}
            maxLines={1000}
          />
        )}
      </div>

      {/* Create Directory Modal */}
      <Modal
        open={createDirOpen}
        onClose={() => setCreateDirOpen(false)}
        title="New Folder"
        actions={
          <>
            <button
              onClick={() => setCreateDirOpen(false)}
              className="px-4 py-2 text-sm bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateDir}
              disabled={creating || !newDirName.trim()}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </>
        }
      >
        <input
          type="text"
          placeholder="Folder name"
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
        title="Confirm Delete"
        actions={
          <>
            <button
              onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
              className="px-4 py-2 text-sm bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete{' '}
          <span className="font-mono text-white">{deleteTarget?.name}</span>?
          {deleteTarget?.type === 'directory' && ' This will remove the directory and all its contents.'}
        </p>
        {deleteError && <p className="text-red-400 text-xs mt-2">{deleteError}</p>}
      </Modal>
    </div>
  );
}
