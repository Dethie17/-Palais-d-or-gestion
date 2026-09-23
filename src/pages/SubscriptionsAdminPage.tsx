import { useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { Formula, SubscriptionStatus } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import {
  Users, CreditCard, Banknote, CheckCircle, XCircle, Plus, Trash2, Pencil, Clock, Ticket, CalendarDays, Receipt,
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

const SubscriptionsAdminPage = () => {
  const {
    subscriptions, formulas, payments, establishments,
    paySubscription, confirmCashPayment, cancelSubscription,
    addFormula, updateFormula, deleteFormula,
  } = useResto();
  const [tab, setTab] = useState<Tab>('subs');
  const [filter, setFilter] = useState<'all' | SubscriptionStatus>('all');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [editing, setEditing] = useState<Formula | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', durationDays: '', mealsIncluded: '', rules: '', kind: 'subscription' as 'subscription' | 'ticket' });

  const formulaName = (id: string) => formulas.find((f) => f.id === id)?.name ?? id;
  const clientOf = (subId?: string | null) => subscriptions.find((s) => s.id === subId)?.clientUsername ?? '—';

  const filteredSubs = subscriptions.filter((s) => filter === 'all' || s.status === filter);
  const pendingPayments = payments.filter((p) => p.status === 'pending');

  const handleEncaisser = (subId: string) => {
    const { payment } = paySubscription(subId, 'cash');
    confirmCashPayment(payment.id);
    setMessage(`Espèces encaissées — abonnement activé (paiement ${payment.reference}).`);
  };

  const startEdit = (f: Formula) => {
    setEditing(f);
    setForm({
      name: f.name, description: f.description, price: String(f.price),
      durationDays: String(f.durationDays), mealsIncluded: String(f.mealsIncluded),
      rules: f.rules ?? '', kind: f.kind,
    });
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ name: '', description: '', price: '', durationDays: '', mealsIncluded: '', rules: '', kind: 'subscription' });
  };

  const handleSaveFormula = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(), description: form.description.trim(),
      price: Number(form.price) || 0, durationDays: Number(form.durationDays) || 0,
      mealsIncluded: Number(form.mealsIncluded) || 0, rules: form.rules.trim(), kind: form.kind,
    };
    if (!payload.name || payload.price <= 0 || payload.mealsIncluded <= 0) {
      setMessage('Nom, prix et nombre de repas sont obligatoires.');
      return;
    }
    if (editing) {
      updateFormula(editing.id, payload);
      setMessage(`Formule « ${payload.name} » mise à jour.`);
    } else {
      addFormula(payload);
      setMessage(`Formule « ${payload.name} » créée.`);
    }
    resetForm();
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Abonnements & formules</h1>
        <p className="text-slate-500 text-sm">Back-office : clients abonnés, offres, encaissements et paiements.</p>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-sm text-green-800 flex gap-2">
          <CheckCircle className="w-5 h-5 flex-shrink-0" /> {message}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 bg-white border rounded-2xl p-2">
        {([
          { id: 'subs', label: `Abonnés (${subscriptions.length})`, icon: <Users className="w-4 h-4" /> },
          { id: 'formulas', label: `Formules (${formulas.length})`, icon: <CreditCard className="w-4 h-4" /> },
          { id: 'payments', label: `Paiements (${payments.length})`, icon: <Banknote className="w-4 h-4" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-bold ${tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
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
                <tr><th className="text-left p-3">Client</th><th className="text-left p-3">Formule</th><th className="text-left p-3">Période</th><th className="text-left p-3">Repas rest.</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Actions</th></tr>
              </thead>
              <tbody>
                {filteredSubs.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun abonnement.</td></tr>
                )}
                {filteredSubs.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-3 font-semibold capitalize">{s.clientUsername}</td>
                    <td className="p-3">{formulaName(s.formulaId)}</td>
                    <td className="p-3 text-xs">{new Date(s.startDate).toLocaleDateString('fr-FR')} → {new Date(s.endDate).toLocaleDateString('fr-FR')}</td>
                    <td className="p-3 font-bold">{s.mealsRemaining}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${SUB_STATUS[s.status].style}`}>{SUB_STATUS[s.status].label}</span></td>
                    <td className="p-3">
                      {s.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => handleEncaisser(s.id)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700">Encaisser & activer</button>
                          <button onClick={() => { cancelSubscription(s.id); setMessage('Réservation annulée.'); }} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">Annuler</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- FORMULES ---- */}
      {tab === 'formulas' && (
        <div className="space-y-4">
          <form onSubmit={handleSaveFormula} className="bg-white rounded-2xl border p-5 grid md:grid-cols-3 gap-3">
            <p className="md:col-span-3 font-bold text-slate-800 flex items-center gap-2">
              {editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {editing ? 'Modifier la formule' : 'Nouvelle formule'}
            </p>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom *" className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" />
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'subscription' | 'ticket' })} className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500">
              <option value="subscription">Abonnement (période)</option>
              <option value="ticket">Ticket (achat rapide)</option>
            </select>
            <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Prix FCFA *" className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
            <input type="number" min="1" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} placeholder="Durée (jours) *" className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
            <input type="number" min="1" value={form.mealsIncluded} onChange={(e) => setForm({ ...form, mealsIncluded: e.target.value })} placeholder="Repas inclus *" className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
            <input value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} placeholder="Règles (ex : 1 repas/jour le midi)" className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500 md:col-span-2" />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm">{editing ? 'Enregistrer' : 'Créer'}</button>
              {editing && <button type="button" onClick={resetForm} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm">Annuler</button>}
            </div>
          </form>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {formulas.map((f) => (
              <div key={f.id} className="bg-white rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{f.name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      {f.kind === 'ticket' ? <Ticket className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
                      {f.kind === 'ticket' ? 'Ticket' : 'Abonnement'} • {f.mealsIncluded} repas • {f.durationDays} j
                    </p>
                  </div>
                  <p className="font-extrabold">{formatCurrency(f.price)}</p>
                </div>
                {f.rules && <p className="text-xs text-slate-400 italic mt-1">{f.rules}</p>}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => startEdit(f)} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">Modifier</button>
                  <button onClick={() => { deleteFormula(f.id); setMessage(`Formule « ${f.name} » supprimée.`); }} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- PAIEMENTS ---- */}
      {tab === 'payments' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          {pendingPayments.length > 0 && (
            <p className="p-3 bg-amber-50 text-amber-800 text-sm font-semibold border-b flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> {pendingPayments.length} paiement(s) en attente d’encaissement — {establishments.length} site(s) : {establishments.map((e) => e.name).join(', ')}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="text-left p-3">Référence</th><th className="text-left p-3">Client</th><th className="text-left p-3">Montant</th><th className="text-left p-3">Moyen</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Action</th></tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun paiement.</td></tr>
                )}
                {[...payments].reverse().map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{p.reference}</td>
                    <td className="p-3 font-semibold capitalize">{clientOf(p.subscriptionId)}</td>
                    <td className="p-3 font-bold">{formatCurrency(p.amount)}</td>
                    <td className="p-3">{p.method}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${p.status === 'paid' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span></td>
                    <td className="p-3">
                      {p.status === 'pending' && p.method === 'cash' ? (
                        <button onClick={() => { confirmCashPayment(p.id); setMessage(`Paiement ${p.reference} encaissé.`); }} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Encaisser
                        </button>
                      ) : p.status === 'pending' ? (
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">En attente du code client</span>
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
          clientName={clientOf(receipt.subscriptionId)}
          formulaName={formulaName(subscriptions.find((s) => s.id === receipt.subscriptionId)?.formulaId ?? '')}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
};

export default SubscriptionsAdminPage;
