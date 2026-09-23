import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Filet de sécurité production : affiche un écran propre au lieu
 * d'une page blanche si un composant plante.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[O RESTO] Erreur capturée :', error, info.componentStack);
  }

  private handleReload = () => {
    sessionStorage.clear();
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50/30 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl border p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h1 className="text-xl font-black text-slate-800">Oups, un problème est survenu</h1>
          <p className="text-sm text-slate-500 mt-2">
            L&apos;application a rencontré une erreur inattendue. Vos données locales sont conservées.
          </p>
          {this.state.message && (
            <p className="mt-3 text-xs font-mono bg-slate-100 rounded-lg p-2 text-slate-600 break-all">
              {this.state.message}
            </p>
          )}
          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="px-6 py-3 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-800 transition-colors"
            >
              Recharger l&apos;application
            </button>
          </div>
        </div>
      </div>
    );
  }
}
