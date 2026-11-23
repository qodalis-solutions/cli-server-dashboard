import { useTranslations } from '@qodalis/cli-server-dashboard-kit';
import { messages } from './messages';

interface Props {
  path: string;
  onNavigate: (path: string) => void;
}

/** The folder's path as buttons: the root, then each folder down to the current one. */
export default function Breadcrumb({ path, onNavigate }: Props) {
  const { t } = useTranslations(messages);
  const segments = path === '/' ? [] : path.split('/').filter(Boolean);

  function buildPath(idx: number) {
    if (idx === -1) return '/';
    return '/' + segments.slice(0, idx + 1).join('/');
  }

  return (
    <nav aria-label={t('filesystem.breadcrumb')} className="flex items-center gap-1 text-sm text-muted flex-wrap">
      <button
        type="button"
        onClick={() => onNavigate('/')}
        title={t('filesystem.root')}
        className="hover:text-heading transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-control"
      >
        /
      </button>
      {segments.map((seg, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <span className="text-subtle">/</span>
          <button
            type="button"
            onClick={() => onNavigate(buildPath(idx))}
            className={`hover:text-heading transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-control ${
              idx === segments.length - 1 ? 'text-heading' : ''
            }`}
          >
            {seg}
          </button>
        </span>
      ))}
    </nav>
  );
}
