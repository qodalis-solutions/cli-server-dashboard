import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a page that fails to render from taking the navigation down with it. The portal's own (English) version of
 * the dashboard's ErrorBoundary, which reads its texts from the dashboard's translations.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[portal] page failed to render', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="p-6 rounded-xl border border-error/30 bg-error/[0.06]">
        <div className="text-sm font-medium text-error">This page failed to load</div>
        <div className="mt-1 text-xs text-error/70 font-mono break-all">{error.message || String(error)}</div>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 text-xs px-3 py-1 rounded-md border border-border text-text hover:bg-control"
        >
          Retry
        </button>
      </div>
    );
  }
}
