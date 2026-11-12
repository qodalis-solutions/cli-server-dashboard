/** A job's tags as small chips (servers 1.0.0-beta.25). */
export default function JobTags({ tags, className = 'mt-1' }: { tags: string[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map(tag => (
        <span
          key={tag}
          className="px-1.5 py-px text-[10px] font-mono rounded-full border border-border/75 bg-surface/75 text-muted"
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}
