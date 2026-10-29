import { useEffect, useMemo, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import type { Child } from '@/types/menu';
import { isValidSnPhone } from '@/lib/wave';
import {
  prochainsMois, labelMois, debutDeMoisIso, selectionConsecutive, etatMoisPourAbonnements,
  type MoisAvecEtat, type MoisCle,
} from '@/lib/aboMois';
import { cycleOfClass, CYCLE_LABEL } from '@/lib/schoolCycles';
import { ABO_OFFICIAL, officialAboForCycle, officialPrice, type AboId } from '@/lib/aboTariffs';
import { formatCurrency } from '@/lib/utils';
import { Smartphone, Check, ChevronRight, AlertTriangle, X } from 'lucide-react';

/**
 * Espace Abonné — « Payer l'abonnement ».
 * Le parent choisit l'ENFANT : la formule est déduite du cycle de sa classe —
 * F2 (préscolaire/élémentaire, 27 000 FCFA) ou F3 (collège/lycée, 32 000 FCFA)
 * — et il peut régler plusieurs mois consécutifs en UNE seule opération, puis
 * revenir payer d'autres mois plus tard (paiements multiples).
 *
 * État de chaque mois :
 * - « Payé » (verrouillé) : couvert par un abonnement dont au moins un paiement
 *   est PAYÉ en base — pas un simple statut de réservation ;
 * - « En attente » (verrouillé, libérable) : une tentative non aboutie bloque
 *   le mois ; un clic l'annule et libère le mois ;
 * - libre : sélectionnable.
 * Le total est recalculé ici au tarif officiel × mois ; le paiement part chez
 * SycaPay (Wave ou Max it) qui envoie le client automatiquement dans son
 * application.
 */
const PayerAbonnementSection = ({ kids, start, onError }: {
  kids: Child[];
  /** Ouvre la souscription multi-mois puis la session opérateur (page). */
  start: (
    childIds: string[],
    count: number,
    firstMonthIso: string,
    method: 'wave' | 'mobile_money',
    phone: string,
  ) => Promise<void>;
  onError: (text: string) => void;
}) => {
  const { formulas, subscriptions, payments, cancelSubscription } = useResto();
  const [childIds, setChildIds] = useState<string[]>(kids[0]?.id ? [kids[0].id] : []);
  const [selected, setSelected] = useState<MoisCle[]>([]);
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<'wave' | 'mobile_money'>('wave');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedChildren = useMemo(() => kids.filter((k) => childIds.includes(k.id)), [kids, childIds]);

  /** Formule officielle du cycle de la classe de chaque enfant : F2 ou F3. */
  const aboOfChild = useMemo(() => {
    const map = new Map<string, { id: AboId; name: string; price: number; description: string }>();
    kids.forEach((k) => {
      const id = officialAboForCycle(cycleOfClass(k.className));
      if (!id) return;
      const stored = formulas.find((f) => f.id === id);
      const official = ABO_OFFICIAL[id];
      map.set(k.id, {
        id,
        name: official.name,
        price: official.price,
        description: stored?.description ?? '1 repas le midi, jours d’école, pendant 30 jours',
      });
    });
    return map;
  }, [formulas, kids]);
  /** Abonnements des enfants sélectionnés qui portent un paiement réglé. */
  const paidSubIds = useMemo(
    () => new Set(
      payments
        .filter((p) => p.status === 'paid' && p.subscriptionId)
        .map((p) => p.subscriptionId as string),
    ),
    [payments],
  );
  const subsOfChildren = useMemo(
    () => subscriptions.filter((s) => s.childId && childIds.includes(s.childId)),
    [childIds, subscriptions],
  );

  /** Mois communs disponibles pour tous les enfants sélectionnés. */
  const months = useMemo(
    () => etatMoisPourAbonnements(subsOfChildren, paidSubIds, prochainsMois(8)),
    [subsOfChildren, paidSubIds],
  );

  useEffect(() => {
    setSelected((prev) => prev.filter((k) => months.some((m) => m.cle === k && m.etat === 'libre')));
    // eslint-disable-next-next-line react-hooks/exhaustive-deps
  }, [childIds.join(','), months.map((m) => `${m.cle}:${m.etat}`).join(',')]);

  const total = selectedChildren.reduce((sum, child) => {
    const formula = aboOfChild.get(child.id);
    return sum + (formula ? officialPrice(formula.id, formulas) : 0);
  }, 0) * selected.length;
  const consecutif = selectionConsecutive(selected);

  const toggleMois = (cle: MoisCle) => {
    setSelected((prev) => (prev.includes(cle) ? prev.filter((k) => k !== cle) : [...prev, cle]));
  };

  /** Libère un mois verrouillé par une réservation jamais soldée. */
  const liberer = (m: MoisAvecEtat) => {
    setNotice('');
    setError('');
    if (!m.attenteSubId) return;
    try {
      cancelSubscription(m.attenteSubId);
      setNotice('Réservation en attente annulée — le mois est de nouveau disponible.');
    } catch (e) {
      const t = e instanceof Error ? e.message : 'Annulation impossible.';
      onError(t);
    }
  };

  const lancerPaiement = async () => {
    setError('');
    if (selectedChildren.length === 0) {
      setError('Choisissez au moins un enfant.');
      return;
    }
    if (selected.length === 0) {
      setError('Sélectionnez au moins un mois à payer.');
      return;
    }
    if (!consecutif) {
      setError('Les mois sélectionnés doivent être consécutifs (paiement par tranches mensuelles).');
      return;
    }
    if (!isValidSnPhone(phone)) {
      setError('Numéro mobile invalide (9 chiffres, ex : 77 123 45 67).');
      return;
    }
    const tries = [...selected].sort();
    setBusy(true);
    try {
      await start(
        childIds,
        selected.length,
        debutDeMoisIso(tries[0]),
        method,
        phone,
      );
    } catch (e) {
      const t = e instanceof Error ? e.message : 'Paiement impossible pour le moment.';
      setError(t);
      onError(t);
      setBusy(false);
    }
  };

  const methodLabel = method === 'wave' ? 'Wave' : 'Max it (Orange Money)';

  if (kids.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-white border rounded-2xl p-4">
        Inscrivez d’abord un enfant — le paiement de son abonnement apparaîtra ici.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="payer-abonnement">
      {/* Étape 1 : enfant + mois */}
      <div className="bg-white rounded-2xl border p-4 md:p-5 space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-600">Enfants à abonner</p>
          <div className="mt-2 grid gap-2" data-testid="abo-enfants">
            {kids.map((kid) => {
              const checked = childIds.includes(kid.id);
              const formula = aboOfChild.get(kid.id);
              return (
                <button
                  type="button"
                  key={kid.id}
                  data-testid={`abo-enfant-${kid.id}`}
                  aria-pressed={checked}
                  onClick={() => setChildIds((prev) => checked ? prev.filter((id) => id !== kid.id) : [...prev, kid.id])}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 min-h-[44px] rounded-xl border-2 text-sm text-left ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                >
                  <span className="flex items-center gap-2"><span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${checked ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>{checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</span>{kid.firstName} {kid.lastName} · {kid.className}</span>
                  <span className="text-xs font-black text-emerald-700 whitespace-nowrap">{formula ? formatCurrency(officialPrice(formula.id, formulas)) : '—'}/mois</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-600">Mois à payer <span className="text-slate-400 font-normal">(un mois ne se paie qu’une fois)</span></p>
          <div className="mt-2 grid grid-cols-2 gap-2" data-testid="abo-mois-liste">
            {months.map((m) => {
              const libre = m.etat === 'libre';
              const checked = libre && selected.includes(m.cle);
              return (
                <div
                  key={m.cle}
                  data-testid={`abo-mois-${m.cle}`}
                  aria-disabled={!libre}
                  className={`flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] rounded-xl border-2 text-sm transition ${m.etat === 'paye'
                    ? 'border-slate-100 bg-slate-50 text-slate-400'
                    : m.etat === 'attente'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : checked ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  <button
                    type="button"
                    onClick={() => { if (libre) toggleMois(m.cle); }}
                    disabled={!libre}
                    aria-pressed={checked}
                    aria-label={m.etat === 'paye' ? `${m.label} déjà payé` : m.etat === 'attente' ? `${m.label} en attente` : `Choisir ${m.label}`}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${!libre ? 'border-slate-200' : checked ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                      {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{m.label}</span>
                  </button>
                  {m.etat === 'paye' && (
                    <span className="text-[10px] font-black text-emerald-700 whitespace-nowrap">Payé</span>
                  )}
                  {m.etat === 'attente' && (
                    <button
                      type="button"
                      onClick={() => liberer(m)}
                      title="Annuler la réservation jamais soldée qui bloque ce mois"
                      data-testid={`abo-liberer-${m.cle}`}
                      className="flex items-center gap-0.5 text-[9px] font-black text-amber-800 whitespace-nowrap hover:text-amber-950"
                    >
                      <X className="w-3 h-3" /> En attente
                    </button>
                  )}
                  {libre && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
          {notice && <p className="text-xs font-bold text-emerald-700 mt-1">{notice}</p>}
          {!consecutif && (
            <p className="text-xs font-bold text-amber-700 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Les mois sélectionnés doivent être consécutifs.
            </p>
          )}
        </div>
      </div>

      {/* Étape 2 : récap + moyen de paiement SycaPay */}
      <div className="bg-white rounded-2xl border p-4 md:p-5 space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Récapitulatif avant validation</p>
        <div className="rounded-xl bg-slate-50 border p-3 text-sm space-y-1" data-testid="abo-recap">
          <p><strong className="text-slate-500">Enfants :</strong> {selectedChildren.map((c) => `${c.firstName} ${c.lastName}`).join(', ') || '—'}</p>
          <p><strong className="text-slate-500">Nombre d'enfants :</strong> {selectedChildren.length}</p>
          <p><strong className="text-slate-500">Mois choisis :</strong> {selected.slice().sort().map(labelMois).join(' · ') || '—'}</p>
          <p className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2">
            <strong className="text-slate-600">Total à payer</strong>
            <strong className="text-xl text-emerald-700 tabular-nums" data-testid="abo-total">{formatCurrency(total)}</strong>
          </p>
        </div>

        {!busy ? (
          <>
            <div>
              <p className="text-xs font-bold text-slate-600">Moyen de paiement</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('wave')}
                  aria-pressed={method === 'wave'}
                  data-testid="abo-methode-wave"
                  className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${method === 'wave' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                >
                  Wave
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('mobile_money')}
                  aria-pressed={method === 'mobile_money'}
                  data-testid="abo-methode-maxit"
                  className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${method === 'mobile_money' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                >
                  Max it (Orange Money)
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="abo-tel" className="text-xs font-bold text-slate-600">Numéro mobile ({methodLabel})</label>
              <input
                id="abo-tel"
                data-testid="abo-tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="77 123 45 67"
                className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
              />
            </div>
            {error && <p data-testid="abo-error" className="text-xs font-bold text-red-600">{error}</p>}
            <button
              type="button"
              data-testid="abo-payer"
              onClick={lancerPaiement}
              disabled={busy || selectedChildren.length === 0 || total <= 0 || !isValidSnPhone(phone)}
              className="w-full py-3 min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4" /> Payer via {methodLabel} · {formatCurrency(total)} pour {selected.length} mois
            </button>
            <p className="text-[11px] text-slate-400">
              Vous partez automatiquement dans l’application {methodLabel} pour valider avec votre code secret. Le débit réel est confirmé par SycaPay.
            </p>
          </>
        ) : (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900" role="status">
            Ouverture du paiement {methodLabel} — vous partez chez l’opérateur…
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          Règles : montant recalculé depuis la formule de la classe de l’enfant · paiement en une opération possible sur plusieurs mois consécutifs, puis de nouveaux paiements plus tard · « Payé » = mois réglé · « En attente » = demande jamais soldée, libérable d’un clic.
        </p>
      </div>
    </div>
  );
};

export default PayerAbonnementSection;
