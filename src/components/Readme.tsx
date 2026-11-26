import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REMARK = [remarkGfm];

/** http(s) only: relative links point into the package on its registry, which the dashboard cannot show. */
function isHttpUrl(href: unknown): href is string {
  return typeof href === 'string' && /^https?:\/\//i.test(href);
}

const COMPONENTS: Components = {
  a: ({ href, title, children }) =>
    isHttpUrl(href) ? (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
    ) : (
      <span>{children}</span>
    ),
  // The dashboard's CSP loads no images from other hosts (and the admin should not call them): badges and
  // screenshots become links with their alt text
  img: ({ src, alt }) =>
    isHttpUrl(src) ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">{alt || src}</a>
    ) : (
      <span>{alt}</span>
    ),
  table: ({ children }) => (
    <div className="qcli-readme-table">
      <table>{children}</table>
    </div>
  ),
};

/**
 * A plugin's readme. Markdown is rendered safely: raw HTML is skipped (never parsed into the page), link targets go
 * through react-markdown's URL filter and then the components above. Any other format (`text`, `rst`, a description
 * standing in for a readme) is shown as it is.
 */
export function Readme({ text, format }: { text: string; format?: string }) {
  const markdown = !format || format === 'markdown';
  return (
    <div
      data-testid="readme"
      className="bg-control/40 border border-border rounded-lg p-3 max-h-[28rem] overflow-y-auto text-xs text-text"
    >
      {markdown ? (
        <div className="qcli-readme">
          <ReactMarkdown skipHtml remarkPlugins={REMARK} components={COMPONENTS}>
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
      )}
    </div>
  );
}
