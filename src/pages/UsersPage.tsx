import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { ROLE_DEFINITIONS, getRoleDef } from '@/lib/roleTasks';
import { ROLE_PAGES, PAGE_LABEL } from '@/lib/permissions';
import { ShieldCheck, Building2, QrCode, Wallet, Check } from 'lucide-react';

/**
 * Page Utilisateurs — Admin (tout) + Gestionnaire (son site).
 * Tâche DISTINCTIVE du pilotage : ni le client ni le personnel n'y ont accès.
 * - Liste les comptes démo + abonnés détectés (issus des abonnements)
 * - Affiche rôle, mission, site, solde repas, statut
 * - Rappelle la matrice des accès pour éviter les confusions
 */
const UsersPage = () => {
  const { user } = useAuth();
  const { subscriptions, formulas, establishments, validations } = useResto();
  const me = getRoleDef(user?.role);
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const demoAccounts = [
    { username: 'client', role: 'client' as const, pass: 'client123' },
    { username: 'personnel', role: 'personnel' as const, pass: 'personnel123' },
    { username: 'gestionnaire', role: 'gestionnaire' as const, pass: 'gestionnaire123' },
    { username: 'admin', role: 'admin' as const, pass: 'admin123' },
  ];

  // Abonnés détectés via abonnements (clients réels + démo)
  const clientsSeen = Array.from(new Set(subscriptions.map((s) => s.clientUsername)));

  const mealsOf = (username: string) =>
    subscriptions.filter((s) => s.clientUsername === username && s.status === 'active')
      .reduce((sum, s) => sum + s.mealsRemaining, 0);

  const servedOf = (username: string) =>
    validations.filter((v) => v.clientUsername === username && v.status === 'accepted').length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-green-700" /> Utilisateurs & accès
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Connecté en <strong>{me.title}</strong> — {isAdmin ? 'vous voyez toute la plateforme.' : 'vous voyez votre périmètre site.'}
        </p>
      </div>

      {/* Les 4 profils */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        {(['client', 'personnel', 'gestionnaire', 'admin'] as const).map((r) => {
          const d = ROLE_DEFINITIONS[r];
          const RoleIcon = d.icon;
          const modules = ROLE_PAGES[r] ?? [];
          return (
            <div key={r} className="bg-white rounded-2xl border p-4">
              <p className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r ${d.color} text-white`}>
                <RoleIcon className="w-3.5 h-3.5" /> {d.title}
              </p>
              <p className="text-xs text-slate-500 mt-2">{d.mission}</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {modules.slice(0, 4).map((m) => (
                  <li key={m} className="flex items-center gap-1"><Check className="w-3 h-3 text-green-600" /> {PAGE_LABEL[m] ?? m}</li>
                ))}
              </ul>
              {modules.length > 4 && <p className="text-[11px] text-slate-400 mt-1">+ {modules.length - 4} autres modules</p>}
            </div>
          );
        })}
      </div>

      {/* Comptes d'accès */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <p className="p-4 font-bold text-slate-800">Comptes d’accès ({demoAccounts.length}) — mot de passe = nom + 123</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left p-3">Compte</th><th className="text-left p-3">Rôle & mission</th><th className="text-left p-3">Login démo</th><th className="text-left p-3">Périmètre</th></tr>
            </thead>
            <tbody>
              {demoAccounts.map((a) => {
                const d = ROLE_DEFINITIONS[a.role];
                const RoleIcon = d.icon;
                const modules = ROLE_PAGES[a.role] ?? [];
                return (
                  <tr key={a.username} className="border-t">
                    <td className="p-3 font-bold capitalize">{a.username}</td>
                    <td className="p-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${d.color} text-white`}><RoleIcon className="w-3 h-3" /> {d.title}</span><span className="block text-xs text-slate-500 mt-1">{d.mission}</span></td>
                    <td className="p-3 font-mono text-xs">{a.username} / {a.pass}</td>
                    <td className="p-3 text-xs text-slate-600">{modules.length} modules • {d.forbidden.length > 0 ? d.forbidden.slice(0, 2).join(', ') : 'accès complet'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Abonnés détectés */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <p className="p-4 font-bold text-slate-800 flex items-center gap-2"><Wallet className="w-5 h-5 text-slate-400" /> Abonnés détectés ({clientsSeen.length})</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left p-3">Client</th><th className="text-left p-3">Formule active</th><th className="text-left p-3">Repas rest.</th><th className="text-left p-3">Repas servis</th><th className="text-left p-3">QR</th></tr>
            </thead>
            <tbody>
              {clientsSeen.map((c) => {
                const active = subscriptions.find((s) => s.clientUsername === c && s.status === 'active');
                const formula = formulas.find((f) => f.id === active?.formulaId);
                return (
                  <tr key={c} className="border-t">
                    <td className="p-3 font-semibold capitalize">{c}</td>
                    <td className="p-3">{formula?.name ?? <span className="text-slate-400">sans abonnement actif</span>}</td>
                    <td className="p-3 font-bold text-green-700">{mealsOf(c)}</td>
                    <td className="p-3">{servedOf(c)}</td>
                    <td className="p-3 font-mono text-xs flex items-center gap-1"><QrCode className="w-3 h-3 text-slate-400" />{active?.qrToken ?? '—'}</td>
                  </tr>
                );
              })}
              {clientsSeen.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400">Aucun abonné pour le moment.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sites */}
      <div className="bg-white rounded-2xl border p-5">
        <p className="font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-5 h-5 text-orange-500" /> Sites couverts ({establishments.length})</p>
        <div className="mt-2 grid md:grid-cols-2 gap-2">
          {establishments.map((e) => (
            <div key={e.id} className="p-3 rounded-xl bg-slate-50 border text-sm">
              <p className="font-semibold">{e.name}</p>
              <p className="text-slate-500 text-xs">{e.address} {e.manager ? `• Resp. ${e.manager}` : ''}</p>
            </div>
          ))}
        </div>
        {!isAdmin && (
          <p className="mt-3 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-xl p-3">Gérant de cantine : vous administrez votre cantine (menus, abonnés, validations, caisse POS). La gestion des gérants et les rapports globaux restent réservés au Directeur Général.</p>
        )}
      </div>
    </div>
  );
};

export default UsersPage;
