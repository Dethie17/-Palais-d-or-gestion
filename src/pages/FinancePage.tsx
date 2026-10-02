import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '@/context/AppContext';
import { useResto } from '@/context/RestoContext';
import { useAuth } from '@/context/AuthContext';
import type { ExpenseCategory } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { ismPeriod } from '@/lib/ismFinance';
import {
  Banknote, Wallet, ShoppingCart, Percent, Settings2, Download, FileSpreadsheet, CheckCircle, ReceiptText, Plus,
} from 'lucide-react';

type Period = 'day' | 'week' | 'month' | 'all';

function startOf(period: Period): number {
  const now = new Date();
  if (period === 'all') return 0;
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === 'week') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * Finance DG : comptabilité complète — ventes caisse, abonnements,
 * recharges cartes, solde à verser à l'ISM et TouchPoint.
 * Taux éditables par le DG.
 */
const FinancePage = () => {
  const { orders } = useApp();
  const {
    payments, walletTxs, financeSettings, setFinanceSettings, children: kids,
    financeExpenses, addExpense, subscriptions, formulas,
  } = useResto();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';
  const [period, setPeriod] = useState<Period>('month');
  const [saved, setSaved] = useState(false);
  const [rates, setRates] = useState({
    ismPerSubscription: financeSettings.ismPerSubscription,
    ismSalesPct: financeSettings.ismSalesPct,
    schoolPerSubscription: financeSettings.schoolPerSubscription,
    otherSalesPct: financeSettings.otherSalesPct,
    touchpointPct: financeSettings.touchpointPct,
  });

  const since = startOf(period);
  const paidAbo = useMemo(
    () => payments.filter((p) => p.status === 'paid' && new Date(p.createdAt).getTime() >= since),
    [payments, since],
  );
  const caisse = useMemo(
    () => orders.filter((o) => o.status === 'completed' && o.createdAt.getTime() >= since),
    [orders, since],
  );
  const topups = useMemo(
    () => walletTxs.filter((t) => t.kind === 'topup' && t.status === 'paid' && new Date(t.createdAt).getTime() >= since),
    [walletTxs, since],
  );
  const debits = useMemo(
    () => walletTxs.filter((t) => t.kind === 'debit' && t.status === 'paid' && new Date(t.createdAt).getTime() >= since),
    [walletTxs, since],
  );

  const salesGross = caisse.reduce((s, o) => s + o.total, 0);
  const aboGross = paidAbo.reduce((s, p) => s + p.amount, 0);
  const rechargeGross = topups.reduce((s, t) => s + t.amount, 0);
  const walletMeals = debits.reduce((s, t) => s + t.amount, 0);
  // Comptabilité ISM 2026 : 2000 FCFA par abonnement payé (lycée comme
  // préscolaire-élémentaire) + ismSalesPct % des ventes caisse.
  // École : 2000 / abo ; 0,5% TouchPoint (base électronique = abos + recharges).
  const ism = ismPeriod(payments, caisse, subscriptions, formulas, financeSettings, since);
  const ismAbo = ism.ismAbo;
  const ismSalesDue = ism.ismSales;
  const ismTotal = ism.total;
  const schoolDue = paidAbo.length * financeSettings.schoolPerSubscription;
  const otherSalesDue = Math.round(salesGross * financeSettings.otherSalesPct / 100);
  const electronicBase = aboGross + rechargeGross;
  const touchpointFees = Math.round(electronicBase * financeSettings.touchpointPct / 100);
  const periodExpenses = useMemo(
    () => financeExpenses.filter((e) => new Date(e.spentAt).getTime() >= since),
    [financeExpenses, since],
  );
  const expensesTotal = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const net = salesGross + aboGross - ismTotal - schoolDue - otherSalesDue - touchpointFees - expensesTotal;

  const childName = (id: string) => {
    const k = kids.find((c) => c.id === id);
    return k ? `${k.firstName} ${k.lastName} (${k.className})` : id;
  };

  const saveRates = () => {
    setFinanceSettings({
      ismPerSubscription: Number(rates.ismPerSubscription) || 0,
      ismSalesPct: Number(rates.ismSalesPct) || 0,
      schoolPerSubscription: Number(rates.schoolPerSubscription) || 0,
      otherSalesPct: Number(rates.otherSalesPct) || 0,
      touchpointPct: Number(rates.touchpointPct) || 0,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const exportCSV = () => {
    const rows: string[][] = [];
    rows.push(['O RESTO — Finance']);
    rows.push([`Période,${period}`]);
    rows.push([]);
    rows.push(['Rubrique', 'Montant FCFA']);
    rows.push(['Ventes caisse', String(salesGross)]);
    rows.push(['Abonnements', String(aboGross)]);
    rows.push(['Recharges cartes', String(rechargeGross)]);
    rows.push(['Repas débités wallet', String(walletMeals)]);
    rows.push([`Part ISM abonnements (${financeSettings.ismPerSubscription} x ${ism.aboCount} abos)`, String(ismAbo)]);
    rows.push([`Part ISM ventes (${financeSettings.ismSalesPct}%)`, String(ismSalesDue)]);
    rows.push(['Solde ISM à verser', String(ismTotal)]);
    rows.push([`Reversement école (${financeSettings.schoolPerSubscription} x ${paidAbo.length} abos)`, String(schoolDue)]);
    rows.push([`Autres ventes (${financeSettings.otherSalesPct}%)`, String(otherSalesDue)]);
    rows.push([`TouchPoint (${financeSettings.touchpointPct}%)`, String(touchpointFees)]);
    rows.push(['Dépenses', String(expensesTotal)]);
    rows.push(['Net (après parts et dépenses)', String(net)]);
    const csv = '﻿' + rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance-${period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    let y = 16;
    doc.setFontSize(16);
    doc.text('O RESTO — Finance', 14, y);
    y += 8;
    doc.setFontSize(11);
    const lines = [
      `Ventes caisse : ${salesGross} FCFA`,
      `Abonnements : ${aboGross} FCFA`,
      `Recharges cartes : ${rechargeGross} FCFA`,
      `Part ISM abonnements (${financeSettings.ismPerSubscription} x ${ism.aboCount}) : ${ismAbo} FCFA`,
      `Part ISM ventes (${financeSettings.ismSalesPct}%) : ${ismSalesDue} FCFA`,
      `Solde ISM à verser : ${ismTotal} FCFA`,
      `Reversement ecole (${financeSettings.schoolPerSubscription} x ${paidAbo.length}) : ${schoolDue} FCFA`,
      `Autres ventes (${financeSettings.otherSalesPct}%) : ${otherSalesDue} FCFA`,
      `TouchPoint (${financeSettings.touchpointPct}%) : ${touchpointFees} FCFA`,
      `Dépenses : ${expensesTotal} FCFA`,
      `Net (après parts et dépenses) : ${net} FCFA`,
    ];
    lines.forEach((l) => { doc.text(l, 14, y); y += 7; });
    doc.save(`finance-${period}.pdf`);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white p-6 md:p-8 shadow-xl">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300 flex items-center gap-1.5">
              <Banknote className="w-4 h-4" /> Direction · Comptabilité
            </p>
            <h1 className="mt-1 text-3xl md:text-4xl font-black tracking-tight">Finance</h1>
            <p className="text-sm text-slate-300 mt-1">Ventes, abonnements, solde ISM, école et TouchPoint.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 bg-white/10 border border-white/15 rounded-full p-1 backdrop-blur">
              {(['day', 'week', 'month', 'all'] as Period[]).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${period === p ? 'bg-white text-slate-900 shadow' : 'text-slate-200 hover:bg-white/10'}`}>
                  {p === 'day' ? 'Jour' : p === 'week' ? 'Semaine' : p === 'month' ? 'Mois' : 'Tout'}
                </button>
              ))}
            </div>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-xs font-bold hover:bg-white/20"><FileSpreadsheet className="w-4 h-4" /> CSV</button>
            <button onClick={exportPDF} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-400 text-slate-900 text-xs font-extrabold hover:bg-amber-300 shadow"><Download className="w-4 h-4" /> PDF</button>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Encaissé : <strong>{formatCurrency(salesGross + aboGross + rechargeGross)}</strong></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Solde ISM : <strong>{formatCurrency(ismTotal)}</strong></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400" />Net : <strong>{formatCurrency(net)}</strong></span>
        </div>
      </div>

      <FinSection kicker="Vue d'ensemble" title="Chiffres clés de la période">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ventes caisse', value: salesGross, icon: <ShoppingCart className="w-5 h-5" />, chip: 'from-green-600 to-emerald-600' },
          { label: 'Abonnements', value: aboGross, icon: <Wallet className="w-5 h-5" />, chip: 'from-emerald-500 to-teal-600' },
          { label: 'Recharges cartes', value: rechargeGross, icon: <Banknote className="w-5 h-5" />, chip: 'from-orange-500 to-amber-500' },
          { label: 'Net (après parts)', value: net, icon: <CheckCircle className="w-5 h-5" />, chip: 'from-amber-500 to-orange-600' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-3xl border p-5 shadow-sm hover:shadow-md transition-shadow">
            <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${c.chip} flex items-center justify-center text-white shadow`}>
              {c.icon}
            </span>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-3">{c.label}</p>
            <p className="text-2xl font-black mt-0.5 tracking-tight text-slate-900">{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>
      </FinSection>

      <FinSection kicker="Reversements" title="Solde et parts à verser">
      <div className="rounded-3xl overflow-hidden border border-amber-300/50 shadow-lg">
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white p-5 md:p-6 flex flex-wrap items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0">
            <Percent className="w-7 h-7 text-white" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Solde ISM à verser — {period === 'month' ? 'ce mois' : period === 'day' ? "aujourd'hui" : period === 'week' ? 'cette semaine' : 'total'}</p>
            <p className="text-4xl font-black tracking-tight text-white">{formatCurrency(ismTotal)}</p>
          </div>
          <div className="ml-auto flex flex-col gap-1.5 text-xs font-bold">
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15">{ism.aboCount} abo(s) × {formatCurrency(financeSettings.ismPerSubscription)} = {formatCurrency(ismAbo)}</span>
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15">Ventes × {financeSettings.ismSalesPct}% = {formatCurrency(ismSalesDue)}</span>
          </div>
        </div>
        <div className="bg-white p-4 md:p-5">
        <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
          <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-50 to-orange-50 border border-amber-200 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">ISM · abonnements</p>
            <p className="text-xl font-black mt-0.5">{formatCurrency(ismAbo)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{financeSettings.ismPerSubscription} × {ism.aboCount} abo(s)</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-50 to-orange-50 border border-amber-200 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">ISM · ventes</p>
            <p className="text-xl font-black mt-0.5">{formatCurrency(ismSalesDue)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{financeSettings.ismSalesPct}% de la caisse</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">École</p>
            <p className="text-xl font-black mt-0.5">{formatCurrency(schoolDue)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{financeSettings.schoolPerSubscription} × {paidAbo.length} abo(s)</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Autres ventes</p>
            <p className="text-xl font-black mt-0.5">{formatCurrency(otherSalesDue)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{financeSettings.otherSalesPct}% de la caisse</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">TouchPoint</p>
            <p className="text-xl font-black mt-0.5">{formatCurrency(touchpointFees)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{financeSettings.touchpointPct}% électronique</p>
          </div>
        </div>
        {canEdit ? (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border">
            <p className="text-xs font-bold text-slate-600 flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> Taux (DG uniquement)</p>
            <div className="mt-2 grid sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <label className="text-xs">ISM / abo (FCFA)<input type="number" min={0} value={rates.ismPerSubscription} onChange={(e) => setRates({ ...rates, ismPerSubscription: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm" /></label>
              <label className="text-xs">ISM ventes %<input type="number" min={0} max={100} step="0.1" value={rates.ismSalesPct} onChange={(e) => setRates({ ...rates, ismSalesPct: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm" /></label>
              <label className="text-xs">École / abo<input type="number" min={0} value={rates.schoolPerSubscription} onChange={(e) => setRates({ ...rates, schoolPerSubscription: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm" /></label>
              <label className="text-xs">Autres ventes %<input type="number" min={0} max={100} step="0.1" value={rates.otherSalesPct} onChange={(e) => setRates({ ...rates, otherSalesPct: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm" /></label>
              <label className="text-xs">TouchPoint %<input type="number" min={0} max={100} step="0.1" value={rates.touchpointPct} onChange={(e) => setRates({ ...rates, touchpointPct: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm" /></label>
              <div className="flex items-end">
                <button onClick={saveRates} className="w-full py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Enregistrer</button>
              </div>
            </div>
            {saved && <p className="text-xs text-green-700 font-bold mt-2">Taux enregistrés.</p>}
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-3">Lecture seule : seuls le DG et son adjoint modifient les taux.</p>
        )}
        </div>
      </div>
      </FinSection>

      <FinSection kicker="Charges" title="Dépenses d'exploitation">
      <ExpenseSection
        expenses={periodExpenses}
        total={expensesTotal}
        canEdit={canEdit}
        onAdd={(label, category, amount, date) => addExpense(label, category, amount, date, user?.username)}
      />
      </FinSection>

      <FinSection kicker="Traçabilité" title="Mouvements cartes">
      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
        <p className="p-4 font-bold text-slate-800">Mouvements cartes (recharges + débits)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Enfant</th><th className="text-left p-3">Opération</th><th className="text-left p-3">Montant</th><th className="text-left p-3">Statut</th></tr>
            </thead>
            <tbody>
              {[...topups, ...debits].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 50).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3 text-xs">{new Date(t.createdAt).toLocaleString('fr-FR')}</td>
                  <td className="p-3 font-semibold">{childName(t.childId)}</td>
                  <td className="p-3">{t.kind === 'topup' ? 'Recharge' : 'Débit repas'} • {t.method}</td>
                  <td className={`p-3 font-bold ${t.kind === 'topup' ? 'text-green-700' : ''}`}>{t.kind === 'topup' ? '+' : '−'}{formatCurrency(t.amount)}</td>
                  <td className="p-3"><span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">{t.status}</span></td>
                </tr>
              ))}
              {topups.length + debits.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400">Aucun mouvement sur la période.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </FinSection>
    </div>
  );
};

function FinSection({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 mb-1">
        {kicker}
      </p>
      <h2 className="text-lg font-black tracking-tight text-slate-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}

const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [  { id: 'loyer', label: 'Loyer' },
  { id: 'salaires', label: 'Salaires' },
  { id: 'fournisseurs', label: 'Fournisseurs' },
  { id: 'transport', label: 'Transport' },
  { id: 'equipement', label: 'Équipement' },
  { id: 'divers', label: 'Divers' },
];

function ExpenseSection({ expenses, total, canEdit, onAdd }: {
  expenses: { id: string; label: string; category: string; amount: number; spentAt: string }[];
  total: number;
  canEdit: boolean;
  onAdd: (label: string, category: ExpenseCategory, amount: number, date: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('fournisseurs');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!label.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Libellé et montant valide requis.');
      return;
    }
    try {
      onAdd(label.trim(), category, value, new Date(date || Date.now()).toISOString());
      setLabel('');
      setAmount('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ajout impossible.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <p className="font-bold text-slate-800 flex items-center gap-2"><ReceiptText className="w-5 h-5 text-slate-500" /> Dépenses</p>
        <p className="font-black text-red-700">−{formatCurrency(total)}</p>
      </div>
      {canEdit && (
        <form onSubmit={submit} className="mx-4 mb-4 p-4 rounded-xl bg-slate-50 border grid sm:grid-cols-5 gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé (ex : loyer cantine) *" className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600 sm:col-span-2" />
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white">
            {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant *" className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600" />
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm flex-1 min-w-0" />
            <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center gap-1"><Plus className="w-4 h-4" /> Ajouter</button>
          </div>
          {error && <p className="text-xs text-red-600 font-bold sm:col-span-5">{error}</p>}
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Libellé</th><th className="text-left p-3">Catégorie</th><th className="text-left p-3">Montant</th></tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-slate-400">Aucune dépense sur la période.</td></tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3 text-xs">{new Date(e.spentAt).toLocaleDateString('fr-FR')}</td>
                <td className="p-3 font-semibold">{e.label}</td>
                <td className="p-3">{EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label ?? e.category}</td>
                <td className="p-3 font-bold text-red-700">−{formatCurrency(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default FinancePage;
