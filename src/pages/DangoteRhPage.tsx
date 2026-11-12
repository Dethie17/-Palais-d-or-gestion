import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Users, Plus, Wallet, History, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';

interface Employe { id: string; matricule: string; nom: string; prenom: string; service: string | null; actif: boolean; qr_token: string; }
interface Repas { id: string; employe_id: string; type_repas: string; prix: number; subvention_appliquee: number; retenue_salaire: number; date_jour: string; created_at: string; }
interface Ledger { id: string; type: string; montant: number; solde_apres: number; reference: string | null; created_at: string; }

const DangoteRhPage = () => {
  const { user } = useAuth();
  const entiteId = user?.entiteId ?? '';
  if (!user || (user.role !== 'rh' && user.role !== 'admin')) {
    return <div className="p-8 text-red-600 font-bold">Accès réservé à la Direction du Capital Humain.</div>;
  }
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [matricule, setMatricule] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [service, setService] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [repas, setRepas] = useState<Repas[]>([]);
  const [filterEmploye, setFilterEmploye] = useState('');

  const load = async () => {
    setLoading(true);
    const { data: e } = await supabase.from('dangote_employes').select('*').eq('entite_id', entiteId).order('nom');
    setEmployes((e as Employe[]) ?? []);
    const { data: l } = await supabase.from('dangote_credit_ledger').select('*').eq('entite_id', entiteId).order('created_at', { ascending: false });
    setLedger((l as Ledger[]) ?? []);
    const { data: r } = await supabase.from('dangote_repas').select('*').eq('entite_id', entiteId).order('created_at', { ascending: false });
    setRepas((r as Repas[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [entiteId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('dangote_employes').insert({
      entite_id: entiteId,
      matricule,
      nom,
      prenom,
      service,
      actif: true,
      qr_token: `qr-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    });
    if (error) { setError(error.message); return; }
    setMatricule(''); setNom(''); setPrenom(''); setService('');
    void load();
  };

  const solde = ledger.reduce((s, r) => s + Number(r.montant ?? 0), 0);

  const deposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) { setError('Montant invalide'); return; }
    const newSolde = solde + amount;
    const ref = `DEPOT-${Date.now()}`;
    const { error } = await supabase.from('dangote_credit_ledger').insert({
      entite_id: entiteId,
      type: 'achat',
      montant: amount,
      solde_apres: newSolde,
      reference: ref,
    });
    if (error) { setError(error.message); return; }
    // reçu PDF
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('O RESTO - FACTURE PRO', 20, 20);
    doc.setFontSize(12); doc.text('Dépôt budget Dangote', 20, 30);
    doc.text(`Référence: ${ref}`, 20, 45);
    doc.text(`Montant déposé: ${amount} FCFA`, 20, 55);
    doc.text(`Solde après dépôt: ${newSolde} FCFA`, 20, 65);
    doc.text(`Date: ${new Date().toLocaleString()}`, 20, 75);
    doc.text('Merci pour votre confiance.', 20, 90);
    doc.save(`facture-pro-${ref}.pdf`);
    setDepositAmount('');
    void load();
  };

  const filteredRepas = filterEmploye ? repas.filter((r) => r.employe_id === filterEmploye) : repas;
  const exportCsv = () => {
    const rows = ['Date,Heure,Employe,Type,Montant deduit'];
    filteredRepas.forEach((r) => {
      const emp = employes.find((e) => e.id === r.employe_id);
      rows.push(`${r.date_jour},${new Date(r.created_at).toLocaleTimeString()},${emp ? emp.prenom + ' ' + emp.nom : r.employe_id},${r.type_repas},${r.retenue_salaire}`);
    });
    const blob = new Blob([rows.join('\\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'historique-dangote.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Users className="w-6 h-6" /> Espace Direction du Capital Humain — Dangote</h1>
      <p className="text-slate-500">Bienvenue {user?.username}. Gestion des employés, dépôts et historique.</p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <p className="text-xs text-slate-500">Solde budget</p>
          <p className="text-2xl font-bold">{solde.toLocaleString()} FCFA</p>
        </div>
        <form onSubmit={deposit} className="bg-white rounded-2xl border p-4 flex flex-col gap-2 lg:col-span-2">
          <label className="text-sm font-bold">Nouveau dépôt (budget)</label>
          <div className="flex gap-2">
            <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} type="number" placeholder="Montant" className="flex-1 px-3 py-2 border rounded-xl" />
            <button className="px-4 py-2 bg-green-700 text-white rounded-xl font-bold flex items-center gap-2"><Wallet className="w-4 h-4" /> Déposer</button>
          </div>
        </form>
      </div>

      <form onSubmit={add} className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
        <input value={matricule} onChange={(e) => setMatricule(e.target.value)} placeholder="Matricule" className="px-3 py-2 border rounded-xl" required />
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" className="px-3 py-2 border rounded-xl" required />
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="px-3 py-2 border rounded-xl" required />
        <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Service" className="px-3 py-2 border rounded-xl" />
        <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Ajouter</button>
      </form>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="p-4 font-bold">Employés & QR codes</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
          {employes.map((e) => (
            <div key={e.id} className="border rounded-xl p-3 flex flex-col items-center gap-2">
              <p className="text-sm font-bold">{e.prenom} {e.nom}</p>
              <p className="text-xs text-slate-500">{e.matricule}</p>
              <QRCodeSVG value={e.qr_token} size={96} />
            </div>
          ))}
          {employes.length === 0 && <p className="text-slate-500">Aucun employé.</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="p-4 font-bold flex items-center gap-2"><History className="w-5 h-5" /> Historique consommation</div>
        <div className="p-4 flex gap-2 items-center">
          <label className="text-sm font-bold">Filtrer par employé</label>
          <select value={filterEmploye} onChange={(e) => setFilterEmploye(e.target.value)} className="px-3 py-2 border rounded-xl">
            <option value="">Tous</option>
            {employes.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
          <button onClick={exportCsv} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold">Exporter Excel (CSV)</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Heure</th><th className="p-3 text-left">Employé</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Montant déduit</th></tr></thead>
          <tbody>{filteredRepas.map((r) => {
            const emp = employes.find((e) => e.id === r.employe_id);
            return (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.date_jour}</td>
                <td className="p-3">{new Date(r.created_at).toLocaleTimeString()}</td>
                <td className="p-3">{emp ? `${emp.prenom} ${emp.nom}` : r.employe_id}</td>
                <td className="p-3">{r.type_repas}</td>
                <td className="p-3">{r.retenue_salaire}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {filteredRepas.length === 0 && <p className="p-4 text-slate-500">Aucune consommation.</p>}
      </div>
    </div>
  );
};

export default DangoteRhPage;
