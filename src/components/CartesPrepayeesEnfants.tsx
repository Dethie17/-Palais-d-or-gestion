import { useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { formatCurrency } from '@/lib/utils';
import { isOnlineMobileMethod, isValidSnPhone, type WavePaymentRequest } from '@/lib/wave';
import {
  PARENT_METHOD_ERROR,
  PARENT_METHOD_LABEL,
  PARENT_PAYMENT_METHODS,
  isParentPaymentMethod,
} from '@/lib/parentPayments';
import WavePaymentModal from '@/components/WavePaymentModal';
import ChildQrCard from '@/components/ChildQrCard';
import { AlertCircle, CheckCircle, Download, QrCode, RefreshCw, Smartphone, Wallet } from 'lucide-react';
import type { ORestoPaymentMethod, WalletTx, WalletTxStatus } from '@/types/menu';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

const STATUS_LABEL: Record<WalletTxStatus, string> = {
  pending: 'En attente',
  paid: 'Crédité',
  failed: 'Échoué',
  cancelled: 'Annulé',
  refunded: 'Remboursé',
};

const STATUS_STYLE: Record<WalletTxStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  paid: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  failed: 'bg-red-100 text-red-700 border border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border border-slate-200',
  refunded: 'bg-slate-100 text-slate-600 border border-slate-200',
};

/**
 * Cartes prépayées des enfants, dans l'espace parent.
 *
 * Le solde est celui de la carte QR de l'enfant. La recharge part chez
 * SycaPay (Wave / Orange Money) : elle reste « en attente » tant que le
 * webhook n'a pas confirmé, et seul le serveur crédite la carte. Un parent
 * ne peut donc ni s'auto-créditer, ni rejouer un crédit.
 */
const CartesPrepayeesEnfants = () => {
  const { user } = useAuth();
  const {
    myChildren, parentProfileOf, walletOf, childTxs,
    topUpChild, confirmWalletTopUpMobile, openProviderPayment, syncPaymentFromProvider,
  } = useResto();

  const username = user?.username ?? '';
  const kids = myChildren(username);
  const profile = parentProfileOf(username);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, ORestoPaymentMethod>>({});
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<{ txId: string; wave: WavePaymentRequest } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busyChild, setBusyChild] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
      window.setTimeout(() => setCopied(null), 2000);
    } catch { /* presse-papiers indisponible */ }
  };

  const downloadPNG = (childId: string, token: string, label: string) => {
    const svg = qrRefs.current[childId]?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 760;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('O RESTO', canvas.width / 2, 56);
      ctx.drawImage(img, 70, 90, 500, 500);
      ctx.font = '28px monospace';
      ctx.fillText(token, canvas.width / 2, 640);
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(label, canvas.width / 2, 690);
      const a = document.createElement('a');
      a.download = `oresto-qr-${token}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };

  const amountFor = (childId: string) => amounts[childId] ?? '';
  const methodFor = (childId: string): ORestoPaymentMethod => methods[childId] ?? 'wave';
  const phoneFor = (childId: string) => phones[childId] ?? profile?.phone ?? '';

  const pendingTopUp = (childId: string) =>
    childTxs(childId).find(
      (tx) => tx.kind === 'topup' && tx.status === 'pending' && isOnlineMobileMethod(tx.method),
    );

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setError(null);
  };

  const startRecharge = async (childId: string) => {
    setError(null);
    setNotice(null);
    const amount = Math.floor(Number(amountFor(childId)));
    const method = methodFor(childId);
    if (!isParentPaymentMethod(method)) {
      setError(PARENT_METHOD_ERROR);
      return;
    }
    if (!Number.isFinite(amount) || amount < 100 || amount > 1_000_000) {
      setError('Montant invalide : entre 100 et 1 000 000 FCFA.');
      return;
    }
    const phone = phoneFor(childId);
    if (isOnlineMobileMethod(method) && !isValidSnPhone(phone)) {
      setError('Numéro mobile invalide (9 chiffres, ex : 77 123 45 67).');
      return;
    }

    setBusyChild(childId);
    try {
      const { tx } = topUpChild(childId, amount, method);
      setAmounts((prev) => ({ ...prev, [childId]: '' }));
      const session = await openProviderPayment(
        { reference: tx.reference, amount, method, phone },
        'topup',
        tx.id,
      );
      setModal({ txId: tx.id, wave: session });
      if (session.error) setError(session.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recharge impossible pour le moment.');
    } finally {
      setBusyChild(null);
    }
  };

  const resumeRecharge = async (tx: WalletTx) => {
    if (!isOnlineMobileMethod(tx.method)) return;
    setError(null);
    setNotice(null);
    setResumingId(tx.id);
    try {
      const session = await openProviderPayment(
        { reference: tx.reference, amount: tx.amount, method: tx.method, phone: phoneFor(tx.childId) },
        'topup',
        tx.id,
      );
      setModal({ txId: tx.id, wave: session });
      if (session.error) setError(session.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de reprendre cette recharge.');
    } finally {
      setResumingId(null);
    }
  };

  return (
    <section id="cartes-prepayees" className="scroll-mt-24" data-testid="section-cartes-prepayees">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center flex-shrink-0 shadow">
          <Wallet className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Cantine</p>
          <h2 className="text-lg font-black tracking-tight text-slate-900">Cartes prépayées</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            QR, solde et recharge au même endroit : présentez la carte à la cantine ou rechargée par Wave / Orange Money. Crédit après confirmation.
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-800 whitespace-nowrap">
          <QrCode className="w-3.5 h-3.5" /> <Download className="w-3.5 h-3.5" /> QR + Recharge
        </span>
      </div>

      {notice && (
        <div
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium border flex gap-2 ${notice.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}
        >
          {notice.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {error && !modal && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-800 flex gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
        </p>
      )}

      {kids.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 bg-white border rounded-2xl p-4">
          Vos cartes prépayées apparaîtront ici dès l’inscription du premier enfant.
        </p>
      ) : (
        <ul data-testid="qr-enfants" className="mt-4 grid md:grid-cols-2 gap-4">
          {kids.map((kid) => {
            const pending = pendingTopUp(kid.id);
            const method = methodFor(kid.id);
            const recent = childTxs(kid.id).slice(0, 3);
            return (
              <ChildQrCard
                key={kid.id}
                k={kid}
                qrRefCb={(el) => { qrRefs.current[kid.id] = el; }}
                copied={copied}
                onCopy={copyToken}
                onPNG={downloadPNG}
                onPrint={() => window.print()}
              >
                <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Solde carte</p>
                    <p className="text-2xl font-black text-emerald-700 tabular-nums">{formatCurrency(walletOf(kid.id))}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-600 whitespace-nowrap">
                    QR + Recharge
                  </span>
                </div>

                {pending && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">
                      Recharge de <strong>{formatCurrency(pending.amount)}</strong> en attente
                    </span>
                    <button
                      type="button"
                      onClick={() => resumeRecharge(pending)}
                      disabled={resumingId === pending.id}
                      className="px-3 py-1.5 min-h-[32px] rounded-lg bg-slate-900 text-white text-[11px] font-bold disabled:opacity-60"
                    >
                      {resumingId === pending.id ? 'Ouverture…' : 'Reprendre'}
                    </button>
                  </div>
                )}

                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Recharger la carte</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_AMOUNTS.map((quick) => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setAmounts((prev) => ({ ...prev, [kid.id]: String(quick) }))}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${amountFor(kid.id) === String(quick) ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-600 border-slate-200'}`}
                      >
                        {quick.toLocaleString('fr-FR')}
                      </button>
                    ))}
                  </div>

                  <label htmlFor={`recharge-amount-${kid.id}`} className="mt-3 block text-[11px] font-bold text-slate-600">
                    Montant (100 à 1 000 000 FCFA)
                  </label>
                  <input
                    id={`recharge-amount-${kid.id}`}
                    type="number"
                    min={100}
                    max={1_000_000}
                    step={100}
                    inputMode="numeric"
                    value={amountFor(kid.id)}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [kid.id]: e.target.value }))}
                    placeholder="Ex : 100"
                    className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
                  />

                  <label htmlFor={`recharge-method-${kid.id}`} className="mt-3 block text-[11px] font-bold text-slate-600">
                    Moyen de paiement
                  </label>
                  <div className="mt-1 flex gap-2">
                    <select
                      id={`recharge-method-${kid.id}`}
                      value={method}
                      onChange={(e) => setMethods((prev) => ({ ...prev, [kid.id]: e.target.value as ORestoPaymentMethod }))}
                      className="flex-1 min-w-0 px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600"
                    >
                      {PARENT_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{PARENT_METHOD_LABEL[m]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => startRecharge(kid.id)}
                      disabled={busyChild === kid.id}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 active:scale-[0.99] disabled:opacity-60 whitespace-nowrap"
                    >
                      <Smartphone className="w-4 h-4" />
                      {busyChild === kid.id ? 'Ouverture…' : 'Recharger'}
                    </button>
                  </div>

                  {isOnlineMobileMethod(method) && (
                    <div className="mt-2">
                      <label htmlFor={`recharge-phone-${kid.id}`} className="text-[11px] font-bold text-slate-600">
                        Numéro {PARENT_METHOD_LABEL[method]}
                      </label>
                      <input
                        id={`recharge-phone-${kid.id}`}
                        inputMode="tel"
                        value={phoneFor(kid.id)}
                        onChange={(e) => setPhones((prev) => ({ ...prev, [kid.id]: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                        placeholder="77 123 45 67"
                        className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
                      />
                    </div>
                  )}

                  <p className="mt-2 text-[11px] text-slate-400">
                    Vous serez redirigé vers {PARENT_METHOD_LABEL[method]} pour valider. Aucun crédit avant la confirmation de l’opérateur.
                  </p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Derniers mouvements</p>
                  {recent.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-400">Aucun mouvement pour l’instant.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5">
                      {recent.map((tx) => (
                        <li key={tx.id} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.kind === 'topup' ? 'bg-emerald-500' : tx.status === 'paid' ? 'bg-slate-400' : 'bg-amber-400'}`} aria-hidden="true" />
                          <span className={`font-black tabular-nums ${tx.kind === 'topup' || tx.kind === 'refund' ? 'text-emerald-700' : 'text-slate-700'}`}>
                            {tx.kind === 'topup' || tx.kind === 'refund' ? '+' : '−'}{formatCurrency(tx.amount)}
                          </span>
                          <span className="text-slate-500 truncate flex-1">
                            {tx.label ?? (tx.kind === 'topup' ? 'Recharge carte' : tx.kind === 'subscription' ? 'Abonnement' : 'Repas')}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLE[tx.status]}`}>
                            {STATUS_LABEL[tx.status]}
                          </span>
                          <span className="text-slate-400 whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </ChildQrCard>
            );
          })}
        </ul>
      )}

      {modal && (
        <WavePaymentModal
          wave={modal.wave}
          initialPhone={profile?.phone}
          error={error}
          confirming={confirming}
          onConfirm={(code) => {
            setConfirming(true);
            const result = confirmWalletTopUpMobile(modal.txId, code);
            setConfirming(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setModal(null);
            flash(true, result.message);
          }}
          onPaid={() => {
            setModal(null);
            flash(true, 'Recharge confirmée : le solde de la carte a été crédité.');
          }}
          onSync={syncPaymentFromProvider}
          onClose={() => {
            setModal(null);
            flash(true, 'Recharge en attente : reprenez-la depuis la carte de l’enfant.');
          }}
        />
      )}
    </section>
  );
};

export default CartesPrepayeesEnfants;
