import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Users, Plus, ScanLine, UtensilsCrossed, Camera } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';

interface Employe { id: string; matricule: string; nom: string; prenom: string; service: string | null; actif: boolean; qr_token: string; }

const DangoteSuperviseurPage = () => {
  const { user } = useAuth();
  const entiteId = user?.entiteId ?? '';
  if (!user || user.role !== 'superviseur-dangote') {
    return <div className="p-8 text-red-600 font-bold">Accès réservé au Superviseur MIAM'S.</div>;
  }
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [repasToday, setRepasToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [qrInput, setQrInput] = useState('');
  const [search, setSearch] = useState('');
  const [historyEmp, setHistoryEmp] = useState<Employe | null>(null);
  const [history, setHistory] = useState<{ id: string; type_repas: string; retenue_salaire: number; date_jour: string; created_at: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [selected, setSelected] = useState<Employe | null>(null);
  const [typeRepas, setTypeRepas] = useState<'standard' | 'premium'>('standard');
  const [params, setParams] = useState<{ prix_standard: number; prix_premium: number; subvention_jour: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'employe-dangote' });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('dangote_employes').select('*').eq('entite_id', entiteId).order('nom');
    setEmployes((data as Employe[]) ?? []);
    const today = new Date().toISOString().slice(0, 10);
    const { data: r } = await supabase.from('dangote_repas').select('id').eq('entite_id', entiteId).eq('date_jour', today);
    setRepasToday((r ?? []).length);
    const { data: p } = await supabase.from('dangote_parametres').select('*').eq('entite_id', entiteId).single();
    setParams(p);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [entiteId]);

  const loadHistory = async (emp: Employe) => {
    setHistoryEmp(emp);
    const { data } = await supabase.from('dangote_repas').select('id,type_repas,retenue_salaire,date_jour,created_at').eq('employe_id', emp.id).order('created_at', { ascending: false });
    setHistory((data as { id: string; type_repas: string; retenue_salaire: number; date_jour: string; created_at: string }[]) ?? []);
  };
  const startScan = async () => {
    setScanning(true);
    try {
      const scanner = new Html5Qrcode('dangote-scanner');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (text) => {
          setQrInput(text);
          void scanner.stop().then(() => { scannerRef.current = null; setScanning(false); });
        },
        () => {},
      );
    } catch {
      setScanning(false);
    }
  };
  const stopScan = async () => {
    if (scannerRef.current) { await scannerRef.current.stop().catch(() => undefined); scannerRef.current = null; }
    setScanning(false);
  };
  const findEmploye = () => {
    const e = employes.find((x) => x.qr_token === qrInput.trim());
    setSelected(e ?? null);
    if (!e) setMsg('Employé introuvable pour ce QR.');
    else setMsg(null);
  };

  const acheter = async () => {
    if (!selected || !params || !entiteId) return;
    setMsg(null);
    const prix = typeRepas === 'standard' ? params.prix_standard : params.prix_premium;
    // premier repas du jour ?
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase.from('dangote_repas').select('id').eq('employe_id', selected.id).eq('date_jour', today).eq('statut', 'valide');
    const premier = !existing || existing.length === 0;
    const subvention = premier ? params.subvention_jour : 0;
    const retenue = Math.max(0, prix - subvention);

    // solde budget
    const { data: ledger } = await supabase.from('dangote_credit_ledger').select('montant,type').eq('entite_id', entiteId);
    const solde = (ledger ?? []).reduce((s: number, r: { montant?: number }) => s + Number(r.montant ?? 0), 0);
    if (retenue > solde) { setMsg('Budget insuffisant. Demandez un nouveau dépôt au RH.'); return; }

    const { error } = await supabase.from('dangote_repas').insert({
      entite_id: entiteId,
      employe_id: selected.id,
      type_repas: typeRepas,
      prix,
      subvention_appliquee: subvention,
      retenue_salaire: retenue,
      date_jour: today,
      est_premier_repas_du_jour: premier,
      statut: 'valide',
    });
    if (error) { setMsg(error.message); return; }
    await supabase.from('dangote_credit_ledger').insert({
      entite_id: entiteId,
      type: 'consommation',
      montant: -retenue,
      solde_apres: solde - retenue,
      reference: `REPAS-${selected.matricule}-${Date.now()}`,
    });
    setMsg(`Repas validé pour ${selected.prenom} ${selected.nom}. Montant déduit : ${retenue} FCFA.`);
    setSelected(null); setQrInput('');
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUser.username, password: newUser.password, role: newUser.role, entiteId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Erreur');
      setMsg(`Utilisateur ${newUser.username} créé.`);
      setNewUser({ username: '', password: '', role: 'employe-dangote' });
      void load();
    } catch (err) {
      setMsg(err?.message ?? 'Erreur création');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><UtensilsCrossed className="w-6 h-6" /> Espace Superviseur MIAM'S — Dangote</h1>
      <p className="text-slate-500">Bienvenue {user?.username}. Back-office MIAM'S : validation des repas et gestion des comptes.</p>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4"><p className="text-xs text-slate-500">Employés</p><p className="text-2xl font-bold">{employes.length}</p></div>
        <div className="bg-white rounded-2xl border p-4"><p className="text-xs text-slate-500">Repas aujourd'hui</p><p className="text-2xl font-bold">{repasToday}</p></div>
        <div className="bg-white rounded-2xl border p-4"><p className="text-xs text-slate-500">Espace</p><p className="text-2xl font-bold">MIAM'S</p></div>
      </div>

      {msg && <p className="text-sm font-medium text-slate-700 bg-slate-100 rounded-xl p-3">{msg}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <h2 className="font-bold flex items-center gap-2"><ScanLine className="w-5 h-5" /> Valider un repas</h2>
          <div className="flex gap-2">
            <input value={qrInput} onChange={(e) => setQrInput(e.target.value)} placeholder="QR employé" className="flex-1 px-3 py-2 border rounded-xl" />
            <button onClick={findEmploye} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold">Chercher</button>
            <button onClick={scanning ? stopScan : startScan} className="px-4 py-2 bg-green-700 text-white rounded-xl font-bold flex items-center gap-2"><Camera className="w-4 h-4" /> {scanning ? 'Arrêter' : 'Scanner'}</button>
          </div>
          <div id="dangote-scanner" className="w-full max-w-sm mx-auto" />
          {selected && (
            <div className="space-y-3">
              <p className="font-medium">{selected.prenom} {selected.nom} — {selected.matricule}</p>
              <div className="flex gap-2">
                <button onClick={() => setTypeRepas('standard')} className={`px-3 py-2 rounded-xl font-bold ${typeRepas === 'standard' ? 'bg-green-700 text-white' : 'border'}`}>Standard</button>
                <button onClick={() => setTypeRepas('premium')} className={`px-3 py-2 rounded-xl font-bold ${typeRepas === 'premium' ? 'bg-green-700 text-white' : 'border'}`}>Premium</button>
              </div>
              <button onClick={acheter} className="w-full py-3 bg-green-700 text-white rounded-xl font-bold">J'achète mon repas</button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <h2 className="font-bold flex items-center gap-2"><Users className="w-5 h-5" /> Créer un utilisateur</h2>
          <form onSubmit={createUser} className="space-y-3">
            <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} placeholder="Nom d'utilisateur" className="w-full px-3 py-2 border rounded-xl" required />
            <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Mot de passe" type="password" className="w-full px-3 py-2 border rounded-xl" required />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="w-full px-3 py-2 border rounded-xl">
              <option value="employe-dangote">Employé Dangote</option>
              <option value="rh">Direction du Capital Humain</option>
              <option value="superviseur-dangote">Superviseur MIAM'S</option>
            </select>
            <button disabled={creating} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> {creating ? 'Création…' : 'Créer'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="p-4 flex items-center gap-3">
          <span className="font-bold">Employés ({employes.length})</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="ml-auto px-3 py-2 border rounded-xl" />
        </div>
        {loading ? <p className="p-4">Chargement…</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-left">Matricule</th><th className="p-3 text-left">Nom</th><th className="p-3 text-left">Prénom</th><th className="p-3 text-left">Service</th><th className="p-3 text-left">QR</th><th className="p-3 text-left">Action</th></tr></thead>
            <tbody>{employes.filter((e) => (`${e.prenom} ${e.nom} ${e.matricule}`).toLowerCase().includes(search.toLowerCase())).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{e.matricule}</td><td className="p-3">{e.nom}</td><td className="p-3">{e.prenom}</td><td className="p-3">{e.service ?? '—'}</td>
                <td className="p-3"><QRCodeSVG value={e.qr_token} size={48} /></td>
                <td className="p-3"><button onClick={() => loadHistory(e)} className="text-sm font-bold text-green-700">Voir consommation</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {historyEmp && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="p-4 font-bold">Consommation — {historyEmp.prenom} {historyEmp.nom}</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Heure</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Montant</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id} className="border-t">
                <td className="p-3">{h.date_jour}</td>
                <td className="p-3">{new Date(h.created_at).toLocaleTimeString()}</td>
                <td className="p-3">{h.type_repas}</td>
                <td className="p-3">{h.retenue_salaire}</td>
              </tr>
            ))}</tbody>
          </table>
          {history.length === 0 && <p className="p-4 text-slate-500">Aucune consommation.</p>}
        </div>
      )}
    </div>
  );
};

export default DangoteSuperviseurPage;
