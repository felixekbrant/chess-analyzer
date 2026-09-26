import { Component, type ReactNode } from 'react';

/** Keeps one broken page from blanking the whole app. Reset by changing `resetKey` (e.g. the route). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel p-6 max-w-xl">
        <h2 className="font-bold text-lg mb-2">Something went wrong on this page</h2>
        <p className="muted text-sm mb-4">Your games and analyses are safe. Try reloading; if it keeps happening, the message below helps with debugging.</p>
        <pre className="text-xs bg-[var(--panel-2)] p-3 rounded overflow-auto mb-4">{this.state.error.message}</pre>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
