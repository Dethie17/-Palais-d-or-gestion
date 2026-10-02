import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { getRoleDef } from '@/lib/roleTasks';
import { getClientQrToken } from '@/lib/clientQr';
import { ShieldCheck, Building2, QrCode, Wallet, Baby, Phone, UserRound } from 'lucide-react';

/**
 * Page Utilisateurs — Personnel de service (site) + Direction (toute la plateforme).
 * - Parents & abonnés : fiche parent (nom, téléphone), enfants, QR Codes,
 *   formule active, repas restants et servis
 * - Sites couverts
 */
const UsersPage = () => {
  const { user } = useAuth();
  const { subscriptions, formulas, establishments, validations, myChildren, parentProfiles } = useResto();
  const me = getRoleDef(user?.role);
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  // Abonnés détectés via abonnements (clients réels + démo)
  const clientsSeen = Array.from(new Set(subscriptions.map((s) => s.clientUsername)));
  // Parents : abonnés vus + fiches parents (même sans abonnement encore)
  const parentsSeen = Array.from(new Set([
    ...clientsSeen,
    ...parentProfiles.map((p) => p.parentUsername),
  ])).sort();

  const mealsOf = (username: string) =>
    subscriptions.filter((s) => s.clientUsername === username && s.status === 'active')
      .reduce((sum, s) => sum + s.mealsRemaining, 0);

  const servedOf = (username: string) =>
    validations.filter((v) => v.clientUsername === username && v.status === 'accepted').length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
          Pilotage · Accès & abonnés
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-green-700" /> Utilisateurs & accès
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Connecté en <strong>{me.title}</strong> — {isAdmin ? 'vous voyez toute la plateforme.' : 'vous voyez votre périmètre site.'}
        </p>
      </div>

      {/* Parents & abonnés : fiche parent, enfants, QR Codes */}
      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
        <div className="p-4 flex flex-wrap items-center gap-2">
          <p className="font-black text-slate-800 flex items-center gap-2"><Wallet className="w-5 h-5 text-slate-400" /> Parents & abonnés ({parentsSeen.length})</p>
          <p className="text-xs text-slate-400 ml-auto">Fiche parent · enfants · QR Codes · formule · repas</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
              <tr><th className="text-left p-3">Parent</th><th className="text-left p-3">Enfants</th><th className="text-left p-3">QR Codes</th><th className="text-left p-3">Formule active</th><th className="text-left p-3">Repas rest.</th><th className="text-left p-3">Servis</th></tr>
            </thead>
            <tbody>
              {parentsSeen.map((c) => {
                const prof = parentProfiles.find((p) => p.parentUsername === c);
                const kids = myChildren(c);
                const active = subscriptions.find((s) => s.clientUsername === c && s.status === 'active');
                const formula = formulas.find((f) => f.id === active?.formulaId);
                return (
                  <tr key={c} className="border-t hover:bg-slate-50/60 align-top">
                    <td className="p-3">
                      {prof ? (
                        <>
                          <p className="font-bold capitalize flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5 text-green-600" />{prof.firstName} {prof.lastName}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{prof.phone.replace(/(\d{2})(?=\d)/g, '$1 ')}</p>
                          <p className="text-[11px] text-slate-400 capitalize">compte : {c}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold capitalize">{c}</p>
                          <p className="text-[11px] text-amber-600 font-semibold">Fiche parent à compléter</p>
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      {kids.length === 0 ? (
                        <span className="text-slate-400 text-xs">—</span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            <Baby className="w-3 h-3" /> {kids.length} enfant(s)
                          </span>
                          <ul className="mt-1 space-y-0.5">
                            {kids.map((k) => (
                              <li key={k.id} className="text-xs text-slate-600 capitalize">{k.firstName} {k.lastName} <span className="text-slate-400">· {k.className}</span></li>
                            ))}
                          </ul>
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-700"><QrCode className="w-3 h-3 text-slate-400" />{getClientQrToken(c)}</span>
                        {kids.map((k) => (
                          <span key={k.id} className="font-mono text-[11px] text-slate-500 capitalize">{k.firstName} {k.lastName} : <strong className="text-slate-700">{k.qrToken}</strong></span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-xs">{formula?.name ?? <span className="text-slate-400">sans abonnement actif</span>}</td>
                    <td className="p-3 font-bold text-green-700">{mealsOf(c)}</td>
                    <td className="p-3">{servedOf(c)}</td>
                  </tr>
                );
              })}
              {parentsSeen.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucun parent pour le moment.</td></tr>
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
          <p className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">Gérant de cantine : caisse POS, tableau de bord et historique. Les menus, abonnés et validations sont gérés par le Personnel et la Direction.</p>
        )}
      </div>
    </div>
  );
};

export default UsersPage;
