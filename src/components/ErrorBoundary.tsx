import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** What failed, shown in the fallback (e.g. "Commands table") */
  label?: string;
  /** `page`: large fallback for a whole page; `section` (default): inline box for one widget */
  variant?: 'page' | 'section';
}

interface State {
  error: Error | null;
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

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const page = this.props.variant === 'page';
    return (
      <div
        role="alert"
        className={
          page
            ? 'm-6 p-6 rounded-xl border border-red-500/30 bg-red-500/[0.06]'
            : 'p-4 rounded-lg border border-red-500/30 bg-red-500/[0.06]'
        }
      >
        <div className="text-sm font-medium text-red-300">
          {page ? 'This page failed to load' : `${this.props.label ?? 'This section'} failed to render`}
        </div>
        <div className="mt-1 text-xs text-red-200/70 font-mono break-all">{error.message || String(error)}</div>
        <button
          onClick={this.retry}
          className="mt-3 text-xs px-3 py-1 rounded-md border border-white/10 text-slate-300 hover:bg-white/[0.06]"
        >
          Retry
        </button>
      </div>
    );
  }
}
