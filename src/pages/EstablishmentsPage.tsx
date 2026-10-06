import { useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { getRoleDef } from '@/lib/roleTasks';
import { useAuth } from '@/context/AuthContext';
import { Building2, Plus, Pencil, Trash2, Check, X, MapPin, Phone, UserRound } from 'lucide-react';

/**
 * Établissements (cantines / sites) — ajouter ou supprimer un site.
 * La validation des repas, les menus et l'historique suivent le site choisi.
 */
const EstablishmentsPage = () => {
  const { user } = useAuth();
  const { establishments, validations, addEstablishment, updateEstablishment, deleteEstablishment } = useResto();
  const me = getRoleDef(user?.role);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [manager, setManager] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const flash = (ok: boolean, text: string) => {
    setMessage({ ok, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      flash(false, 'Nom de l’établissement requis.');
      return;
    }
    addEstablishment({ name: n, address: address.trim() || undefined, manager: manager.trim() || undefined, phone: phone.trim() || undefined });
    setName('');
    setAddress('');
    setManager('');
    setPhone('');
    flash(true, `Établissement « ${n} » ajouté.`);
  };

  const startEdit = (id: string, cur: { name: string; address?: string; manager?: string; phone?: string }) => {
    setEditingId(id);
    setConfirmId(null);
    setName(cur.name);
    setAddress(cur.address ?? '');
    setManager(cur.manager ?? '');
    setPhone(cur.phone ?? '');
  };

  const saveEdit = () => {
    if (!editingId || !name.trim()) {
      flash(false, 'Nom de l’établissement requis.');
      return;
    }
    updateEstablishment(editingId, {
      name: name.trim(),
      address: address.trim() || undefined,
      manager: manager.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setEditingId(null);
    setName('');
    setAddress('');
    setManager('');
    setPhone('');
    flash(true, 'Établissement mis à jour.');
  };

  const askDelete = (id: string) => {
    if (establishments.length <= 1) {
      flash(false, 'Gardez au moins un établissement pour servir les repas.');
      return;
    }
    setConfirmId(id);
    setEditingId(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
          Sites · cantines
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <Building2 className="w-7 h-7 text-green-700" /> Établissements
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Connecté en <strong>{me.title}</strong> — {establishments.length} site{establishments.length > 1 ? 's' : ''} de service.
        </p>
      </div>

      {message && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${message.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Ajouter / modifier */}
      <form onSubmit={editingId ? (e) => { e.preventDefault(); saveEdit(); } : handleAdd} className="bg-white rounded-3xl border-2 border-slate-100 p-5 md:p-6 shadow-sm">
        <p className="font-black text-slate-900 flex items-center gap-2">
          {editingId ? <Pencil className="w-5 h-5 text-green-700" /> : <Plus className="w-5 h-5 text-green-700" />}
          {editingId ? 'Modifier l’établissement' : 'Ajouter un établissement'}
        </p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Nom *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex : ISM Thiès" maxLength={80} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Adresse</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ex : Thiès, Sénégal" maxLength={120} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Caissier</span>
            <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="ex : Awa Diallo" maxLength={80} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Téléphone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="tel" placeholder="77 123 45 67" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600 tabular-nums" />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700">
            {editingId ? 'Enregistrer' : 'Ajouter le site'}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setName(''); setAddress(''); setManager(''); setPhone(''); }} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm inline-flex items-center gap-1">
              <X className="w-4 h-4" /> Annuler
            </button>
          )}
        </div>
      </form>

      {/* Sites */}
      <ul className="grid sm:grid-cols-2 gap-3">
        {establishments.map((e) => {
          const served = validations.filter((v) => v.establishmentId === e.id && v.status === 'accepted').length;
          const isEditing = editingId === e.id;
          const isConfirming = confirmId === e.id;
          return (
            <li key={e.id} className={`bg-white rounded-3xl border-2 p-5 shadow-sm transition-all ${isEditing ? 'border-emerald-500' : 'border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-slate-900 truncate">{e.name}</p>
                  <p className="text-xs text-slate-500">{served} repas servis ici</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-[13px] text-slate-600">
                {e.address && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> <span className="truncate">{e.address}</span></p>}
                {e.manager && <p className="flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> <span className="truncate">{e.manager}</span></p>}
                {e.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> <span className="tabular-nums">{e.phone}</span></p>}
              </div>
              {isConfirming ? (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3">
                  <p className="text-sm font-semibold text-red-800">Supprimer « {e.name} » ?</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => { deleteEstablishment(e.id); setConfirmId(null); flash(true, `« ${e.name} » supprimé.`); }} className="flex-1 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold">
                      Oui, supprimer
                    </button>
                    <button onClick={() => setConfirmId(null)} className="flex-1 px-3 py-2 rounded-xl bg-white border text-xs">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                !isEditing && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => startEdit(e.id, e)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold hover:bg-slate-50">
                      <Pencil className="w-3.5 h-3.5" /> Modifier
                    </button>
                    <button onClick={() => askDelete(e.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Supprimer
                    </button>
                  </div>
                )
              )}
              {isEditing && (
                <p className="mt-3 text-xs font-bold text-emerald-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Modifiez dans le formulaire ci-dessus.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default EstablishmentsPage;
