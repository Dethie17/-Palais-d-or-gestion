import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { getRoleDef } from '@/lib/roleTasks';
import {
  ShieldCheck, Baby, Search, Trash2, ShieldAlert,
  AlertTriangle, UserRound,
} from 'lucide-react';

const LOW_MEALS = 3;

/** 771234567 → « 77 123 45 67 » (affichage seulement). */
function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : value;
}

/**
 * Liste des parents — registre professionnel, en tableau.
 *
 * La création de compte parent se fait désormais dans Import → Import Parent
 * (numéro de téléphone seul, sans mot de passe). Cette page se concentre sur
 * le suivi : enfants, abonnement, repas restants, dernière validation.
 */
const UsersPage = () => {
  const { user } = useAuth();
  const { subscriptions, formulas, validations, myChildren, parentProfiles, deleteParent, inactiveParents, isParentInactive, setParentActive } = useResto();
  const me = getRoleDef(user?.role);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'none' | 'low'>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const clientsSeen = Array.from(new Set(subscriptions.map((s) => s.clientUsername)));
  const parentsSeen = Array.from(new Set([
    ...clientsSeen,
    ...parentProfiles.map((p) => p.parentUsername),
  ])).sort();

  const mealsOf = (username: string) =>
    subscriptions.filter((s) => s.clientUsername === username && s.status === 'active')
      .reduce((sum, s) => sum + s.mealsRemaining, 0);

  const servedOf = (username: string) =>
    validations.filter((v) => v.clientUsername === username && v.status === 'accepted').length;


  const today = new Date();
  const servedToday = validations.filter((v) => {
    if (v.status !== 'accepted') return false;
    const d = new Date(v.validatedAt);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  }).length;

  const totalKids = Array.from(new Set(parentsSeen)).reduce((n, c) => n + myChildren(c).length, 0);
  const activeSubs = new Set(subscriptions.filter((s) => s.status === 'active').map((s) => s.clientUsername)).size;

  const q = search.trim().toLowerCase();
  const filtered = parentsSeen.filter((c) => {
    const prof = parentProfiles.find((p) => p.parentUsername === c);
    const kids = myChildren(c);
    if (q) {
      const hay = [c, prof ? `${prof.firstName} ${prof.lastName} ${prof.phone}` : '', ...kids.map((k) => `${k.firstName} ${k.lastName} ${k.className}`)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const active = subscriptions.some((s) => s.clientUsername === c && s.status === 'active');
    if (filter === 'active') return active;
    if (filter === 'none') return !active;
    if (filter === 'low') return active && mealsOf(c) <= LOW_MEALS;
    return true;
  });

  const chips: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'Tous' },
    { id: 'active', label: 'Abonnés actifs' },
    { id: 'none', label: 'Sans abonnement' },
    { id: 'low', label: `Repas faibles (≤ ${LOW_MEALS})` },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {deleteError && (
        <div className="flex items-start gap-2 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{deleteError}</p>
          <button onClick={() => setDeleteError(null)} className="font-bold underline-offset-2 hover:underline">Fermer</button>
        </div>
      )}
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
          Comptes · {parentsSeen.length} parent{parentsSeen.length > 1 ? 's' : ''}
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-green-700" /> Utilisateurs
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Connecté en <strong>{me.title}</strong> — suivi des parents, enfants et formules. La suppression d&apos;un parent est définitive et tient compte de la comptabilité.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Parents suivis', value: parentsSeen.length },
          { label: 'Enfants suivis', value: totalKids },
          { label: 'Abonnements actifs', value: activeSubs },
          { label: 'Repas servis aujourd\u2019hui', value: servedToday },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border-2 border-slate-100 p-4">
            <p className="text-2xl font-black text-slate-900 tabular-nums">{s.value}</p>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search aria-hidden className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <label htmlFor="search-users" className="sr-only">Rechercher un parent ou un enfant</label>
          <input
            id="search-users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un parent, un enfant, une classe…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-slate-200 bg-white text-sm outline-none focus:border-green-700 shadow-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                filter === c.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-10 text-center">
            {parentsSeen.length === 0 ? 'Aucun parent pour le moment.' : 'Aucun résultat pour cette recherche.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]" data-testid="users-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-black">Parent</th>
                  <th className="px-4 py-3 text-left font-black">Identifiant</th>
                  <th className="px-4 py-3 text-left font-black">Enfants</th>
                  <th className="px-4 py-3 text-left font-black">Abonnement</th>
                  <th className="px-4 py-3 text-right font-black">Repas</th>
                  <th className="px-4 py-3 text-left font-black">État</th>
                  <th className="px-4 py-3 text-right font-black">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const prof = parentProfiles.find((p) => p.parentUsername === c);
                  const kids = myChildren(c);
                  const active = subscriptions.find((s) => s.clientUsername === c && s.status === 'active');
                  const formula = formulas.find((f) => f.id === active?.formulaId);
                  const meals = mealsOf(c);
                  const low = Boolean(active) && meals <= LOW_MEALS;
                  const isInactive = isParentInactive(c);
                  const phoneUsername = /^[67]\d{8}$/.test(c.replace(/\D/g, '')) && c.replace(/\D/g, '').length === 9;
                  return (
                    <tr key={c} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black flex-shrink-0">
                            {(prof?.firstName?.charAt(0) ?? c.charAt(0)).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-bold text-slate-900 truncate max-w-[180px]">
                              {prof ? `${prof.lastName} ${prof.firstName}`.trim() : c}
                            </span>
                            {prof && <span className="block text-[11px] text-slate-400 truncate max-w-[180px]">{prof.parentUsername}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {phoneUsername ? (
                          <span className="tabular-nums font-semibold text-slate-700">{formatPhone(c)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            {c} · historique
                          </span>
                        )}
                        {prof?.phone && phoneUsername && (
                          <span className="block text-[11px] text-slate-400 tabular-nums">fiche : {formatPhone(prof.phone)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {kids.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {kids.slice(0, 2).map((k) => (
                              <span key={k.id} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 border border-green-100 text-green-800">
                                <Baby className="w-3 h-3" /> {k.firstName} {k.lastName} · {k.className}
                              </span>
                            ))}
                            {kids.length > 2 && (
                              <span className="text-[11px] font-bold text-slate-400 self-center">+{kids.length - 2}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {active ? (
                          <span className="inline-flex flex-col">
                            <span className="font-semibold text-slate-800">{formula?.name ?? 'Formule'}</span>
                            <span className="text-[11px] text-slate-400">{servedOf(c)} repas servis</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">Aucun</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {active ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-black tabular-nums px-2 py-0.5 rounded-full ${low ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {low && <AlertTriangle className="w-3 h-3" />}
                            {meals}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setParentActive(c, !isInactive)}
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${isInactive ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                        >
                          {isInactive ? 'Activer' : 'Inactiver'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setConfirmDelete(c)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                          title="Supprimer ce parent"
                        >
                          <Trash2 className="w-4 h-4" /> Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button aria-label="Fermer" onClick={() => setConfirmDelete(null)} className="absolute inset-0 bg-slate-900/50" />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              <p className="font-black">Supprimer ce parent ?</p>
            </div>
             <p className="mt-2 text-sm text-slate-600">
              Le compte <strong>{formatPhone(confirmDelete)}</strong>, ses enfants, ses réclamations et ses cartes seront retirés définitivement. Les règlements réglés restent dans la comptabilité.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={async () => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  const result = await deleteParent(target);
                  if (!result.ok) setDeleteError(result.error ?? 'Suppression impossible.');
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700"
              >
                Supprimer définitivement
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdminHint(user?.role)}
    </div>
  );
};

/**
 * Petit rappel de l'unique porte de création : la DAF passe par Import Parent.
 * (Composant local pour garder le rendu ci-dessus lisible.)
 */
function isAdminHint(role: string | undefined) {
  if (role !== 'admin') return null;
  return (
    <p className="text-xs text-slate-400 flex items-center gap-1.5">
      <UserRound className="w-3.5 h-3.5" />
      Création et activation des accès parent : Import → Import Parent (numéro de téléphone, sans mot de passe).
    </p>
  );
}

export default UsersPage;
