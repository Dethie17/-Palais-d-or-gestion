import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Building2, Plus, Power } from 'lucide-react';

interface Entite {
  id: string;
  nom: string;
  slug: string;
  statut: 'actif' | 'inactif';
  created_at: string;
}

const EntitiesPage = () => {
  const { user } = useAuth();
  const [entities, setEntities] = useState<Entite[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const spacesBySlug: Record<string, string[]> = {
    'groupe-ism': ['Espace Caissier', 'Espace Parent', 'Espace Superviseur', 'Espace ISM'],
    'dangote': ['Espace Ressource Humaine', 'Espace Employé', 'Espace Superviseur'],
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('entites').select('*').order('created_at');
    if (error) setError(error.message);
    else setEntities((data as Entite[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('entites').insert({ nom: name, slug, statut: 'actif' });
    if (error) { setError(error.message); return; }
    setName(''); setSlug(''); void load();
  };

  const toggle = async (ent: Entite) => {
    const next = ent.statut === 'actif' ? 'inactif' : 'actif';
    const { error } = await supabase.from('entites').update({ statut: next }).eq('id', ent.id);
    if (error) { setError(error.message); return; }
    void load();
  };

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-slate-500">Accès réservé à l’Espace ISM.</div>;
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Building2 className="w-6 h-6" /> Gestion des entités
      </h1>

      <form onSubmit={create} className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-bold text-slate-600">Nom</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 px-3 py-2 border rounded-xl" required />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600">Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 px-3 py-2 border rounded-xl" required />
        </div>
        <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Créer
        </button>
      </form>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : (
        <div className="grid gap-3">
          {entities.map((e) => (
            <div key={e.id} className="bg-white rounded-2xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">{e.nom}</p>
                  <p className="text-xs text-slate-500">{e.slug} · {e.statut}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setOpenId(openId === e.id ? null : e.id)} className="px-3 py-2 rounded-xl border text-sm font-bold">
                    {openId === e.id ? 'Masquer' : 'Voir les espaces'}
                  </button>
                  <button onClick={() => toggle(e)} className="px-3 py-2 rounded-xl border flex items-center gap-2 text-sm font-bold">
                    <Power className="w-4 h-4" /> {e.statut === 'actif' ? 'Désactiver' : 'Activer'}
                  </button>
                </div>
              </div>
              {openId === e.id && (
                <div className="flex flex-wrap gap-2">
                  {(spacesBySlug[e.slug] ?? []).map((s) => (
                    <span key={s} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">{s}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EntitiesPage;