import { useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { Trash2, Plus } from 'lucide-react';

const EstablishmentsPage = () => {
  const { establishments, addEstablishment, deleteEstablishment } = useResto();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [manager, setManager] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addEstablishment({ name: name.trim(), address: address.trim(), manager: manager.trim() });
    setName('');
    setAddress('');
    setManager('');
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Établissements</h1>
        <p className="text-slate-500 text-sm">Écoles et entreprises partenaires O RESTO.</p>
      </div>

      <form onSubmit={handleAdd} className="bg-white rounded-2xl border shadow p-5 grid md:grid-cols-4 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom *" className="px-4 py-3 rounded-xl border-2 border-slate-200 outline-none focus:border-orange-500" required />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse" className="px-4 py-3 rounded-xl border-2 border-slate-200 outline-none focus:border-orange-500" />
        <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Responsable" className="px-4 py-3 rounded-xl border-2 border-slate-200 outline-none focus:border-orange-500" />
        <button type="submit" className="flex items-center justify-center gap-1 py-3 bg-slate-800 text-white font-bold rounded-xl text-sm">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </form>

      <div className="grid md:grid-cols-2 gap-4">
        {establishments.map((e) => (
          <div key={e.id} className="bg-white rounded-2xl border p-5 flex justify-between gap-3">
            <div>
              <p className="font-bold">{e.name}</p>
              <p className="text-sm text-slate-500">{e.address || 'Adresse non renseignée'}</p>
              {e.manager && <p className="text-xs text-slate-400">Resp. : {e.manager}</p>}
              {e.phone && <p className="text-xs text-slate-400">{e.phone}</p>}
            </div>
            <button onClick={() => deleteEstablishment(e.id)} className="self-start p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EstablishmentsPage;
