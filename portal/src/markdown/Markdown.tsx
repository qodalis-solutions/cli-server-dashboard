import { useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Link } from 'react-router';
import { LANGUAGES } from './languages';
import { rehypeHeadingIds } from './headings';
import { internalPath } from './links';

const REMARK = [remarkGfm];
const REHYPE = [rehypeHeadingIds, [rehypeHighlight, { languages: LANGUAGES, detect: false }]] as const;

function MarkdownLink({ href, title, children }: { href?: string; title?: string; children?: ReactNode }) {
  // An unsafe target (javascript:, data:, ...) was emptied by react-markdown's URL filter
  if (!href) return <span>{children}</span>;
  const inside = internalPath(href);
  if (inside !== null) return <Link to={inside} title={title}>{children}</Link>;
  if (/^https?:\/\//i.test(href)) {
    return <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <a href={href} title={title}>{children}</a>;
}

/** A fenced block with a copy button. */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pre.current?.textContent ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard refused (insecure context, permissions): nothing to do
    }
  };
  return (
    <div className="qp-code group relative">
      <pre ref={pre}>{children}</pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 rounded-md text-[11px] font-medium border border-border bg-popover text-muted hover:text-text opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const COMPONENTS: Components = {
  a: ({ href, title, children }) => <MarkdownLink href={href} title={title}>{children}</MarkdownLink>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => (
    <div className="qp-table">
      <table>{children}</table>
    </div>
  ),
};

/**
 * Markdown from the server, rendered safely: raw HTML is skipped (never parsed into the page), link and image
 * targets go through react-markdown's URL filter (http(s), mailto and relative only), relative links stay inside the
 * portal, and fenced code is highlighted.
 */
export default function Markdown({ markdown, className = '' }: { markdown: string; className?: string }) {
  return (
    <div className={`qp-prose ${className}`}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE as never}
        components={COMPONENTS}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
