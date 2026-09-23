import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import type { Formula, ORestoPayment, ORestoPaymentMethod } from '@/types/menu';
import { composedMenus } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { WAVE_MERCHANT_NAME, WAVE_MERCHANT_NUMBER } from '@/lib/wave';
import {
  Ticket, Eye, ShoppingCart, Banknote, Smartphone, X, CheckCircle,
  CalendarDays, UtensilsCrossed, ChevronLeft, ChevronRight, AlertCircle, Clock,
} from 'lucide-react';
import TicketCard from '@/components/TicketCard';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';

/**
 * Tickets & formules — côté staff (cahier des charges §5-6).
 * - Gérant de cantine : catalogue COMPLET + vente au comptoir
 *   (espèces = activation immédiate + reçu, Wave = demande à confirmer par le client).
 * - Personnel / DG : lecture seule (annonce des plats, supervision).
 */
const TicketsPage = () => {
  const { user } = useAuth();
  const { formulas, subscriptions, counterSale } = useResto();
  const canSell = user?.role === 'gestionnaire';

  const [saleTarget, setSaleTarget] = useState<Formula | null>(null);
  const [saleClient, setSaleClient] = useState('');
  const [saleMethod, setSaleMethod] = useState<ORestoPaymentMethod>('cash');
  const [saleError, setSaleError] = useState('');
  const [receipt, setReceipt] = useState<{ payment: ORestoPayment; clientName: string; formulaName: string } | null>(null);
  const [salePending, setSalePending] = useState<{ payment: ORestoPayment; clientName: string; formulaName: string } | null>(null);
  const ticketRowRef = useRef<HTMLDivElement>(null);

  const aboFormulas = formulas.filter((f) => f.kind === 'subscription');
  const bestValue = aboFormulas.length
    ? aboFormulas.reduce((a, b) => (a.price / a.mealsIncluded <= b.price / b.mealsIncluded ? a : b)).id
    : '';
  const knownClients = useMemo(
    () => Array.from(new Set(subscriptions.map((s) => s.clientUsername))).sort(),
    [subscriptions],
  );

  const scrollTickets = (dir: 1 | -1) => {
    ticketRowRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  const openSale = (formula: Formula) => {
    setSaleTarget(formula);
    setSaleClient('');
    setSaleMethod('cash');
    setSaleError('');
  };

  const confirmSale = () => {
    if (!saleTarget) return;
    const name = saleClient.trim().toLowerCase();
    if (!name) {
      setSaleError('Indiquez le nom du client (son nom d’utilisateur).');
      return;
    }
    try {
      const r = counterSale(name, saleTarget.id, saleMethod);
      const done = { clientName: name, formulaName: saleTarget.name };
      setSaleTarget(null);
      setSaleClient('');
      setSaleError('');
      if (r.wave) {
        setSalePending({ payment: r.payment, ...done });
      } else {
        setReceipt({ payment: r.payment, ...done });
      }
    } catch (e) {
      setSaleError(e instanceof Error ? e.message : 'Vente impossible.');
    }
  };

  const sellButton = (formula: Formula) => (
    <button onClick={() => openSale(formula)} className="w-full py-2 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-800 flex items-center justify-center gap-1">
      <ShoppingCart className="w-4 h-4" /> Vendre au comptoir
    </button>
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
          <Ticket className="w-7 h-7 text-orange-500" /> Tickets & formules
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {canSell
            ? 'Catalogue complet : vendez abonnements et tickets au comptoir, encaissez et remettez un reçu.'
            : 'Catalogue complet en lecture seule : annoncez les plats, la vente se fait à la caisse du Gérant.'}
        </p>
      </div>

      {!canSell && (
        <p className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2.5 rounded-xl">
          <Eye className="w-4 h-4" /> Mode lecture : seule la vente au comptoir du Gérant encaisse et active les cartes.
        </p>
      )}

      {/* ---- FORMULES D'ABONNEMENT ---- */}
      <section>
        <h2 className="font-bold text-slate-800 mb-1">Formules d’abonnement</h2>
        <p className="text-sm text-slate-500 mb-3">Cartes multi-repas avec durée de validité et règles.</p>
        {aboFormulas.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border text-slate-500 text-sm">Aucune formule publiée.</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {aboFormulas.map((f) => (
              <div key={f.id} className={`bg-white rounded-2xl border-2 shadow-sm p-5 flex flex-col relative ${f.id === bestValue ? 'border-green-400' : 'border-slate-100'}`}>
                {f.id === bestValue && (
                  <span className="absolute -top-3 left-4 text-xs font-bold px-3 py-1 rounded-full bg-green-500 text-white">MEILLEUR PRIX / REPAS</span>
                )}
                <p className="font-bold text-lg mt-1">{f.name}</p>
                <p className="text-sm text-slate-500">{f.description}</p>
                <p className="text-3xl font-extrabold mt-3">{formatCurrency(f.price)}</p>
                <p className="text-sm font-semibold text-orange-600">≈ {formatCurrency(Math.round(f.price / f.mealsIncluded))} / repas</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li className="flex items-center gap-1"><UtensilsCrossed className="w-4 h-4 text-slate-400" /> {f.mealsIncluded} repas inclus</li>
                  <li className="flex items-center gap-1"><CalendarDays className="w-4 h-4 text-slate-400" /> Valable {f.durationDays} jours</li>
                </ul>
                {f.rules && <p className="text-xs text-slate-400 mt-2 italic">{f.rules}</p>}
                {canSell && <div className="mt-4">{sellButton(f)}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- TICKETS DE LA SEMAINE ---- */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="font-bold text-slate-800">Tickets de la semaine (Lun → Ven)</h2>
            <p className="text-sm text-slate-500">1 ticket = 1 repas. Faites défiler pour tout voir.</p>
          </div>
          <div className="hidden sm:flex gap-2 flex-shrink-0">
            <button onClick={() => scrollTickets(-1)} title="Tickets précédents" className="p-2.5 rounded-xl bg-white border shadow-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => scrollTickets(1)} title="Tickets suivants" className="p-2.5 rounded-xl bg-white border shadow-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div ref={ticketRowRef} className="ticket-row flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-1 px-1">
          {composedMenus.map((m) => {
            const formula = formulas.find((f) => f.id === m.formulaId);
            return (
              <TicketCard
                key={m.id}
                day={m.day}
                name={m.name}
                description={m.description}
                image={m.image}
                items={m.items}
                total={m.total}
                className="min-w-[270px] max-w-[300px] sm:min-w-[300px] shrink-0 snap-start"
                action={canSell && formula ? sellButton(formula) : undefined}
              />
            );
          })}
        </div>
      </section>

      {/* ---- MODAL VENTE COMPTOIR (Gérant) ---- */}
      {saleTarget && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4" onClick={() => setSaleTarget(null)}>
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </span>
                Vente au comptoir
              </h3>
              <button onClick={() => setSaleTarget(null)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="mt-3 bg-slate-50 border rounded-2xl p-4">
              <p className="font-bold">{saleTarget.name}</p>
              <p className="text-sm text-slate-500">{saleTarget.mealsIncluded} repas • {saleTarget.durationDays} jours</p>
              <p className="text-xl font-extrabold mt-1">{formatCurrency(saleTarget.price)}</p>
            </div>
            <label className="block text-sm font-bold text-slate-700 mt-4 mb-1.5">Client (nom d’utilisateur)</label>
            <input
              value={saleClient}
              onChange={(e) => setSaleClient(e.target.value)}
              placeholder="ex : client"
              list="tickets-known-clients"
              autoComplete="off"
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 outline-none focus:border-green-600 font-semibold capitalize"
            />
            <datalist id="tickets-known-clients">
              {knownClients.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <label className="block text-sm font-bold text-slate-700 mt-4 mb-1.5">Encaissement</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSaleMethod('cash')}
                className={`flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm border-2 ${saleMethod === 'cash' ? 'bg-green-700 text-white border-green-700' : 'bg-white text-slate-600'}`}
              >
                <Banknote className="w-4 h-4" /> Espèces
              </button>
              <button
                onClick={() => setSaleMethod('wave')}
                className={`flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm border-2 ${saleMethod === 'wave' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}
              >
                <Smartphone className="w-4 h-4" /> Wave
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {saleMethod === 'cash'
                ? 'Espèces : carte activée aussitôt + reçu imprimable.'
                : 'Wave : demande créée, le client confirme avec son code (reçu après confirmation).'}
            </p>
            {saleError && (
              <p className="mt-3 text-sm font-semibold text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {saleError}</p>
            )}
            <button onClick={confirmSale} className="mt-4 w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Confirmer la vente — {formatCurrency(saleTarget.price)}
            </button>
          </div>
        </div>
      )}

      {/* ---- REÇU VENTE ---- */}
      {receipt && (
        <PaymentReceiptModal
          payment={receipt.payment}
          clientName={receipt.clientName}
          formulaName={receipt.formulaName}
          onClose={() => setReceipt(null)}
        />
      )}

      {/* ---- WAVE EN ATTENTE (relai au client) ---- */}
      {salePending && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4" onClick={() => setSalePending(null)}>
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" /> Paiement Wave en attente
            </h3>
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm space-y-1">
              <p className="flex justify-between"><span className="text-slate-500">Client</span><strong className="capitalize">{salePending.clientName}</strong></p>
              <p className="flex justify-between"><span className="text-slate-500">Offre</span><strong>{salePending.formulaName}</strong></p>
              <p className="flex justify-between"><span className="text-slate-500">Montant</span><strong>{formatCurrency(salePending.payment.amount)}</strong></p>
              <p className="flex justify-between"><span className="text-slate-500">Référence</span><strong className="font-mono">{salePending.payment.reference}</strong></p>
              <p className="flex justify-between"><span className="text-slate-500">Marchand</span><strong>{WAVE_MERCHANT_NAME} • {WAVE_MERCHANT_NUMBER}</strong></p>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Le client envoie le montant puis <strong>confirme avec son code depuis son compte</strong> (Abonnement → Mes paiements → Confirmer). La carte s’active automatiquement.
            </p>
            <button onClick={() => setSalePending(null)} className="mt-4 w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700">
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketsPage;
