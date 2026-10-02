import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import type { ORestoPaymentMethod, SchoolCycle } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { isMobileMethod, type WavePaymentRequest } from '@/lib/wave';
import { CYCLES, CYCLE_LABEL, FORMULA_CYCLE } from '@/lib/schoolCycles';
import { QRCodeSVG } from 'qrcode.react';
import WavePaymentModal from '@/components/WavePaymentModal';
import {
  Baby, Wallet, QrCode, History, CheckCircle, AlertCircle,
  Download, Pencil, X, UtensilsCrossed,
  Receipt, Filter, Users, TrendingUp, TrendingDown,
} from 'lucide-react';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

/**
 * Espace parents — suivi par enfant :
 * l'inscription se fait dans « Abonnement » (étape 1 — Je m'inscris),
 * ici : cartes QR + recharge / abonnement + historique des dépenses par enfant.
 */
const ChildrenPage = () => {
  const { user } = useAuth();
  const {
    myChildren, walletOf, childTxs, updateChild,
    topUpChild, confirmWalletTopUpMobile, formulas, subscriptions,
    subscribe, paySubscription, confirmMobilePayment,
    parentProfileOf, myValidations,
  } = useResto();
  const username = user?.username ?? '';
  const kids = myChildren(username);
  const profile = parentProfileOf(username);

  // Historique familial
  const [histChild, setHistChild] = useState<string>('all');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, ORestoPaymentMethod>>({});

  const [waveModal, setWaveModal] = useState<{ txId: string; wave: WavePaymentRequest } | null>(null);
  const [subWaveModal, setSubWaveModal] = useState<{ paymentId: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [subConfirmError, setSubConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [subFormula, setSubFormula] = useState<Record<string, string>>({});
  const [subMethod, setSubMethod] = useState<Record<string, ORestoPaymentMethod>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', className: '', cycle: 'primaire' as SchoolCycle });

  const flash = (ok: boolean, text: string) => {
    setMessage({ ok, text });
    window.setTimeout(() => setMessage(null), 5000);
  };

  const summary = useMemo(() => {
    const totalBalance = kids.reduce((s, k) => s + walletOf(k.id), 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const spentMonth = kids
      .flatMap((k) => childTxs(k.id))
      .filter((t) => t.status === 'paid' && (t.kind === 'debit' || t.kind === 'subscription') && new Date(t.createdAt) >= monthStart)
      .reduce((s, t) => s + t.amount, 0);
    const activeCount = kids.filter((k) =>
      subscriptions.some((s) => s.childId === k.id && s.status === 'active' && new Date(s.endDate).getTime() >= Date.now()),
    ).length;
    const primaireCount = kids.filter((k) => (k.cycle ?? 'primaire') === 'primaire').length;
    const lyceeCount = kids.filter((k) => k.cycle === 'lycee').length;
    return { totalBalance, spentMonth, activeCount, primaireCount, lyceeCount };
  }, [kids, subscriptions, walletOf, childTxs]);

  const childSub = (childId: string) => {
    const now = Date.now();
    return subscriptions.find((s) => s.childId === childId && s.status === 'active' && new Date(s.endDate).getTime() >= now);
  };

  const handleTopUp = (childId: string) => {
    const amount = Math.floor(Number(amounts[childId] ?? 0));
    const method = methods[childId] ?? 'wave';
    if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) {
      flash(false, 'Montant invalide : entre 100 et 1 000 000 FCFA.');
      return;
    }
    try {
      const { tx, wave } = topUpChild(childId, amount, method);
      setAmounts((p) => ({ ...p, [childId]: '' }));
      if (wave && isMobileMethod(method)) {
        setConfirmError(null);
        setWaveModal({ txId: tx.id, wave });
        return;
      }
      flash(true, method === 'cash'
        ? `Carte rechargée : +${formatCurrency(amount)}.`
        : `Recharge ${tx.reference} enregistrée : le gérant la confirmera après votre envoi ${method === 'wave' ? 'Wave' : method === 'mobile_money' ? 'Orange Money' : 'par carte'}.`);
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Recharge impossible.');
    }
  };

  const handleConfirmWave = (code: string) => {
    if (!waveModal) return;
    setConfirming(true);
    const { ok, message: text } = confirmWalletTopUpMobile(waveModal.txId, code);
    setConfirming(false);
    if (!ok) {
      setConfirmError(text);
      return;
    }
    setWaveModal(null);
    setConfirmError(null);
    flash(true, text);
  };

  /** Formules mensuelles autorisées pour un enfant : son cycle + la découverte hebdo (transverse). */
  const formulasForChild = (childCycle: SchoolCycle | undefined) => {
    const cycle = childCycle ?? 'primaire';
    return aboFormulas.filter((f) => {
      const required = FORMULA_CYCLE[f.id];
      return !required || required === cycle;
    });
  };

  const handleSubscribeChild = (childId: string) => {
    const formulaId = subFormula[childId];
    const method = subMethod[childId] ?? 'wave';
    if (!formulaId) {
      flash(false, 'Choisissez une formule pour cet enfant.');
      return;
    }
    const child = kids.find((k) => k.id === childId);
    const childCycle = child?.cycle ?? 'primaire';
    const required = FORMULA_CYCLE[formulaId];
    if (required && required !== childCycle) {
      flash(false, `Cette formule est réservée au cycle ${CYCLE_LABEL[required]}.`);
      return;
    }
    try {
      const sub = subscribe(username, formulaId, childId);
      // Objet frais passé en 3e arg : évite le lookup en state stale (même handler).
      const { payment, wave } = paySubscription(sub.id, method, sub);
      if (wave && isMobileMethod(method)) {
        setSubConfirmError(null);
        setSubWaveModal({ paymentId: payment.id, wave });
        flash(true, `Abonnement réservé. Confirmez le paiement ${payment.reference} avec votre code Wave.`);
        return;
      }
      flash(true, method === 'cash'
        ? `Abonnement réservé (${payment.reference}) : payez au comptoir, le gérant activera la carte.`
        : `Abonnement réservé (${payment.reference}) : en attente de confirmation du gérant.`);
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Souscription impossible.');
    }
  };

  const handleConfirmSubWave = (code: string) => {
    if (!subWaveModal) return;
    setConfirming(true);
    const { ok, message: text } = confirmMobilePayment(subWaveModal.paymentId, code);
    setConfirming(false);
    if (!ok) {
      setSubConfirmError(text);
      return;
    }
    setSubWaveModal(null);
    setSubConfirmError(null);
    flash(true, text);
  };

  const startEdit = (id: string, first: string, last: string, cls: string, cycle?: SchoolCycle) => {
    setEditing(id);
    setEditForm({ firstName: first, lastName: last, className: cls, cycle: cycle ?? 'primaire' });
  };

  const saveEdit = (id: string) => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.className.trim()) {
      flash(false, 'Nom, prénom et classe sont requis.');
      return;
    }
    updateChild(id, { firstName: editForm.firstName.trim(), lastName: editForm.lastName.trim(), className: editForm.className.trim(), cycle: editForm.cycle });
    setEditing(null);
    flash(true, 'Enfant mis à jour.');
  };

  const downloadQR = (token: string, label: string) => {
    const el = document.getElementById(`qr-child-${token}`);
    const svg = el?.querySelector('svg');
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

  const aboFormulas = formulas.filter((f) => f.kind === 'subscription' && !f.name.startsWith('[Ancien]'));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Baby className="w-6 h-6 text-green-700" /> Mes enfants
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">Cartes prépayées, recharges et dépenses — suivi enfant par enfant.</p>
        {profile && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <CheckCircle className="w-3.5 h-3.5" /> {profile.firstName} {profile.lastName} · {profile.phone.replace(/(\d{2})(?=\d)/g, '$1 ')}
          </p>
        )}
      </div>

      {message && (
        <div className={`rounded-2xl border p-3 text-sm flex gap-2 ${message.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />} {message.text}
        </div>
      )}

      {/* Synthèse famille — style ticket cantine */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm overflow-hidden">
          <p className="px-4 py-2.5 bg-gradient-to-r from-green-700 to-green-600 text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-1.5"><Baby className="w-3.5 h-3.5" /> Enfants</p>
          <div className="p-4">
            <p className="text-2xl font-black text-slate-900">{kids.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">{summary.activeCount} abonné(s) actif(s) · {summary.primaireCount} présco-élém · {summary.lyceeCount} lycée</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm overflow-hidden">
          <p className="px-4 py-2.5 bg-gradient-to-r from-green-700 to-green-600 text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Soldes cartes</p>
          <div className="p-4">
            <p className="text-2xl font-black text-slate-900">{formatCurrency(summary.totalBalance)}</p>
            <p className="text-xs text-slate-500 mt-0.5">cumulé</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm overflow-hidden">
          <p className="px-4 py-2.5 bg-gradient-to-r from-green-700 to-green-600 text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-1.5"><UtensilsCrossed className="w-3.5 h-3.5" /> Dépensé (mois)</p>
          <div className="p-4">
            <p className="text-2xl font-black text-slate-900">{formatCurrency(summary.spentMonth)}</p>
            <p className="text-xs text-slate-500 mt-0.5">repas + abonnements</p>
          </div>
        </div>
      </div>

      {kids.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
            <History className="w-7 h-7 text-slate-400" />
          </div>
          <p className="mt-3 font-extrabold text-slate-800 text-lg">Aucun historique pour le moment</p>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
            Les recharges, abonnements et dépenses de vos enfants apparaîtront ici,
            enfant par enfant, dès leur première opération.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {kids.map((k) => {
            const balance = walletOf(k.id);
            const txs = childTxs(k.id);
            const paidTxs = txs.filter((t) => t.status === 'paid');
            const spent = paidTxs.filter((t) => t.kind === 'debit' || t.kind === 'subscription').reduce((s, t) => s + t.amount, 0);
            const sub = childSub(k.id);
            const subName = sub ? formulas.find((f) => f.id === sub.formulaId)?.name ?? 'Abonnement' : null;
            const lowBalance = balance < 1900 && !sub;
            return (
              <div key={k.id} className="bg-white rounded-2xl border overflow-hidden">
                <div className="bg-gradient-to-r from-green-700 to-green-600 px-5 py-4 text-white">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {editing === k.id ? (
                        <div className="grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} placeholder="Nom" maxLength={40} spellCheck={false} className="px-2 py-1.5 rounded-lg text-sm text-slate-900 outline-none" />
                          <input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} placeholder="Prénom" maxLength={40} spellCheck={false} className="px-2 py-1.5 rounded-lg text-sm text-slate-900 outline-none" />
                          <select value={editForm.cycle} onChange={(e) => setEditForm({ ...editForm, cycle: e.target.value as SchoolCycle, className: '' })} className="px-2 py-1.5 rounded-lg text-sm text-slate-900 outline-none">
                            {CYCLES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                          <select value={editForm.className} onChange={(e) => setEditForm({ ...editForm, className: e.target.value })} className="px-2 py-1.5 rounded-lg text-sm text-slate-900 outline-none">
                            <option value="">Classe…</option>
                            {CYCLES.find((c) => c.id === editForm.cycle)?.classes.map((cls) => (
                              <option key={cls} value={cls}>{cls}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <>
                          <p className="font-extrabold capitalize truncate">{k.firstName} {k.lastName}</p>
                          <p className="text-xs opacity-80">Classe : {k.className} · {CYCLE_LABEL[k.cycle ?? 'primaire']}</p>
                        </>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs opacity-80 flex items-center gap-1 justify-end"><Wallet className="w-3.5 h-3.5" /> Solde</p>
                      <p className="text-xl font-black">{formatCurrency(balance)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {sub ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-400 text-green-950">● ABONNÉ — {subName} ({sub.mealsRemaining} repas)</span>
                    ) : (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-300 text-amber-950">○ SANS ABONNEMENT — débit carte au repas</span>
                    )}
                    {lowBalance && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500 text-white">Solde faible — rechargez</span>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${(k.cycle ?? 'primaire') === 'lycee' ? 'bg-white text-green-700' : 'bg-white/25 text-white'}`}>
                      {(k.cycle ?? 'primaire') === 'lycee' ? '🎓 Lycée — 32 000 FCFA/mois' : '🧒 Présco-Élém — 27 000 FCFA/mois'}
                    </span>
                    {editing === k.id ? (
                      <>
                        <button onClick={() => saveEdit(k.id)} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white text-green-700">Enregistrer</button>
                        <button onClick={() => setEditing(null)} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20 text-white flex items-center gap-1"><X className="w-3 h-3" /> Annuler</button>
                      </>
                    ) : (
                      <button onClick={() => startEdit(k.id, k.firstName, k.lastName, k.className, k.cycle)} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20 text-white flex items-center gap-1"><Pencil className="w-3 h-3" /> Modifier</button>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* Étape 2 — QR */}
                  <div className="flex gap-4 items-center">
                    <div id={`qr-child-${k.qrToken}`} className="bg-white border rounded-xl p-2 flex-shrink-0">
                      <QRCodeSVG value={k.qrToken} size={110} />
                    </div>
                    <div className="text-xs text-slate-500 space-y-1.5">
                      <p className="font-mono font-bold text-slate-700">{k.qrToken}</p>
                      <p>À présenter au resto : badge + carte de paiement.</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => downloadQR(k.qrToken, `${k.firstName} ${k.lastName}`)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">
                          <Download className="w-3.5 h-3.5" /> PNG
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Étape 2 — Recharge (créditée sur la carte) */}
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-bold text-slate-600">Recharger la carte</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {QUICK_AMOUNTS.map((q) => (
                        <button key={q} onClick={() => setAmounts((p) => ({ ...p, [k.id]: String(q) }))} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${amounts[k.id] === String(q) ? 'bg-green-700 text-white border-green-600' : 'bg-white text-slate-600'}`}>
                          {q.toLocaleString('fr-FR')}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number" min={100} max={1000000} step={100} inputMode="numeric" value={amounts[k.id] ?? ''} onChange={(e) => setAmounts((p) => ({ ...p, [k.id]: e.target.value }))}
                        placeholder="Montant FCFA (100 – 1 000 000)" aria-label={`Montant à recharger pour ${k.firstName} ${k.lastName}`} className="flex-1 px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600"
                      />
                      <select value={methods[k.id] ?? 'wave'} onChange={(e) => setMethods((p) => ({ ...p, [k.id]: e.target.value as ORestoPaymentMethod }))} className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white">
                        <option value="wave">Wave</option>
                        <option value="cash">Espèces</option>
                        <option value="mobile_money">Orange Money</option>
                        <option value="card">Carte</option>
                      </select>
                      <button onClick={() => handleTopUp(k.id)} className="px-4 py-2 rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-800">Recharger</button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Wave = code à confirmer · Espèces / OM / Carte = confirmation du gérant.</p>
                  </div>

                  {/* Étape 2 — Abonnement du cycle de l'enfant (repas crédités sur la carte) */}
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-bold text-slate-600">Abonner cet enfant <span className="font-normal text-slate-400">({CYCLE_LABEL[k.cycle ?? 'primaire']})</span></p>
                    <div className="mt-2 flex gap-2">
                      <select value={subFormula[k.id] ?? ''} onChange={(e) => setSubFormula((p) => ({ ...p, [k.id]: e.target.value }))} className="flex-1 px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white min-w-0">
                        <option value="">— Formule {CYCLE_LABEL[k.cycle ?? 'primaire']} —</option>
                        {formulasForChild(k.cycle).map((f) => <option key={f.id} value={f.id}>{f.name} — {formatCurrency(f.price)}</option>)}
                      </select>
                      <select value={subMethod[k.id] ?? 'wave'} onChange={(e) => setSubMethod((p) => ({ ...p, [k.id]: e.target.value as ORestoPaymentMethod }))} className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white">
                        <option value="wave">Wave</option>
                        <option value="cash">Espèces</option>
                        <option value="mobile_money">OM</option>
                        <option value="card">Carte</option>
                      </select>
                      <button onClick={() => handleSubscribeChild(k.id)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Payer</button>
                    </div>
                    <div className="mt-2">
                      <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2">
                        Abonnement : InTouch ou espèces — la carte prépayée sert aux tickets repas.
                      </p>
                    </div>
                  </div>

                  {/* Étape 4 — Historique */}
                  <div>
                    <button onClick={() => setExpanded(expanded === k.id ? null : k.id)} className="text-xs font-bold text-green-700 flex items-center gap-1">
                      <History className="w-3.5 h-3.5" /> Dépenses ({paidTxs.length}) • dépensé : {formatCurrency(spent)} {expanded === k.id ? '▾' : '▸'}
                    </button>
                    {expanded === k.id && (
                      <ul className="mt-2 divide-y text-xs max-h-48 overflow-y-auto border rounded-xl">
                        {txs.length === 0 && <li className="p-3 text-slate-400">Aucune opération : rechargez la carte pour commencer.</li>}
                        {txs.map((t) => (
                          <li key={t.id} className="p-2.5 flex justify-between gap-2">
                            <span>
                              <span className={`font-bold ${t.kind === 'topup' ? 'text-green-700' : t.status === 'paid' ? 'text-slate-800' : 'text-amber-700'}`}>
                                {t.kind === 'topup' ? '+' : '−'}{formatCurrency(t.amount)}
                              </span>{' '}
                              <span className="text-slate-500">{t.label ?? t.kind} · {t.method} · {t.status === 'paid' ? 'payé' : 'en attente'}</span>
                            </span>
                            <span className="text-slate-400 whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString('fr-FR')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Étape 3 — Historique familial : abonnements + dépenses par carte */}
      <FamilyHistory
        kids={kids}
        filter={histChild}
        setFilter={setHistChild}
        subscriptions={subscriptions}
        formulas={formulas}
        childTxs={childTxs}
        walletOf={walletOf}
        myValidations={myValidations}
        username={username}
      />

      {waveModal && (
        <WavePaymentModal
          wave={waveModal.wave}
          error={confirmError}
          confirming={confirming}
          onConfirm={handleConfirmWave}
          onClose={() => setWaveModal(null)}
        />
      )}

      {subWaveModal && (
        <WavePaymentModal
          wave={subWaveModal.wave}
          error={subConfirmError}
          confirming={confirming}
          onConfirm={handleConfirmSubWave}
          onClose={() => setSubWaveModal(null)}
        />
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> Chaque enfant a son QR unique et permanent : même après renouvellement, la carte reste la même.</p>
    </div>
  );
};

/** Historique familial unifié : abonnements, recharges et dépenses créditées sur chaque carte. */
function FamilyHistory({ kids, filter, setFilter, subscriptions, formulas, childTxs, walletOf, myValidations, username }: {
  kids: { id: string; firstName: string; lastName: string; className: string; qrToken: string; cycle?: SchoolCycle }[];
  filter: string; setFilter: (v: string) => void;
  subscriptions: import('@/types/menu').Subscription[];
  formulas: import('@/types/menu').Formula[];
  childTxs: (childId: string) => import('@/types/menu').WalletTx[];
  walletOf: (childId: string) => number;
  myValidations: (u: string) => import('@/types/menu').MealValidation[];
  username: string;
}) {
  const scoped = filter === 'all' ? kids : kids.filter((k) => k.id === filter);
  const scopedIds = new Set(scoped.map((k) => k.id));

  const subs = subscriptions
    .filter((s) => s.childId && scopedIds.has(s.childId))
    .sort((a, b) => +new Date(b.startDate) - +new Date(a.startDate));
  const txs = scoped
    .flatMap((k) => childTxs(k.id).map((t) => ({ ...t, childName: `${k.firstName} ${k.lastName}` })))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const meals = myValidations(username).filter((v) => v.status === 'accepted' && v.childId && scopedIds.has(v.childId));

  const recharged = txs.filter((t) => t.status === 'paid' && t.kind === 'topup').reduce((s, t) => s + t.amount, 0);
  const spentCard = txs.filter((t) => t.status === 'paid' && (t.kind === 'debit' || t.kind === 'subscription')).reduce((s, t) => s + t.amount, 0);
  const abosPaid = subs.filter((s) => s.status === 'active').length;

  const childName = (id?: string) => {
    const k = kids.find((x) => x.id === id);
    return k ? `${k.firstName} ${k.lastName}` : '—';
  };

  // Suivi des dépenses détaillé pour chaque enfant de la sélection.
  const perChild = scoped.map((k) => {
    const ktxs = childTxs(k.id).filter((t) => t.status === 'paid');
    const recharged = ktxs.filter((t) => t.kind === 'topup').reduce((s, t) => s + t.amount, 0);
    const spent = ktxs.filter((t) => t.kind === 'debit' || t.kind === 'subscription').reduce((s, t) => s + t.amount, 0);
    const kidMeals = meals.filter((m) => m.childId === k.id);
    const recent = childTxs(k.id)
      .slice()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 3);
    const initials = `${k.firstName.charAt(0)}${k.lastName.charAt(0)}`.toUpperCase() || '•';
    const ratio = Math.min(100, Math.round((spent / Math.max(1, recharged || spent || 1)) * 100));
    return { kid: k, recharged, spent, balance: walletOf(k.id), mealsCount: kidMeals.length, recent, initials, ratio };
  });

  return (
    <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-slate-800 flex items-center gap-2">
          Historique : abonnements & dépenses <History className="w-4 h-4 text-green-700" />
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
          <Filter className="w-3.5 h-3.5" /> {scoped.length} enfant{scoped.length > 1 ? 's' : ''} suivi{scoped.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Filtre rapide par enfant : pastilles tactiles, scroll horizontal sur mobile */}
      {kids.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filtrer l'historique par enfant">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => setFilter('all')}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border-2 transition ${
              filter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Tous
          </button>
          {kids.map((k) => {
            const active = filter === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(active ? 'all' : k.id)}
                title={`${k.firstName} ${k.lastName} — ${k.className}`}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border-2 transition max-w-[180px] ${
                  active ? 'bg-green-700 text-white border-green-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-green-400'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${active ? 'bg-white/25 text-white' : 'bg-green-100 text-green-700'}`}>
                  {`${k.firstName.charAt(0)}${k.lastName.charAt(0)}`.toUpperCase()}
                </span>
                <span className="truncate">{k.firstName} {k.lastName}</span>
              </button>
            );
          })}
        </div>
      )}

      {kids.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Aucune donnée pour le moment : les abonnements et les dépenses de vos enfants apparaîtront ici.</p>
      ) : (
        <>
          {/* Indicateurs globaux de la sélection */}
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="rounded-2xl bg-gradient-to-b from-emerald-50 to-white border border-emerald-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Rechargé</p>
              <p className="text-lg font-black text-emerald-700 mt-0.5">+{formatCurrency(recharged)}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-red-50 to-white border border-red-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-red-500 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> Dépensé</p>
              <p className="text-lg font-black text-red-600 mt-0.5">−{formatCurrency(spentCard)}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-green-50 to-white border border-green-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-green-600 flex items-center gap-1"><UtensilsCrossed className="w-3.5 h-3.5" /> Repas servis</p>
              <p className="text-lg font-black text-green-700 mt-0.5">{meals.length}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-slate-50 to-white border border-slate-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Abos actifs</p>
              <p className="text-lg font-black text-slate-800 mt-0.5">{abosPaid}</p>
            </div>
          </div>

          {subs.length === 0 && txs.length === 0 && meals.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Aucune opération pour cette sélection. Rechargez une carte ou souscrivez une formule à l’étape 2.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Suivi des dépenses pour chaque enfant */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                  Suivi des dépenses par enfant
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {perChild.map(({ kid, recharged: r, spent: s, balance, mealsCount, recent, initials, ratio }) => (
                    <article key={kid.id} className="rounded-2xl border-2 border-slate-100 overflow-hidden hover:border-green-200 transition">
                      <div className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-slate-50 to-white">
                        <span className="w-11 h-11 rounded-2xl bg-green-700 text-white flex items-center justify-center text-sm font-black flex-shrink-0" aria-hidden="true">
                          {initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold text-sm text-slate-800 truncate">{kid.firstName} {kid.lastName}</p>
                          <p className="text-[11px] text-slate-500 truncate">{kid.className} · {kid.cycle === 'lycee' ? 'Lycée' : 'Présco-Élém'} · {mealsCount} repas</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Solde</p>
                          <p className="text-base font-black text-slate-900">{formatCurrency(balance)}</p>
                        </div>
                      </div>
                      <div className="px-3.5 pb-1 pt-2 grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Rechargé</p>
                          <p className="text-sm font-black text-emerald-700">+{formatCurrency(r)}</p>
                        </div>
                        <div className="rounded-xl bg-red-50 border border-red-100 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Dépensé</p>
                          <p className="text-sm font-black text-red-600">−{formatCurrency(s)}</p>
                        </div>
                      </div>
                      <div className="px-3.5 py-2">
                        <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                          <span>Consommé du crédit</span><span>{ratio}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100} aria-label={`Part du crédit consommée par ${kid.firstName}`}>
                          <div className={`h-full rounded-full transition-all ${ratio >= 90 ? 'bg-gradient-to-r from-red-400 to-orange-400' : 'bg-gradient-to-r from-green-600 to-green-400'}`} style={{ width: `${ratio}%` }} />
                        </div>
                      </div>
                      <ul className="mx-3.5 mb-3 pt-2.5 space-y-1.5 border-t-2 border-dashed border-slate-200">
                        {recent.length === 0 && (
                          <li className="text-[11px] text-slate-400">Aucune opération — rechargez la carte pour commencer.</li>
                        )}
                        {recent.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.kind === 'topup' ? 'bg-emerald-500' : t.status === 'paid' ? 'bg-slate-400' : 'bg-amber-400'}`} aria-hidden="true" />
                            <span className={`font-black ${t.kind === 'topup' ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {t.kind === 'topup' ? '+' : '−'}{formatCurrency(t.amount)}
                            </span>
                            <span className="text-slate-500 truncate flex-1">{t.label ?? t.kind}</span>
                            <span className="text-slate-400 whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>

              {subs.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Abonnements</p>
                  <ul className="divide-y border rounded-2xl overflow-hidden">
                    {subs.map((s) => (
                      <li key={s.id} className="p-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {s.status === 'active' ? 'ACTIF' : s.status === 'pending' ? 'EN ATTENTE' : s.status === 'expired' ? 'EXPIRÉ' : 'ANNULÉ'}
                        </span>
                        <span className="font-bold">{childName(s.childId)}</span>
                        <span className="text-slate-500">{formulas.find((f) => f.id === s.formulaId)?.name ?? 'Formule'} · {s.mealsRemaining} repas restants</span>
                        <span className="ml-auto text-xs text-slate-400">Du {new Date(s.startDate).toLocaleDateString('fr-FR')} au {new Date(s.endDate).toLocaleDateString('fr-FR')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {txs.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Tous les mouvements (crédités / débités)</p>
                  <ul className="divide-y border rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                    {txs.map((t) => (
                      <li key={t.id} className="p-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.kind === 'topup' ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                        <span className={`font-black ${t.kind === 'topup' ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {t.kind === 'topup' ? '+' : '−'}{formatCurrency(t.amount)}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">{t.childName}</span>
                        <span className="text-slate-500 text-xs">{t.label ?? t.kind} · {t.method} · {t.status === 'paid' ? 'crédité sur la carte' : 'en attente'}</span>
                        <span className="ml-auto text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString('fr-FR')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meals.length > 0 && (
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5" /> {meals.length} repas déjà servis et pointés au contrôle QR pour cette sélection.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 rounded-xl bg-slate-50 border p-3 text-xs text-slate-500 flex items-start gap-2">
            <Receipt className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Soldes actuels : {scoped.map((k) => `${k.firstName} ${k.lastName} : ${formatCurrency(walletOf(k.id))}`).join(' · ') || '—'}</span>
          </div>
        </>
      )}
    </section>
  );
}

export default ChildrenPage;
