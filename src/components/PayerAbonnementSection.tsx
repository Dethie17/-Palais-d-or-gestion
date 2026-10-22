import { useEffect, useMemo, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import type { Child, ORestoPayment, Subscription } from '@/types/menu';
import { isValidSnPhone, isValidWaveCode, type WavePaymentRequest } from '@/lib/wave';
import {
  prochainsMois, moisCouverts, labelMois, debutDeMoisIso, selectionConsecutive, type MoisCle,
} from '@/lib/aboMois';
import { cycleOfClass, formulaCoversCycle, CYCLE_LABEL } from '@/lib/schoolCycles';
import { formatCurrency } from '@/lib/utils';
import { Smartphone, Timer, Check, ChevronRight, AlertTriangle } from 'lucide-react';

/**
 * Espace Parent — « Payer l'abonnement ».
 * Le parent choisit l'ENFANT : le montant est déduit de la formule du cycle
 * de sa classe (référentiel schoolCycles), les mois déjà couverts par un
 * abonnement sont verrouillés (« Payé »), et il peut régler plusieurs mois
 * consécutifs en UNE seule opération : un seul abonnement élargi couvert
 * par un seul paiement. Le total est recalculé ici formule × mois ; le
 * débit réel est confirmé par le code InTouch à 6 chiffres.
 */
const PayerAbonnementSection = ({ kids, onPaid, onError }: {
  kids: Child[];
  onPaid: (paymentId: string, sub?: Subscription) => void;
  onError: (text: string) => void;
}) => {
  const {
    formulas, subscriptions, confirmMobilePayment, subscribeBundle, paySubscription,
  } = useResto();
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [selected, setSelected] = useState<MoisCle[]>([]);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [wave, setWave] = useState<WavePaymentRequest | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!wave) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wave]);

  const child = kids.find((k) => k.id === childId);

  /** Formule abonnement du cycle de la classe de l'enfant. */
  const formulaByChild = useMemo(() => {
    const abos = formulas.filter((f) => f.kind === 'subscription' && !f.name.startsWith('[Ancien]'));
    const map = new Map<string, (typeof formulas)[number]>();
    kids.forEach((k) => {
      const c = cycleOfClass(k.className);
      const f = abos.find((x) => formulaCoversCycle(x.id, c)) ?? abos[0];
      if (f) map.set(k.id, f);
    });
    return map;
  }, [formulas, kids]);
  const formula = child ? formulaByChild.get(child.id) : undefined;

  /** Mois offerts : les 8 prochains, verrouillés si couverts par un abonnement. */
  const months = useMemo(() => {
    if (!child) return [];
    const subs = subscriptions.filter((s) => s.childId === child.id);
    const couverts = moisCouverts(subs);
    return prochainsMois(8).map((m) => ({ ...m, paid: couverts.has(m.cle) }));
  }, [child, subscriptions]);

  // Changement d'enfant / nouvel abonnement payé : on erreur les mois couverts.
  useEffect(() => {
    setSelected((prev) => prev.filter((k) => months.some((m) => m.cle === k && !m.paid)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, months.length, months.map((m) => `${m.cle}:${m.paid}`).join(',')]);

  const total = (formula?.price ?? 0) * selected.length;
  const consecutif = selectionConsecutive(selected);

  const toggleMois = (cle: MoisCle) => {
    setSelected((prev) => (prev.includes(cle) ? prev.filter((k) => k !== cle) : [...prev, cle]));
  };

  const lancerPaiement = () => {
    setError('');
    if (!child || !formula) {
      setError('Choisissez d’abord un enfant.');
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
      setError('Numéro InTouch invalide (9 chiffres, ex : 77 123 45 67).');
      return;
    }
    const tries = [...selected].sort();
    try {
      const sub = subscribeBundle(
        child.parentUsername,
        formula.id,
        child.id,
        selected.length,
        debutDeMoisIso(tries[0]),
      );
      const montant = formula.price * selected.length;
      const r = paySubscription(sub.id, 'wave', sub, montant);
      if (!r.wave) throw new Error('Paiement mobile indisponible pour le moment — réessayez.');
      setPaymentId(r.payment.id);
      setWave(r.wave);
    } catch (e) {
      const t = e instanceof Error ? e.message : 'Paiement impossible pour le moment.';
      setError(t);
      onError(t);
    }
  };

  const confirmeCode = () => {
    setError('');
    if (!paymentId) return;
    if (!isValidWaveCode(code)) {
      setError('Code InTouch à 6 chiffres requis.');
      return;
    }
    setConfirming(true);
    const { ok, message } = confirmMobilePayment(paymentId, code);
    setConfirming(false);
    if (!ok) {
      setError(message);
      return;
    }
    onPaid(paymentId);
  };

  const left = wave ? Math.max(0, new Date(wave.expiresAt).getTime() - now) : 0;
  const countdown = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;

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
          <label htmlFor="abo-enfant" className="text-xs font-bold text-slate-600">Enfant à abonner</label>
          <select
            id="abo-enfant"
            data-testid="abo-enfant"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600"
          >
            {kids.map((k) => (
              <option key={k.id} value={k.id}>{k.firstName} {k.lastName} · {k.className}</option>
            ))}
          </select>
          {child && (
            <p className="text-[11px] text-slate-400 mt-1">
              Cycle {cycleOfClass(child.className) ? CYCLE_LABEL[cycleOfClass(child.className)] : '—'} · formule {formula ? `« ${formula.name} » — ${formatCurrency(formula.price)}/mois` : 'indisponible'}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-600">Mois à payer <span className="text-slate-400 font-normal">(un mois ne se paie qu’une fois)</span></p>
          <div className="mt-2 grid grid-cols-2 gap-2" data-testid="abo-mois-liste">
            {months.map((m) => {
              const checked = selected.includes(m.cle);
              return (
                <button
                  key={m.cle}
                  type="button"
                  onClick={() => { if (!m.paid) toggleMois(m.cle); }}
                  disabled={m.paid}
                  aria-pressed={checked}
                  data-testid={`abo-mois-${m.cle}`}
                  className={`flex items-center justify-between px-3 py-2 min-h-[44px] rounded-xl border-2 text-sm transition ${m.paid
                    ? 'border-slate-100 bg-slate-50 text-slate-400'
                    : checked ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white hover:border-emerald-400 text-slate-700'}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${m.paid ? 'border-slate-200' : checked ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                      {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{m.label}</span>
                  </span>
                  {m.paid ? <span className="text-[10px] font-black text-emerald-700 whitespace-nowrap">Payé</span> : <ChevronRight className="w-4 h-4 text-slate-300" />}
                </button>
              );
            })}
          </div>
          {!consecutif && (
            <p className="text-xs font-bold text-amber-700 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Les mois sélectionnés doivent être consécutifs.
            </p>
          )}
        </div>
      </div>

      {/* Étape 2 : récap + paiement InTouch */}
      <div className="bg-white rounded-2xl border p-4 md:p-5 space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Récapitulatif avant validation</p>
        <div className="rounded-xl bg-slate-50 border p-3 text-sm space-y-1" data-testid="abo-recap">
          <p><strong className="text-slate-500">Enfant :</strong> {child ? `${child.firstName} ${child.lastName}` : '—'} <span className="text-slate-400">({child?.className ?? '—'})</span></p>
          <p><strong className="text-slate-500">Formule :</strong> {formula?.name ?? '—'}</p>
          <p><strong className="text-slate-500">Mois choisis :</strong> {selected.slice().sort().map(labelMois).join(' · ') || '—'}</p>
          <p className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2">
            <strong className="text-slate-600">Total à payer</strong>
            <strong className="text-xl text-emerald-700 tabular-nums" data-testid="abo-total">{formatCurrency(total)}</strong>
          </p>
        </div>

        {!paymentId ? (
          <>
            <div>
              <label htmlFor="abo-tel" className="text-xs font-bold text-slate-600">Numéro InTouch (Wave)</label>
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
              disabled={!formula || total <= 0}
              className="w-full py-3 min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4" /> Payer {formatCurrency(total)} pour {selected.length} mois
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-900 text-white p-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-400">Montant envoyé · {wave?.merchantName ?? 'Wave'}</p>
                <p className="text-xl font-bold" data-testid="abo-montant-envoye">{wave?.amountLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 flex items-center gap-1 justify-end"><Timer className="w-3.5 h-3.5" /> Expire</p>
                <p className={`text-lg font-bold font-mono ${left === 0 ? 'text-red-400' : ''}`}>{countdown}</p>
              </div>
            </div>
            <div>
              <label htmlFor="abo-code" className="text-xs font-bold text-slate-600">Code InTouch à 6 chiffres</label>
              <input
                id="abo-code"
                data-testid="abo-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm tracking-[0.4em] text-center outline-none focus:border-emerald-600"
              />
            </div>
            {error && <p data-testid="abo-error" className="text-xs font-bold text-red-600">{error}</p>}
            <button
              type="button"
              data-testid="abo-confirmer"
              onClick={confirmeCode}
              disabled={confirming}
              className="w-full py-3 min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-60"
            >
              {confirming ? 'Vérification…' : 'Confirmer le paiement'}
            </button>
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          Règles : montant recalculé depuis la formule de la classe de l’enfant · un seul paiement pour tous les mois choisis · un mois déjà payé est verrouillé.
        </p>
      </div>
    </div>
  );
};

export default PayerAbonnementSection;
