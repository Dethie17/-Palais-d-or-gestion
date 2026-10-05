import { useState, useEffect } from 'react';
import { XCircle, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';

interface PaymentFailurePageProps {
  onNavigate?: (page: string) => void;
}

const PaymentFailurePage = ({ onNavigate }: PaymentFailurePageProps) => {
  const { user } = useAuth();
  const { myPayments } = useResto();
  const [reference, setReference] = useState<string>('');
  const [errorReason, setErrorReason] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('reference') || params.get('ref') || params.get('transaction_id') || '';
    const reason = params.get('reason') || params.get('error') || params.get('message') || '';
    setReference(ref);
    setErrorReason(reason);
  }, []);

  const handleRetry = () => {
    if (reference) {
      window.location.href = `/paiement?reference=${reference}&retry=true`;
    } else {
      window.history.back();
    }
  };

  const handleGoHome = () => onNavigate?.('home');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-red-200 p-8 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/30">
          <XCircle className="w-10 h-10 text-white" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Paiement échoué</h1>
        
        <p className="text-slate-600 mb-4">
          Le paiement n'a pas pu être finalisé. Veuillez réessayer ou contacter le gérant.
        </p>
        
        {reference && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-1">Référence transaction</p>
            <p className="font-mono font-bold text-red-900 break-all">{reference}</p>
          </div>
        )}
        
        {errorReason && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Motif
            </p>
            <p className="text-amber-900">{decodeURIComponent(errorReason)}</p>
          </div>
        )}
        
        <div className="space-y-3">
          <button onClick={handleRetry} className="btn-primary w-full py-4 flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5" /> Réessayer le paiement
          </button>
          <button onClick={handleGoHome} className="btn-secondary w-full py-4">
            Retour à l'accueil
          </button>
        </div>
        
        <p className="mt-4 text-xs text-slate-500">
          Besoin d'aide ? Contactez le gérant de la cantine.
        </p>
      </div>
    </div>
  );
};

export default PaymentFailurePage;