import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { QrCode, UtensilsCrossed } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Employe { id: string; matricule: string; nom: string; prenom: string; service: string | null; qr_token: string; }
interface Repas { id: string; type_repas: string; prix: number; subvention_appliquee: number; retenue_salaire: number; date_jour: string; created_at: string; }

const DangoteEmployePage = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'employe-dangote') {
    return <div className="p-8 text-red-600 font-bold">Accès réservé à l'Employé Dangote.</div>;
  }
  const [employe, setEmploye] = useState<Employe | null>(null);
  const [repas, setRepas] = useState<Repas[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // La fiche est reliée au compte Auth (user_id). Le matricule reste un
      // repli pour les employés ajoutés par le RH sans compte de connexion.
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      let employeRow: Employe | null = null;
      if (uid) {
        const { data } = await supabase.from('dangote_employes').select('*').eq('user_id', uid).maybeSingle();
        employeRow = (data as Employe | null) ?? null;
      }
      if (!employeRow) {
        const { data } = await supabase.from('dangote_employes').select('*').eq('matricule', user?.username ?? '').maybeSingle();
        employeRow = (data as Employe | null) ?? null;
      }
      setEmploye(employeRow);
      if (employeRow?.id) {
        const { data: r } = await supabase.from('dangote_repas').select('*').eq('employe_id', employeRow.id).order('created_at', { ascending: false });
        setRepas((r as Repas[]) ?? []);
      }
      setLoading(false);
    })();
  }, [user?.username]);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><QrCode className="w-6 h-6" /> Espace Employé Dangote</h1>
      {loading ? <p>Chargement…</p> : !employe ? <p className="text-slate-500">Aucun profil employé lié.</p> : (
        <>
          <div className="bg-white rounded-2xl border p-6 flex flex-col items-center gap-3">
            <p className="font-bold">{employe.prenom} {employe.nom} — {employe.matricule}</p>
            <QRCodeSVG value={employe.qr_token} size={220} />
            <p className="text-xs text-slate-500 font-mono">{employe.qr_token}</p>
          </div>
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 font-bold flex items-center gap-2"><UtensilsCrossed className="w-5 h-5" /> Mes repas</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Prix</th><th className="p-3 text-left">Subvention</th><th className="p-3 text-left">Retenue</th></tr></thead>
              <tbody>{repas.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.date_jour} {new Date(r.created_at).toLocaleTimeString()}</td>
                  <td className="p-3">{r.type_repas}</td>
                  <td className="p-3">{r.prix}</td>
                  <td className="p-3">{r.subvention_appliquee}</td>
                  <td className="p-3">{r.retenue_salaire}</td>
                </tr>
              ))}</tbody>
            </table>
            {repas.length === 0 && <p className="p-4 text-slate-500">Aucun repas.</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default DangoteEmployePage;
