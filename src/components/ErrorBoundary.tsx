import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useOptionalI18n } from '../i18n';

interface Props {
  children: ReactNode;
  /** What failed, shown in the fallback (e.g. "Commands table") */
  label?: string;
  /** `page`: large fallback for a whole page; `section` (default): inline box for one widget */
  variant?: 'page' | 'section';
  /**
   * When any of these values changes (compared with `Object.is`), a shown error is
   * cleared and the children re-render, e.g. once the widget receives new data.
   */
  resetKeys?: unknown[];
}

interface State {
  error: Error | null;
}

function keysChanged(prev: unknown[] = [], next: unknown[] = []): boolean {
  return prev.length !== next.length || prev.some((key, i) => !Object.is(key, next[i]));
}

/**
 * Contains a render error to the part of the UI that failed: the rest of the
 * page (and the sidebar) keeps working, and "Retry" re-renders the part.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[dashboard] ${this.props.label ?? 'section'} failed to render`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props, prevState: State): void {
    // Only an error that was already shown: keys changing in the same update that
    // threw (the new data caused the error) must not reset straight into it again.
    if (this.state.error && prevState.error && keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback error={error} label={this.props.label} page={this.props.variant === 'page'} onRetry={this.retry} />;
  }
}

function ErrorFallback({ error, label, page, onRetry }: { error: Error; label?: string; page: boolean; onRetry: () => void }) {
  const i18n = useOptionalI18n();
  const text = {
    page: i18n?.t('common.pageFailed') ?? 'This page failed to load',
    section: i18n?.t('common.sectionFailed', { label: label ?? i18n.t('common.thisSection') })
      ?? `${label ?? 'This section'} failed to render`,
    retry: i18n?.t('common.retry') ?? 'Retry',
  };
  return (
    <div
      role="alert"
      className={
        page
          ? 'm-6 p-6 rounded-xl border border-red-500/30 bg-red-500/[0.06]'
          : 'p-4 rounded-lg border border-red-500/30 bg-red-500/[0.06]'
      }
    >
      <div className="text-sm font-medium text-red-300">{page ? text.page : text.section}</div>
      <div className="mt-1 text-xs text-red-200/70 font-mono break-all">{error.message || String(error)}</div>
      <button
        onClick={onRetry}
        className="mt-3 text-xs px-3 py-1 rounded-md border border-white/10 text-slate-300 hover:bg-white/[0.06]"
      >
        {text.retry}
      </button>
    </div>
  );
}
