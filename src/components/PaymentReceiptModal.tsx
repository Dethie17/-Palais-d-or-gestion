import { Printer, X } from 'lucide-react';
import type { ORestoPayment } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import OrestoLogo from './brand/OrestoLogo';

const METHOD_LABEL: Record<string, string> = {
  wave: 'Wave', cash: 'Espèces',
  mobile_money: 'Mobile Money', card: 'Carte bancaire',
  balance: 'Solde carte',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', paid: 'Payé', failed: 'Échoué', cancelled: 'Annulé', refunded: 'Remboursé',
};

interface PaymentReceiptModalProps {
  payment: ORestoPayment;
  clientName: string;
  formulaName?: string;
  onClose: () => void;
}

/**
 * Reçu de paiement O RESTO — imprimable, identique partout
 * (client, vente au comptoir, back-office).
 */
const PaymentReceiptModal = ({ payment, clientName, formulaName, onClose }: PaymentReceiptModalProps) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-14 h-14 mx-auto overflow-hidden"><OrestoLogo variant="mark" imgClassName="w-full h-full object-contain" /></div>
        <h3 className="font-extrabold text-lg mt-1"><span className="text-green-700">O</span> RESTO — Reçu</h3>
        <p className="font-mono text-sm text-slate-500">{payment.reference}</p>
        <div className="mt-4 text-sm text-left space-y-1 border-t border-dashed pt-3">
          <p className="flex justify-between"><span className="text-slate-500">Client</span><strong className="capitalize">{clientName}</strong></p>
          {formulaName && <p className="flex justify-between"><span className="text-slate-500">Objet</span><strong>{formulaName}</strong></p>}
          <p className="flex justify-between"><span className="text-slate-500">Date</span><strong>{new Date(payment.createdAt).toLocaleString('fr-FR')}</strong></p>
          <p className="flex justify-between"><span className="text-slate-500">Moyen</span><strong>{METHOD_LABEL[payment.method] ?? payment.method}</strong></p>
          <p className="flex justify-between"><span className="text-slate-500">Statut</span><strong>{STATUS_LABEL[payment.status] ?? payment.status}</strong></p>
          <p className="flex justify-between text-base"><span className="text-slate-500">Montant</span><strong>{formatCurrency(payment.amount)}</strong></p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => window.print()} className="py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-1">
            <Printer className="w-4 h-4" /> Imprimer
          </button>
          <button onClick={onClose} className="py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center gap-1">
            <X className="w-4 h-4" /> Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentReceiptModal;
