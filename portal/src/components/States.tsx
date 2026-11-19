/** Shared page states: loading placeholder and error box. */

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 animate-pulse">
      <span className="sr-only">{label}</span>
      <div className="h-8 w-2/3 rounded-md bg-control" />
      <div className="h-4 w-full rounded bg-control" />
      <div className="h-4 w-11/12 rounded bg-control" />
      <div className="h-4 w-4/5 rounded bg-control" />
    </div>
  );
}

export function ErrorBox({ title, error }: { title: string; error: Error }) {
  return (
    <div role="alert" className="p-4 rounded-lg border border-error/30 bg-error/[0.06]">
      <div className="text-sm font-medium text-error">{title}</div>
      <div className="mt-1 text-xs text-error/80 font-mono break-all">{error.message || String(error)}</div>
    </div>
  );
}
