import Markdown from '../markdown/Markdown';

/**
 * Highlighted code through the same safe markdown pipeline as the guides: the code becomes one fenced block whose
 * fence is longer than any run of backticks inside it, so nothing in the code can end the block early.
 */
export default function CodeView({ code, language }: { code: string; language: string }) {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map(run => run.length));
  const fence = '`'.repeat(longest + 1);
  const info = /^[\w#+.-]+$/.test(language) ? language.toLowerCase() : '';
  return <Markdown markdown={`${fence}${info}\n${code}\n${fence}\n`} className="qp-code-only" />;
}
