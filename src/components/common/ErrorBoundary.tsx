import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Alongkar Application Error Boundary caught:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-ivory text-espresso px-4 py-12">
          <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-gold/20">
            <div className="w-16 h-16 bg-burgundy/10 text-burgundy rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="font-serif text-2xl font-bold text-espresso">
                Something went wrong
              </h2>
              <p className="text-sm text-espresso/70">
                We encountered an unexpected issue while loading the application.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-espresso/5 rounded-lg text-left text-xs font-mono text-espresso/80 overflow-x-auto max-h-32">
                {this.state.error.message || 'Unknown runtime error'}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gold text-espresso font-semibold rounded-full text-xs uppercase tracking-wider hover:bg-gold-champagne transition-all shadow-md"
              >
                <RotateCcw size={14} />
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-espresso text-ivory font-semibold rounded-full text-xs uppercase tracking-wider hover:bg-espresso/90 transition-all shadow-md"
              >
                <Home size={14} />
                Go to Homepage
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
