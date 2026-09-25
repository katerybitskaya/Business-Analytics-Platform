import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      `[ErrorBoundary] Render crash: ${error.message}`,
      Object.assign(error, {
        stack: (error.stack ?? '') + '\n\nComponent stack:' + info.componentStack,
      }),
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 32,
        }}>
          <h2 style={{ color: 'var(--danger, #e53e3e)', margin: 0 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-secondary, #666)', maxWidth: 480, textAlign: 'center', margin: 0 }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <p style={{ color: 'var(--text-secondary, #888)', fontSize: 12, margin: 0 }}>
            The error has been logged. Check browser console for details.
          </p>
          <button className="btn btn-primary" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
