import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { getRoleDef } from '@/lib/roleTasks';
import { peutSupprimerParent } from '@/lib/permissions';
import { isHebdoFormula } from '@/lib/formulas';
import type { Subscription, SubscriptionStatus } from '@/types/menu';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShieldCheck, Baby, Search, Trash2, ShieldAlert, UserRound,
  Eye, X, QrCode, AlertTriangle,
} from 'lucide-react';

const LOW_MEALS = 3;

/** 771234567 → « 77 123 45 67 » (affichage seulement). */
function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : value;
}

const SUB_STATUS_LABEL: Record<SubscriptionStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'En attente de paiement', cls: 'bg-amber-100 text-amber-700' },
  expired: { label: 'Expirée', cls: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Annulée', cls: 'bg-red-100 text-red-600' },
};

/**
 * Liste des parents — registre professionnel, en tableau.
 *
 * Un clic sur un parent (ou « Fiche ») ouvre sa fiche complète : profil,
 * enfants avec leurs QR codes et tous ses abonnements avec état + action.
 * L'abonnement hebdomadaire a été retiré : F1 ne s'affiche plus nulle part.
 * La création de compte parent se fait dans Import → Import Parent.
 */
const UsersPage = () => {
  const { user } = useAuth();
  const {
    subscriptions, formulas, validations, myChildren, parentProfiles,
    deleteParent, inactiveParents, isParentInactive, setParentActive, cancelSubscription, deactivateSubscription, reactivateSubscription,
  } = useResto();
  const me = getRoleDef(user?.role);
  /** Suppression définitive d'un parent : Superviseur et DG seulement. */
  const peutSupprimer = peutSupprimerParent(user?.role);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'none' | 'low'>('all');
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** Fiche détaillée d'un parent : identifiant (username) courant. */
  const [detailParent, setDetailParent] = useState<string | null>(null);

  const clientsSeen = Array.from(new Set(subscriptions.map((s) => s.clientUsername)));
  const parentsSeen = Array.from(new Set([
    ...clientsSeen,
    ...parentProfiles.map((p) => p.parentUsername),
  ])).sort();

  /** Abonnement hebdomadaire retiré du catalogue (F1 et équivalents courts). */
  const isHebdoSub = (s: Subscription) => {
    if (s.formulaId === 'F1') return true;
    return isHebdoFormula(formulas.find((f) => f.id === s.formulaId));
  };
  /** Abonnements visibles de ce parent : hors hebdomadaire, actifs d'abord. */
  const visiblesOf = (username: string): Subscription[] =>
    subscriptions
      .filter((s) => s.clientUsername === username && !isHebdoSub(s))
      .sort((a, b) => {
        const rank = (st: SubscriptionStatus) => (st === 'active' ? 0 : st === 'pending' ? 1 : st === 'expired' ? 2 : 3);
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime() || rank(a.status) - rank(b.status);
      });

  const activeSubOf = (username: string) =>
    visiblesOf(username).find((s) => s.status === 'active');

  const mealsOf = (username: string) =>
    visiblesOf(username).filter((s) => s.status === 'active')
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
  const activeSubs = new Set(
    subscriptions.filter((s) => s.status === 'active' && !isHebdoSub(s)).map((s) => s.clientUsername),
  ).size;

  const q = search.trim().toLowerCase();
  const filtered = parentsSeen.filter((c) => {
    const prof = parentProfiles.find((p) => p.parentUsername === c);
    const kids = myChildren(c);
    if (q) {
      const hay = [c, prof ? `${prof.firstName} ${prof.lastName} ${prof.phone}` : '', ...kids.map((k) => `${k.firstName} ${k.lastName} ${k.className}`)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const active = Boolean(activeSubOf(c));
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
          Connecté en <strong>{me.title}</strong> — cliquez sur un parent pour ouvrir sa fiche : profil, enfants et abonnements. La suppression d&apos;un parent est définitive, réservée au Superviseur et au DG, et tient compte de la comptabilité.
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
                  const active = activeSubOf(c);
                  const formula = formulas.find((f) => f.id === active?.formulaId);
                  const meals = mealsOf(c);
                  const low = Boolean(active) && meals <= LOW_MEALS;
                  const isInactive = isParentInactive(c);
                  const phoneUsername = /^[67]\d{8}$/.test(c.replace(/\D/g, '')) && c.replace(/\D/g, '').length === 9;
                  return (
                    <tr
                      key={c}
                      data-testid="users-row"
                      title="Ouvrir la fiche du parent"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        setDetailParent(c);
                      }}
                      className="border-t border-slate-100 align-top hover:bg-slate-50/60 cursor-pointer"
                    >
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
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setDetailParent(c)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-green-700 transition-colors px-2 py-1 rounded-lg hover:bg-green-50"
                            title="Voir la fiche du parent"
                          >
                            <Eye className="w-4 h-4" /> Fiche
                          </button>
                          {peutSupprimer && (
                            <button
                              onClick={() => setDeleteTargets([c])}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                              title="Supprimer ce parent (Superviseur / DG)"
                            >
                              <Trash2 className="w-4 h-4" /> Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTargets && deleteTargets.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button aria-label="Fermer" onClick={() => setDeleteTargets(null)} className="absolute inset-0 bg-slate-900/50" />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              <p className="font-black">Supprimer ce parent ?</p>
            </div>
             <p className="mt-2 text-sm text-slate-600">
              Le compte <strong>{formatPhone(deleteTargets[0])}</strong>, ses enfants, ses réclamations et ses cartes seront retirés définitivement. Les règlements réglés restent dans la comptabilité.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={async () => {
                  const target = deleteTargets[0];
                  setDeleteTargets(null);
                  const result = await deleteParent(target);
                  if (!result.ok) setDeleteError(result.error ?? 'Suppression impossible.');
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700"
              >
                Supprimer définitivement
              </button>
              <button
                onClick={() => setDeleteTargets(null)}
                className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {detailParent && (
        <ParentFicheDialog
          username={detailParent}
          onClose={() => setDetailParent(null)}
          isHebdoSub={isHebdoSub}
        />
      )}

      {isAdminHint(user?.role)}
    </div>
  );
};

/**
 * Fiche détaillée d'un parent : profil, état du compte, enfants
 * avec leurs QR de cantine, abonnements (état + action) — le registre
 * et les repas servis récapitulent ce que le personnel a encaissé.
 */
function ParentFicheDialog({
  username, onClose, isHebdoSub,
}: {
  username: string;
  onClose: () => void;
  isHebdoSub: (s: Subscription) => boolean;
}) {
  const { parentProfiles, myChildren, subscriptions, formulas, isParentInactive, setParentActive, cancelSubscription } = useResto();
  const prof = parentProfiles.find((p) => p.parentUsername === username);
  const kids = myChildren(username);
  const subs = subscriptions
    .filter((s) => s.clientUsername === username && !isHebdoSub(s))
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const isInactive = isParentInactive(username);
  const phoneUsername = /^[67]\d{8}$/.test(username.replace(/\D/g, '')) && username.replace(/\D/g, '').length === 9;
  const abonnesCount = subs.filter((s) => s.status === 'active').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="parent-fiche">
      <button aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-slate-900/60" />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-6">
        {/* En-tête : profil + état du compte */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-base font-black flex-shrink-0">
              {(prof?.firstName?.charAt(0) ?? username.charAt(0)).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-black tracking-tight text-slate-900 truncate">
                {prof ? `${prof.lastName} ${prof.firstName}`.trim() : username}
              </h2>
              <p className="text-xs text-slate-500 tabular-nums">
                Identifiant : {phoneUsername ? formatPhone(username) : username}
                {prof?.phone && phoneUsername && prof.phone !== username ? ` · fiche : ${formatPhone(prof.phone)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setParentActive(username, !isInactive)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full ${isInactive ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
            >
              {isInactive ? 'Réactiver le compte' : 'Inactiver le compte'}
            </button>
            <button
              onClick={onClose}
              aria-label="Fermer la fiche"
              data-testid="parent-fiche-close"
              className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${isInactive ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            {isInactive ? 'Compte inactif' : 'Compte actif'}
          </span>
          <span className="text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
            {kids.length} enfant{kids.length > 1 ? 's' : ''}
          </span>
          <span className="text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
            {abonnesCount} abonnement{abonnesCount > 1 ? 's' : ''} actif{abonnesCount > 1 ? 's' : ''}
          </span>
        </div>

        {/* Enfants : identité + QR de cantine */}
        <section className="mt-6" data-testid="fiche-enfants">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <QrCode className="w-4 h-4" /> Enfants & QR cantine
          </h3>
          {kids.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center border-2 border-dashed border-slate-100 rounded-2xl mt-2">
              Aucun enfant enregistré pour ce parent.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              {kids.map((k) => {
                /** Abonnement de CET enfant : actif, sinon en attente, sinon expiré. */
                const kidSubs = subscriptions.filter((s) => s.childId === k.id && !isHebdoSub(s));
                const kidSub =
                  kidSubs.find((s) => s.status === 'active') ??
                  kidSubs.find((s) => s.status === 'pending') ??
                  kidSubs.find((s) => s.status === 'expired');
                const kidFormula = kidSub ? formulas.find((f) => f.id === kidSub.formulaId) : undefined;
                const kidBadge = kidSub ? (SUB_STATUS_LABEL[kidSub.status] ?? SUB_STATUS_LABEL.expired) : null;
                return (
                  <div key={k.id} className="border-2 border-slate-100 rounded-2xl p-3 flex items-center gap-3 bg-slate-50/50">
                    {k.qrToken ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-1.5 flex-shrink-0">
                        <QRCodeSVG value={k.qrToken} size={84} />
                      </div>
                    ) : (
                      <span className="w-[96px] h-[96px] rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0">
                        <Baby className="w-6 h-6" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{k.firstName} {k.lastName}</p>
                      <p className="text-xs text-slate-500">{k.className}</p>
                      {kidSub && kidBadge ? (
                        <>
                          <p className="mt-1 text-xs font-bold text-slate-700 truncate">{kidFormula?.name ?? 'Formule'}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${kidBadge.cls}`}>
                              {kidBadge.label}
                              {kidSub.status === 'active' ? ` · ${kidSub.mealsRemaining} repas` : ''}
                            </span>
                            {kidSub.status === 'pending' && (
                              <button
                                onClick={() => cancelSubscription(kidSub.id)}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                                title="Annuler cette demande de paiement"
                              >
                                Annuler la demande
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="mt-1.5 inline-flex text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full">
                          <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Sans abonnement</span>
                        </p>
                      )}
                      {k.qrToken && (
                        <p className="mt-1 text-[10px] font-mono text-slate-400 truncate max-w-[150px]">{k.qrToken}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Abonnements : type, état, action */}
        <section className="mt-6" data-testid="fiche-abonnements">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Abonnements
          </h3>
          {subs.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center border-2 border-dashed border-slate-100 rounded-2xl mt-2">
              Aucun abonnement (l&apos;hebdomadaire a été retiré du catalogue).
            </p>
          ) : (
            <div className="mt-2 divide-y divide-slate-100 border-2 border-slate-100 rounded-2xl overflow-hidden">
              {subs.map((s) => {
                const formula = formulas.find((f) => f.id === s.formulaId);
                const badge = SUB_STATUS_LABEL[s.status] ?? SUB_STATUS_LABEL.expired;
                return (
                  <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-3 bg-white">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm">{formula?.name ?? 'Formule'}</p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {new Date(s.startDate).toLocaleDateString('fr-FR')} → {new Date(s.endDate).toLocaleDateString('fr-FR')}
                        {s.status === 'active' ? ` · ${s.mealsRemaining} repas restants` : ''}
                      </p>
                      <span className={`mt-1 inline-block text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {s.status === 'pending' && (
                      <button
                        onClick={() => cancelSubscription(s.id)}
                        className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 flex-shrink-0"
                        title="Annuler cette demande de paiement"
                      >
                        Annuler la demande
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

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
