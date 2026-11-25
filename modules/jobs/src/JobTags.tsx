import { ChipList, tagStyle } from '@qodalis/cli-server-dashboard-kit';

const TAG = 'px-2 py-0.5 text-[11px] leading-4 font-mono rounded-full border';

/**
 * A job's tags as small chips, each in its own color (servers 1.0.0-beta.25). With `max`, the first `max` tags, the
 * others behind +N more in a dialog titled `title`.
 */
export default function JobTags({ tags, className = 'mt-1', max, title, label }: {
  tags: string[];
  className?: string;
  max?: number;
  title?: string;
  label?: string;
}) {
  if (max !== undefined) {
    return (
      <ChipList
        items={tags.map(tag => ({ key: tag, label: tag, render: `#${tag}`, style: tagStyle(tag) }))}
        max={max}
        title={title}
        label={label}
        className={className}
        chipClassName={TAG}
      />
    );
  }
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map(tag => (
        <span key={tag} style={tagStyle(tag)} className={TAG}>
          #{tag}
        </span>
      ))}
    </div>
  );
}
