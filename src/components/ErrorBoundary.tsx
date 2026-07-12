import { Component, ReactNode, ErrorInfo } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--bg-surface)] text-[var(--fg-primary)] p-8">
          <div className="flex max-w-md flex-col gap-4 rounded-lg border border-[var(--border-subtle)] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[var(--status-err)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h2 className="text-lg font-semibold text-[var(--fg-primary)]">Something went wrong</h2>
            </div>
            <p className="text-sm text-[var(--fg-muted)]">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={this.handleDismiss}
              className="mt-2 self-end rounded px-4 py-2 text-sm font-medium border border-[var(--border-subtle)] hover:bg-[var(--bg-canvas)] transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
