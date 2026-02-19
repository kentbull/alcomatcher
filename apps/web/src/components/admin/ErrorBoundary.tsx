import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Admin Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: "2rem",
            background: "var(--admin-card)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "12px",
            margin: "2rem",
          }}
        >
          <h2 style={{ color: "var(--status-fail)", marginBottom: "1rem" }}>
            Something went wrong
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            className="btn-admin btn-admin--primary"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
