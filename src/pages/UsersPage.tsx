import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { getRoleDef } from '@/lib/roleTasks';
import { ShieldCheck, Baby, Phone, UserRound, Search, UtensilsCrossed } from 'lucide-react';

/**
 * Utilisateurs — simple et lisible : un parent = une carte
 * (contact, enfants, formule en cours, repas restants et servis).
 */
const UsersPage = () => {
  const { user } = useAuth();
  const { subscriptions, formulas, validations, myChildren, parentProfiles, deleteParent } = useResto();
  const me = getRoleDef(user?.role);
  const [search, setSearch] = useState('');

  // Parents : abonnés vus + fiches parents (même sans abonnement encore)
  const clientsSeen = Array.from(new Set(subscriptions.map((s) => s.clientUsername)));
  const parentsSeen = Array.from(new Set([
    ...clientsSeen,
    ...parentProfiles.map((p) => p.parentUsername),
  ])).sort();

  const q = search.trim().toLowerCase();
  const filtered = q
    ? parentsSeen.filter((c) => {
        const prof = parentProfiles.find((p) => p.parentUsername === c);
        const kids = myChildren(c);
        const hay = [
          c,
          prof ? `${prof.firstName} ${prof.lastName} ${prof.phone}` : '',
          ...kids.map((k) => `${k.firstName} ${k.lastName} ${k.className}`),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      })
    : parentsSeen;

  const mealsOf = (username: string) =>
    subscriptions.filter((s) => s.clientUsername === username && s.status === 'active')
      .reduce((sum, s) => sum + s.mealsRemaining, 0);

  const servedOf = (username: string) =>
    validations.filter((v) => v.clientUsername === username && v.status === 'accepted').length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
          Comptes · {parentsSeen.length} parent{parentsSeen.length > 1 ? 's' : ''}
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-green-700" /> Utilisateurs
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Connecté en <strong>{me.title}</strong> — parents, enfants et formules en cours.
        </p>
      </div>

      <div className="relative">
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

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 bg-white rounded-2xl border border-dashed px-4 py-10 text-center">
          {parentsSeen.length === 0 ? 'Aucun parent pour le moment.' : 'Aucun résultat pour cette recherche.'}
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {filtered.map((c) => {
            const prof = parentProfiles.find((p) => p.parentUsername === c);
            const kids = myChildren(c);
            const active = subscriptions.find((s) => s.clientUsername === c && s.status === 'active');
            const formula = formulas.find((f) => f.id === active?.formulaId);
            return (
              <li key={c} className="bg-white rounded-3xl border-2 border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black flex-shrink-0">
                    {(prof?.firstName?.charAt(0) ?? c.charAt(0)).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900 capitalize truncate flex items-center gap-1.5">
                      <UserRound className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      {prof ? `${prof.firstName} ${prof.lastName}` : c}
                    </p>
                    {prof && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 tabular-nums">
                        <Phone className="w-3 h-3" />{prof.phone.replace(/(\d{2})(?=\d)/g, '$1 ')}
                      </p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {active ? `${mealsOf(c)} repas` : 'Sans abo'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {kids.length === 0 ? (
                    <span className="text-xs text-slate-400">Aucun enfant inscrit</span>
                  ) : (
                    kids.map((k) => (
                      <span key={k.id} className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-50 border border-green-100 text-green-800 capitalize">
                        <Baby className="w-3 h-3" /> {k.firstName} {k.lastName} · {k.className}
                      </span>
                    ))
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-dashed border-slate-200 flex items-center gap-2 text-[13px]">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  {formula ? (
                    <span className="text-slate-600 truncate">{formula.name} · <strong className="text-slate-800">{servedOf(c)} servis</strong></span>
                  ) : (
                    <span className="text-slate-400">Sans abonnement actif</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default UsersPage;
