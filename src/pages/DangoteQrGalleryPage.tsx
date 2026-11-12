import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Employe { id: string; matricule: string; nom: string; prenom: string; qr_token: string; }

const DangoteQrGalleryPage = () => {
  const { user } = useAuth();
  const entiteId = user?.entiteId ?? '';
  const [employes, setEmployes] = useState<Employe[]>([]);
  useEffect(() => { (async () => { const { data } = await supabase.from('dangote_employes').select('id,matricule,nom,prenom,qr_token').eq('entite_id', entiteId); setEmployes((data as Employe[]) ?? []); })(); }, [entiteId]);
  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><QrCode className="w-6 h-6" /> Gallerie QR Code</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {employes.map((e) => (
          <div key={e.id} className="bg-white rounded-2xl border p-4 flex flex-col items-center gap-2">
            <p className="font-bold text-sm">{e.prenom} {e.nom}</p>
            <p className="text-xs text-slate-500">{e.matricule}</p>
            <QRCodeSVG value={e.qr_token} size={120} />
          </div>
        ))}
      </div>
      {employes.length === 0 && <p className="text-slate-500">Aucun employé.</p>}
    </div>
  );
};

export default DangoteQrGalleryPage;
