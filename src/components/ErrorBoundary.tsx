import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  declare props: Props;
  declare setState: (state: Partial<State>) => void;
  state: State = { hasError: false };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App ErrorBoundary caught error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = '/home';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07152b] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
            <AlertTriangle size={28} />
          </div>
          <h2 className="text-lg font-black uppercase tracking-tight mb-2">FX Arena Recovery</h2>
          <p className="text-xs text-slate-300 max-w-xs mb-6 leading-relaxed">
            A display glitch occurred. Tap below to restore your screen smoothly.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider shadow-lg"
          >
            <RefreshCw size={15} />
            <span>Reload App</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
