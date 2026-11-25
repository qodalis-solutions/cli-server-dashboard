import { Skeleton, SkeletonGroup } from '@qodalis/cli-server-dashboard-kit';

/** Places of plugin cards (icon, name, description) while the plugins load. */
export default function PluginCardsSkeleton({ count, label }: { count: number; label?: string }) {
  return (
    <SkeletonGroup label={label} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
