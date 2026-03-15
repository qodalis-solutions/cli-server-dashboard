interface Props {
  path: string;
  onNavigate: (path: string) => void;
}

export default function Breadcrumb({ path, onNavigate }: Props) {
  const segments = path === '/' ? [] : path.split('/').filter(Boolean);

  function buildPath(idx: number) {
    if (idx === -1) return '/';
    return '/' + segments.slice(0, idx + 1).join('/');
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-slate-400 flex-wrap">
      <button
        onClick={() => onNavigate('/')}
        className="hover:text-white transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-white/[0.06]"
      >
        /
      </button>
      {segments.map((seg, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <span className="text-slate-600">/</span>
          <button
            onClick={() => onNavigate(buildPath(idx))}
            className={`hover:text-white transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-white/[0.06] ${
              idx === segments.length - 1 ? 'text-white' : ''
            }`}
          >
            {seg}
          </button>
        </span>
      ))}
    </nav>
  );
}
