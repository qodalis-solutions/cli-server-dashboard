import { tagStyle } from '../../theme/tagColors';

/** A job's tags as small chips, each in its own color (servers 1.0.0-beta.25). */
export default function JobTags({ tags, className = 'mt-1' }: { tags: string[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map(tag => (
        <span key={tag} style={tagStyle(tag)} className="px-2 py-0.5 text-[11px] leading-4 font-mono rounded-full border">
          #{tag}
        </span>
      ))}
    </div>
  );
}
