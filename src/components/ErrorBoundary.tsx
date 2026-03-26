import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          padding: 32,
          fontFamily: "system-ui, sans-serif",
          color: "#c9d1d9",
          background: "#0d1117",
        }}>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: "#8b949e", maxWidth: 480, textAlign: "center" }}>
            An unexpected error occurred. Your work has been auto-saved.
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 12,
              color: "#f85149",
              background: "#161b22",
              padding: "12px 16px",
              borderRadius: 6,
              maxWidth: 600,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 20px",
              background: "#238636",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
