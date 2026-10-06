import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { Formula, SubscriptionStatus } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { methodLabel } from '@/lib/wave';
import { CYCLE_LABEL } from '@/lib/schoolCycles';
import { isOfficialFormula, cycleOfFormula, validateFormulaPayload, pricePerMeal } from '@/lib/formulas';
import {
  Users, CreditCard, Banknote, CheckCircle, XCircle, Plus, Trash2, Pencil, Receipt,
  GraduationCap, Baby, QrCode,
} from 'lucide-react';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import type { ORestoPayment } from '@/types/menu';

type Tab = 'subs' | 'formulas' | 'payments';

const SUB_STATUS: Record<SubscriptionStatus, { label: string; style: string }> = {
  pending: { label: 'En attente', style: 'bg-amber-100 text-amber-800' },
  active: { label: 'Actif', style: 'bg-green-100 text-green-700' },
  expired: { label: 'Expiré', style: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Annulé', style: 'bg-red-100 text-red-600' },
};

const PAY_STATUS: Record<string, { label: string; style: string }> = {
  pending: { label: 'En attente', style: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Payé', style: 'bg-green-100 text-green-700' },
};

const CYCLE_SHORT: Record<string, string> = { primaire: 'Présco-Élém', lycee: 'Lycée' };
const CYCLE_STYLE: Record<string, string> = {
  primaire: 'bg-emerald-100 text-emerald-700',
  lycee: 'bg-amber-100 text-amber-800',
};

const SubscriptionsAdminPage = () => {
  const { user } = useAuth();
  // Direction : suivi en lecture seule (ne change rien).
  // Personnel : opérationnel (encaissements, confirmations).
  // Catalogue formules : géré par la Direction uniquement.
  const isDG = user?.role === 'admin' || user?.role === 'manager';
  const {
    subscriptions, formulas, payments, children: kids, parentProfiles,
    walletTxs, collectCashPayment, confirmManualPayment, confirmWalletTopUp, cancelSubscription,
    addFormula, updateFormula, deleteFormula,
  } = useResto();
  const [tab, setTab] = useState<Tab>('subs');
  const [filter, setFilter] = useState<'all' | SubscriptionStatus>('all');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [editing, setEditing] = useState<Formula | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', oldPrice: '', durationDays: '', mealsIncluded: '', rules: '' });

  const formulaName = (id: string) => formulas.find((f) => f.id === id)?.name ?? id;
  const cycleBadge = (formulaId: string) => {
    const f = formulas.find((x) => x.id === formulaId);
    const cycle = f ? cycleOfFormula(f) : undefined;
    if (!cycle) {
      return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Tous cycles</span>;
    }
    return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${CYCLE_STYLE[cycle]}`}>{CYCLE_SHORT[cycle]}</span>;
  };
  const parentOf = (username?: string | null) => {
    if (!username) return null;
    return parentProfiles.find((p) => p.parentUsername === username.trim().toLowerCase()) ?? null;
  };
  /** Bénéficiaire d'un paiement : enfant si abo rattaché, sinon parent / compte. */
  const whoOfPayment = (p: ORestoPayment) => {
    const sub = subscriptions.find((s) => s.id === p.subscriptionId);
    const k = sub?.childId ? kids.find((c) => c.id === sub.childId) : undefined;
    if (k) return `${k.firstName} ${k.lastName}`;
    return sub?.clientUsername ?? p.clientUsername ?? '—';
  };
  const payStatus = (status: string) => PAY_STATUS[status] ?? { label: status, style: 'bg-slate-100 text-slate-500' };

  const filteredSubs = subscriptions.filter((s) => filter === 'all' || s.status === filter);
  const pendingPayments = payments.filter((p) => p.status === 'pending');

  const handleEncaisser = (subId: string) => {
    const payment = collectCashPayment(subId);
    if (!payment) {
      setMessage('Encaissement impossible : abonnement déjà traité ou introuvable.');
      return;
    }
    setMessage(`Espèces encaissées — abonnement activé (paiement ${payment.reference}).`);
  };

  const startEdit = (f: Formula) => {
    if (f.kind !== 'subscription') return;
    setEditing(f);
    setForm({
      name: f.name, description: f.description, price: String(f.price),
      oldPrice: f.oldPrice ? String(f.oldPrice) : '',
      durationDays: String(f.durationDays), mealsIncluded: String(f.mealsIncluded),
      rules: f.rules ?? '',
    });
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ name: '', description: '', price: '', oldPrice: '', durationDays: '', mealsIncluded: '', rules: '' });
  };

  const previewPrice = Number(form.price) || 0;
  const previewMeals = Number(form.mealsIncluded) || 0;

  const handleSaveFormula = (e: React.FormEvent) => {
    e.preventDefault();
    const rawOld = form.oldPrice.trim() === '' ? undefined : Number(form.oldPrice);
    // Ici : abonnements cantine uniquement. Les tickets sont créés
    // et modifiés par le Personnel (Gestion du menu).
    const payload = {
      name: form.name.trim(), description: form.description.trim(),
      price: Number(form.price) || 0, oldPrice: rawOld,
      durationDays: Math.floor(Number(form.durationDays)) || 0,
      mealsIncluded: Math.floor(Number(form.mealsIncluded)) || 0, rules: form.rules.trim(), kind: 'subscription' as const,
    };
    const check = validateFormulaPayload(payload);
    if (!check.ok) {
      setMessage(check.message);
      return;
    }
    if (editing) {
      if (isOfficialFormula(editing.id)) {
        setMessage('Formule officielle du flyer 2026 : tarif non modifiable (prix, repas et durée suivent le flyer).');
        return;
      }
      updateFormula(editing.id, payload);
      setMessage(`Formule « ${payload.name} » mise à jour.`);
    } else {
      addFormula(payload);
      setMessage(`Formule « ${payload.name} » créée (tous cycles — sans cycle imposé).`);
    }
    resetForm();
  };

  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;
  const pendingSubs = subscriptions.filter((s) => s.status === 'pending').length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="rounded-3xl bg-slate-950 text-white p-6 md:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-16 w-64 h-64 bg-slate-500/10 rounded-full blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center shadow-lg">
            <Users className="w-6 h-6 text-white" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight">Abonnés & paiements</h1>
          </div>
          {isDG && (
            <span className="ml-auto text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-slate-200">
              Suivi — lecture seule
            </span>
          )}
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2 max-w-lg">
          <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3">
            <p className="text-2xl font-black">{activeSubs}</p>
            <p className="text-[11px] font-bold text-slate-300">abos actifs</p>
          </div>
          <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3">
            <p className="text-2xl font-black">{pendingSubs}</p>
            <p className="text-[11px] font-bold text-slate-300">en attente</p>
          </div>
          <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3">
            <p className="text-2xl font-black">{pendingPayments.length}</p>
            <p className="text-[11px] font-bold text-slate-300">paiements à confirmer</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-sm text-green-800 flex gap-2">
          <CheckCircle className="w-5 h-5 flex-shrink-0" /> {message}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 bg-white border-2 border-slate-100 rounded-2xl p-2 shadow-sm">
        {([
          { id: 'subs', label: `Abonnés (${subscriptions.length})`, icon: <Users className="w-4 h-4" /> },
          { id: 'formulas', label: `Formules (${formulas.length})`, icon: <CreditCard className="w-4 h-4" /> },
          { id: 'payments', label: `Paiements (${payments.length})`, icon: <Banknote className="w-4 h-4" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition ${tab === t.id ? 'bg-green-700 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ---- ABONNÉS ---- */}
      {tab === 'subs' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="p-4 flex flex-wrap items-center gap-2 border-b">
            <span className="text-sm font-semibold text-slate-600">Statut :</span>
            {(['all', 'pending', 'active', 'expired', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${filter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {s === 'all' ? 'Tous' : SUB_STATUS[s].label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="text-left p-3">Parent / Enfant</th><th className="text-left p-3">Formule</th><th className="text-left p-3">Période</th><th className="text-left p-3">Repas rest.</th><th className="text-left p-3">Statut</th>{!isDG && <th className="text-left p-3">Actions</th>}</tr>
              </thead>
              <tbody>
                {filteredSubs.length === 0 && (
                  <tr><td colSpan={isDG ? 5 : 6} className="p-4 text-center text-slate-400">Aucun abonnement pour ce filtre.</td></tr>
                )}
                {filteredSubs.map((s) => {
                  const kid = s.childId ? kids.find((k) => k.id === s.childId) : undefined;
                  const parent = parentOf(s.clientUsername);
                  return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">
                      {kid ? (
                        <>
                          <p className="font-bold capitalize flex items-center gap-1.5">
                            {kid.cycle === 'lycee'
                              ? <GraduationCap className="w-4 h-4 text-amber-600" />
                              : <Baby className="w-4 h-4 text-emerald-600" />}
                            {kid.firstName} {kid.lastName}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <QrCode className="w-3 h-3" /> {kid.className} · {CYCLE_LABEL[kid.cycle ?? 'primaire']} · parent {parent ? `${parent.firstName} ${parent.lastName}` : s.clientUsername}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold capitalize">{parent ? `${parent.firstName} ${parent.lastName}` : s.clientUsername}</p>
                          <p className="text-xs text-slate-400">compte parent · {s.clientUsername}</p>
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{formulaName(s.formulaId)}</p>
                      <p className="mt-1">{cycleBadge(s.formulaId)}</p>
                    </td>
                    <td className="p-3 text-xs">{new Date(s.startDate).toLocaleDateString('fr-FR')} → {new Date(s.endDate).toLocaleDateString('fr-FR')}</td>
                    <td className="p-3 font-bold">{s.mealsRemaining}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${SUB_STATUS[s.status].style}`}>{SUB_STATUS[s.status].label}</span></td>
                    {!isDG && (
                      <td className="p-3">
                        {s.status === 'pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => handleEncaisser(s.id)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700">Encaisser & activer</button>
                            <button onClick={() => { cancelSubscription(s.id); setMessage('Réservation annulée.'); }} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">Annuler</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- FORMULES ---- */}
      {tab === 'formulas' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Formules d’abonnement</h2>
            </div>
            <button
              onClick={() => document.getElementById('formule-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700"
            >
              <Plus className="w-4 h-4" /> Ajouter un abonnement
            </button>
          </div>
          <form onSubmit={handleSaveFormula} className="bg-white rounded-2xl border p-5 grid md:grid-cols-3 gap-3">
            <div className="md:col-span-3 flex flex-wrap items-center gap-2">
              <p className="font-bold text-slate-800 flex items-center gap-2">
                {editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {editing ? 'Modifier la formule' : 'Nouvelle formule cantine'}
              </p>
            </div>
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">Nom de la formule *</span>
              <input id="formule-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex : Abonnement Mensuel — Lycée" maxLength={80} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500" required />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">Description (vue parent)</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="ex : 1 repas le midi, jours d’école, 30 jours" maxLength={140} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">Prix (FCFA) *</span>
              <input type="number" min={100} step={100} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="ex : 27000" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500" required />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">Prix barré (offre rentrée)</span>
              <input type="number" min={0} step={100} value={form.oldPrice} onChange={(e) => setForm({ ...form, oldPrice: e.target.value })} placeholder="vide = pas d’offre" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-bold text-slate-600 mb-1">Durée (jours) *</span>
                <input type="number" min={1} max={365} value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} placeholder="ex : 30" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500" required />
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-slate-600 mb-1">Repas inclus *</span>
                <input type="number" min={1} max={365} value={form.mealsIncluded} onChange={(e) => setForm({ ...form, mealsIncluded: e.target.value })} placeholder="ex : 20" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500" required />
              </label>
            </div>
            <label className="block md:col-span-2">
              <span className="block text-xs font-bold text-slate-600 mb-1">Règles cantine</span>
              <input value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} placeholder="ex : 1 repas/jour le midi, jours d’école" maxLength={140} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500" />
            </label>
            {previewPrice > 0 && previewMeals > 0 && (
              <p className="md:col-span-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-xs font-extrabold text-slate-800">
                ≈ {formatCurrency(pricePerMeal(previewPrice, previewMeals))} / repas · {previewMeals} repas · {Number(form.durationDays) || '?'} j
              </p>
            )}
            <div className="flex gap-2 md:col-span-3">
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm">{editing ? 'Enregistrer' : 'Créer la formule'}</button>
              {editing && <button type="button" onClick={resetForm} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm">Annuler</button>}
            </div>
          </form>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(isDG ? formulas : formulas.filter((f) => f.kind === 'subscription' && (f.id === 'F2' || f.id === 'F3' || !isOfficialFormula(f.id)))).map((f) => {
              const official = isOfficialFormula(f.id);
              const linked = subscriptions
                .filter((s) => s.formulaId === f.id && (s.status === 'active' || s.status === 'pending'))
                .sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1));
              const inUse = linked.length;
              return (
              <div key={f.id} className="bg-white rounded-3xl border-2 border-slate-100 p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 hover:border-emerald-200 transition-all flex flex-col">
                <div className="flex flex-wrap items-center gap-1.5">
                  {cycleBadge(f.id)}
                  {inUse > 0 && (
                    <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{inUse} en cours</span>
                  )}
                </div>
                <p className="mt-2.5 font-black text-slate-900 leading-snug">{f.name}</p>
                {f.description && <p className="mt-1 text-[13px] text-slate-500">{f.description}</p>}
                <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                  <p className="text-2xl font-black tracking-tight text-slate-900 tabular-nums">{formatCurrency(f.price)}</p>
                  {f.oldPrice && f.oldPrice > f.price && (
                    <span className="text-sm font-semibold text-slate-400 line-through tabular-nums">{formatCurrency(f.oldPrice)}</span>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-slate-500">{f.mealsIncluded} repas · {f.durationDays} jours · <span className="font-bold text-emerald-700">≈ {formatCurrency(pricePerMeal(f.price, f.mealsIncluded))} / repas</span></p>
                {!official && f.kind === 'subscription' ? (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => { setConfirmDelete(null); startEdit(f); }} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors">Modifier</button>
                    <button
                      onClick={() => {
                        if (confirmDelete !== f.id) { setConfirmDelete(f.id); return; }
                        setConfirmDelete(null);
                        if (inUse > 0) {
                          setMessage(`Suppression refusée : ${inUse} abonnement(s) utilisent encore « ${f.name} ».`);
                          return;
                        }
                        deleteFormula(f.id);
                        setMessage(`Formule « ${f.name} » supprimée.`);
                      }}
                      title={inUse > 0 ? 'Des abonnements utilisent cette formule' : 'Supprimer la formule'}
                      className={`px-3.5 py-2.5 rounded-xl font-bold transition-colors ${confirmDelete === f.id ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : null}
                {confirmDelete === f.id && !official && (
                  <p className="mt-2 text-[11px] font-bold text-red-600">Confirmer la suppression ? Cliquez à nouveau sur la corbeille.</p>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- PAIEMENTS ---- */}
      {tab === 'payments' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="text-left p-3">Référence</th><th className="text-left p-3">Parent / Enfant</th><th className="text-left p-3">Montant</th><th className="text-left p-3">Moyen</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Action</th></tr>
              </thead>
              <tbody>
                {payments.length === 0 && walletTxs.filter((t) => t.status === 'pending').length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun paiement.</td></tr>
                )}
                {walletTxs.filter((t) => t.status === 'pending').map((t) => {
                  const k = kids.find((c) => c.id === t.childId);
                  return (
                    <tr key={t.id} className="border-t bg-amber-50/50">
                      <td className="p-3 font-mono text-xs">{t.reference}</td>
                      <td className="p-3 font-semibold capitalize">Carte {k ? `${k.firstName} ${k.lastName}` : t.childId} (recharge)</td>
                      <td className="p-3 font-bold">{formatCurrency(t.amount)}</td>
                      <td className="p-3">{methodLabel(t.method)}</td>
                      <td className="p-3"><span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">En attente</span></td>
                      <td className="p-3">
                        {!isDG ? (
                          <button onClick={() => {
                            const ok = confirmWalletTopUp(t.id);
                            setMessage(ok ? `Recharge ${t.reference} confirmée.` : `Recharge ${t.reference} déjà traitée.`);
                          }} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Confirmer recharge
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">À confirmer au comptoir</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {[...payments].reverse().map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{p.reference}</td>
                    <td className="p-3">
                      <p className="font-semibold capitalize">{whoOfPayment(p)}</p>
                      {p.subscriptionId && (
                        <p className="text-xs text-slate-400">{formulaName(subscriptions.find((s) => s.id === p.subscriptionId)?.formulaId ?? '')}</p>
                      )}
                    </td>
                    <td className="p-3 font-bold">{formatCurrency(p.amount)}</td>
                    <td className="p-3">{methodLabel(p.method)}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${payStatus(p.status).style}`}>{payStatus(p.status).label}</span></td>
                    <td className="p-3">
                      {p.status === 'pending' ? (
                        !isDG ? (
                          <button onClick={() => {
                            const ok = confirmManualPayment(p.id);
                            setMessage(ok ? `Paiement ${p.reference} confirmé (réception externe vérifiée).` : `Paiement ${p.reference} déjà traité.`);
                          }} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Confirmer réception
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">En attente</span>
                        )
                      ) : p.status === 'paid' ? (
                        <button onClick={() => setReceipt(p)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 flex items-center gap-1">
                          <Receipt className="w-3 h-3" /> Reçu
                        </button>
                      ) : (
                        <span className="text-slate-300"><XCircle className="w-4 h-4" /></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- REÇU IMPRIMABLE ---- */}
      {receipt && (
        <PaymentReceiptModal
          payment={receipt}
          clientName={whoOfPayment(receipt)}
          formulaName={formulaName(subscriptions.find((s) => s.id === receipt.subscriptionId)?.formulaId ?? '')}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
};

export default SubscriptionsAdminPage;
