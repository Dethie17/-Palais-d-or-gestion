import { useEffect, useState } from 'react';
import { CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';

interface PaymentSuccessPageProps {
  onNavigate?: (page: string) => void;
}

const PaymentSuccessPage = ({ onNavigate }: PaymentSuccessPageProps) => {
  const { user } = useAuth();
  const { myPayments } = useResto();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('Vérification du paiement en cours...');
  const [reference, setReference] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('reference') || params.get('ref') || params.get('transaction_id') || '';
    setReference(ref);
    
    if (ref && user) {
      const checkPayment = setInterval(() => {
        const payments = myPayments(user.username || '');
        const payment = payments.find((p) => p.reference === ref || p.id === ref);
        if (payment && payment.status === 'paid') {
          setMessage('Paiement confirmé ! Votre commande est validée.');
          setLoading(false);
          clearInterval(checkPayment);
        }
      }, 2000);
      
      setTimeout(() => {
        if (loading) {
          setMessage('Paiement en cours de traitement. Vérifiez vos notifications InTouch.');
          setLoading(false);
        }
        clearInterval(checkPayment);
      }, 30000);
      
      return () => clearInterval(checkPayment);
    } else {
      setLoading(false);
    }
  }, [user, reference, myPayments]);

  const handleGoHome = () => onNavigate?.('home');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-emerald-200 p-8 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          {loading ? (
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          ) : (
            <CheckCircle className="w-10 h-10 text-white" />
          )}
        </div>
        
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          {loading ? 'Traitement en cours...' : 'Paiement réussi !'}
        </h1>
        
        <p className="text-slate-600 mb-6">{message}</p>
        
        {reference && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Référence transaction</p>
            <p className="font-mono font-bold text-emerald-900 break-all">{reference}</p>
          </div>
        )}
        
        <div className="space-y-3">
          <button onClick={handleGoHome} className="btn-primary w-full py-4">
            Retour à l'accueil
          </button>
          <button onClick={() => onNavigate?.('validation')} className="btn-secondary w-full py-4">
            Voir mes commandes
          </button>
        </div>
        
        <p className="mt-4 text-xs text-slate-500">
          Si vous ne voyez pas la mise à jour, rafraîchissez la page dans quelques instants.
        </p>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;