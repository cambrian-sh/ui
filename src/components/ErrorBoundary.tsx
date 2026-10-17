import { Component, ReactNode, ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * When this value changes, a caught error is cleared. The shell passes the
   * route path, so a screen that crashed does not keep every other screen
   * blank until the window is reloaded.
   */
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetKey?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div role="alert" className="flex h-full w-full items-center justify-center p-8">
          <div className="flex max-w-md flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle aria-hidden="true" size={18} className="shrink-0 text-[var(--status-err)]" />
              <h2 className="text-base font-semibold text-[var(--fg-primary)]">
                This screen stopped working
              </h2>
            </div>
            <p className="text-sm text-[var(--fg-secondary)]">
              The rest of Cambrian Studio is unaffected — you can keep using the sidebar. The
              error was:
            </p>
            <pre className="whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--fg-primary)]">
              {this.state.error?.message || "An unexpected error occurred."}
            </pre>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-1 self-start rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--list-row-bg-hover)]"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
