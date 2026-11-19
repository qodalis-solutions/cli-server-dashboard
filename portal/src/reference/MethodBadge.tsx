const COLORS: Record<string, string> = {
  get: 'bg-info/15 text-info border-info/30',
  post: 'bg-success/15 text-success border-success/30',
  put: 'bg-warning/15 text-warning border-warning/30',
  patch: 'bg-warning/15 text-warning border-warning/30',
  delete: 'bg-error/15 text-error border-error/30',
};

/** The HTTP method as a small coloured label (GET blue, POST green, PUT/PATCH amber, DELETE red). */
export default function MethodBadge({ method, small = false }: { method: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded border font-mono font-bold uppercase tracking-wide ${
        small ? 'min-w-[2.75rem] px-1 text-[9px] leading-4' : 'px-2 py-0.5 text-xs'
      } ${COLORS[method.toLowerCase()] ?? 'bg-subtle/15 text-muted border-subtle/30'}`}
    >
      {method.toUpperCase()}
    </span>
  );
}
