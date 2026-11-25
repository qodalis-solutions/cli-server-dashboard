import { SkeletonPage } from '@qodalis/cli-server-dashboard-kit';

/** Placeholder of a page while its code or its first data loads: a header and a table. */
export default function PageSkeleton({ columns, rows, label }: { columns?: number; rows?: number; label?: string }) {
  return (
    <div className="p-4 sm:p-6">
      <SkeletonPage columns={columns} rows={rows} label={label} />
    </div>
  );
}

/** Placeholder of the whole app (sidebar and page) while the session is checked. */
export function AppSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div aria-hidden className="hidden lg:block w-[220px] flex-shrink-0 bg-sidebar border-r border-border/75" />
      <div className="flex-1 min-w-0">
        <PageSkeleton />
      </div>
    </div>
  );
}
