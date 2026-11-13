import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/context/AuthContext';
import {
  employeeInitials,
  employeeName,
  fetchDangoteEmployeePortal,
  formatDateFr,
  formatMoney,
  formatTimeFr,
  monthStartIso,
  num,
  statutRepasLabel,
  todayIso,
} from '@/lib/dangote';
import type { DangoteMenu } from '@/types/dangote';
import type { DangoteEmployeePortal } from '@/lib/dangote';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DangotePageHeader,
  EmptyState,
  LoadingState,
  Panel,
  primaryButtonClass,
  ProgressBar,
  SchemaBanner,
  secondaryButtonClass,
  StatCard,
  StatusBadge,
} from '@/components/dangote/DangoteUI';

const DangoteEmployePage = () => {
  const { user } = useAuth();
  const entiteId = user?.entiteId ?? '';
  const allowed = user?.role === 'employe-dangote';

  const [portal, setPortal] = useState<DangoteEmployeePortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('qr');

  const load = useCallback(async (silent = false) => {
    if (!entiteId) {
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchDangoteEmployeePortal(entiteId, user?.username);
      setPortal(data);
      if (!data.schemaReady) setError(data.error);
      else if (!data.employe) setError(data.error ?? 'Aucune fiche employé liée à ce compte.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entiteId, user?.username]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const employe = portal?.employe ?? null;
  const parametres = portal?.parametres ?? null;
  const devise = parametres?.devise ?? 'FCFA';
  const repas = portal?.repas ?? [];
  const today = todayIso();
  const monthStart = monthStartIso();

  const todayRepas = useMemo(
    () => repas.filter((row) => row.date_jour === today && row.statut === 'valide'),
    [repas, today],
  );
  const monthRepas = useMemo(
    () => repas.filter((row) => row.date_jour >= monthStart && row.statut === 'valide'),
    [repas, monthStart],
  );
  const todaySubvention = todayRepas.reduce((sum, row) => sum + num(row.subvention_appliquee), 0);
  const monthRetenue = monthRepas.reduce((sum, row) => sum + num(row.retenue_salaire), 0);
  const todayMenus = useMemo(
    () => (portal?.menus ?? []).filter((menu) => menu.date_jour === today && menu.actif),
    [portal?.menus, today],
  );

  const quotaJour = num(parametres?.quota_repas_jour ?? 1);
  const quotaMois = num(parametres?.quota_repas_mois ?? 22);
  const todaySubventionRepas = todayRepas.filter((row) => num(row.subvention_appliquee) > 0).length;
  const monthSubventionRepas = monthRepas.filter((row) => num(row.subvention_appliquee) > 0).length;
  const autoSubvention = parametres?.auto_subvention !== false;
  const subventionDisponible = (autoSubvention
    && todaySubventionRepas < quotaJour
    && monthSubventionRepas < quotaMois);

  const platsForMenu = (menu: DangoteMenu) => {
    const ids = new Set(
      (portal?.menuPlats ?? []).filter((row) => row.menu_id === menu.id).map((row) => row.plat_id),
    );
    return (portal?.plats ?? []).filter((plat) => ids.has(plat.id));
  };

  const downloadQr = () => {
    const svg = document.querySelector('#employee-qr svg');
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qr-${employe?.matricule ?? 'employe'}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!allowed) {
    return <div className="p-8 font-bold text-red-600">Accès réservé à l’Employé Dangote.</div>;
  }

  if (loading && !portal) {
    return <div className="p-4 lg:p-8"><LoadingState label="Chargement de votre espace…" /></div>;
  }

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <DangotePageHeader
        eyebrow="Espace Employé"
        title={employe ? employeeName(employe) : 'Mon espace Dangote'}
        description={employe ? `${employe.matricule} · ${employe.service ?? 'Sans service'} · ${employe.poste ?? 'Employé'}` : 'Votre QR, vos repas et les menus du jour.'}
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <button className={secondaryButtonClass} onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualiser
          </button>
        }
      />

      <SchemaBanner message={error} />

      {!employe ? (
        <EmptyState
          title="Aucune fiche employé liée"
          description="Demandez à la Direction du Capital Humain de rattacher votre compte à votre fiche employé."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Quota du jour"
              value={`${todaySubventionRepas} / ${quotaJour}`}
              hint={todaySubventionRepas >= quotaJour ? 'Quota journalier atteint' : 'Repas subventionnés'}
              tone={todaySubventionRepas >= quotaJour ? 'amber' : 'green'}
              icon={<UtensilsCrossed className="h-5 w-5" />}
            />
            <StatCard
              label="Quota du mois"
              value={`${monthSubventionRepas} / ${quotaMois}`}
              hint="Repas subventionnés"
              tone="blue"
              icon={<CalendarDays className="h-5 w-5" />}
            />
            <StatCard
              label="Subvention aujourd’hui"
              value={formatMoney(todaySubvention, devise)}
              hint={!autoSubvention ? 'Subvention désactivée' : subventionDisponible ? 'Disponible au prochain repas' : 'Subvention déjà utilisée'}
              tone={subventionDisponible ? 'green' : 'amber'}
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <StatCard
              label="Retenues du mois"
              value={formatMoney(monthRetenue, devise)}
              hint="Montant qui sera retenu sur le salaire"
              icon={<Wallet className="h-5 w-5" />}
            />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
              <TabsTrigger value="qr" className="gap-1.5"><QrCode className="h-4 w-4" /> Mon QR</TabsTrigger>
              <TabsTrigger value="repas" className="gap-1.5"><History className="h-4 w-4" /> Mes repas</TabsTrigger>
              <TabsTrigger value="menus" className="gap-1.5"><UtensilsCrossed className="h-4 w-4" /> Menus du jour</TabsTrigger>
            </TabsList>

            <TabsContent value="qr" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
                <Panel title="Mon QR employé" description="Présentez ce code au comptoir MIAM’S.">
                  <div className="flex flex-col items-center gap-3">
                    <div id="employee-qr" className="rounded-2xl border border-slate-200 bg-white p-4">
                      <QRCodeSVG value={employe.qr_token} size={240} />
                    </div>
                    <p className="break-all text-center font-mono text-xs text-slate-500">{employe.qr_token}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button className={primaryButtonClass} onClick={downloadQr}>
                        <Download className="h-4 w-4" /> Télécharger
                      </button>
                      <button className={secondaryButtonClass} onClick={() => window.print()}>
                        Imprimer
                      </button>
                    </div>
                  </div>
                </Panel>

                <div className="space-y-4">
                  <Panel title="Ma situation" description="Ce que le comptoir voit au moment du scan.">
                    <div className="space-y-4">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-bold text-slate-700">Quota journalier</span>
                          <span className="text-slate-500">{todaySubventionRepas} / {quotaJour} repas</span>
                        </div>
                        <ProgressBar value={quotaJour > 0 ? (todaySubventionRepas / quotaJour) * 100 : 0} tone={todaySubventionRepas >= quotaJour ? 'amber' : 'green'} />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-bold text-slate-700">Quota mensuel</span>
                          <span className="text-slate-500">{monthSubventionRepas} / {quotaMois} repas</span>
                        </div>
                        <ProgressBar value={quotaMois > 0 ? (monthSubventionRepas / quotaMois) * 100 : 0} tone={monthSubventionRepas >= quotaMois ? 'red' : 'green'} />
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                        <p className="font-bold text-slate-800">
                          {!autoSubvention ? 'Subvention désactivée' : subventionDisponible ? 'Subvention disponible' : 'Subvention épuisée pour le moment'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {!autoSubvention
                            ? 'La subvention est désactivée pour le moment.'
                            : subventionDisponible
                              ? `La subvention de ${formatMoney(parametres?.subvention_jour, devise)} s’appliquera à votre prochain repas du jour.`
                              : 'Votre repas sera facturé au prix du menu, sans subvention.'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 p-3 text-sm">
                        <p className="font-bold text-slate-800">Plafonds</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Jour : {employe.plafond_journalier != null ? formatMoney(employe.plafond_journalier, devise) : 'aucun'} ·
                          Mois : {employe.plafond_mensuel != null ? formatMoney(employe.plafond_mensuel, devise) : 'aucun'}
                        </p>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Horaires du restaurant">
                    <p className="text-sm text-slate-700">
                      {parametres?.nom_restaurant ?? "MIAM'S Dangote"} · {parametres?.heure_ouverture ?? '07:00'} – {parametres?.heure_fermeture ?? '17:00'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Prix standard : {formatMoney(parametres?.prix_standard, devise)} · Prix premium : {formatMoney(parametres?.prix_premium, devise)}</p>
                  </Panel>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="repas" className="space-y-4">
              <Panel title={`Mes repas (${repas.length})`} description="Historique des 90 derniers jours.">
                {repas.length === 0 ? (
                  <EmptyState title="Aucun repas enregistré" description="Vos repas validés au comptoir apparaîtront ici." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Heure</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Prix</th>
                          <th className="px-3 py-2">Subvention</th>
                          <th className="px-3 py-2">Retenue</th>
                          <th className="px-3 py-2">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repas.map((row) => (
                          <tr key={row.id} className={`border-t border-slate-100 ${row.statut === 'annule' ? 'opacity-60' : ''}`}>
                            <td className="px-3 py-2 text-slate-700">{formatDateFr(row.date_jour)}</td>
                            <td className="px-3 py-2 text-slate-500">{formatTimeFr(row.created_at)}</td>
                            <td className="px-3 py-2"><StatusBadge tone={row.type_repas === 'premium' ? 'amber' : 'green'}>{row.type_repas}</StatusBadge></td>
                            <td className="px-3 py-2 font-bold">{formatMoney(row.prix, devise)}</td>
                            <td className="px-3 py-2 text-emerald-700">{formatMoney(row.subvention_appliquee, devise)}</td>
                            <td className="px-3 py-2 text-amber-700">{formatMoney(row.retenue_salaire, devise)}</td>
                            <td className="px-3 py-2"><StatusBadge tone={row.statut === 'valide' ? 'green' : 'red'}>{statutRepasLabel(row.statut)}</StatusBadge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="menus" className="space-y-4">
              <Panel title="Menus du jour" description={formatDateFr(today)}>
                {todayMenus.length === 0 ? (
                  <EmptyState title="Aucun menu publié aujourd’hui" description="Le comptoir appliquera les prix standard et premium." />
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {todayMenus.map((menu) => {
                      const plats = platsForMenu(menu);
                      return (
                        <div key={menu.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-lg font-black text-slate-900">{menu.titre}</p>
                                <StatusBadge tone={menu.type_repas === 'premium' ? 'amber' : 'green'}>{menu.type_repas}</StatusBadge>
                              </div>
                              {menu.description ? <p className="mt-1 text-sm text-slate-500">{menu.description}</p> : null}
                            </div>
                            <p className="whitespace-nowrap text-sm font-black text-green-800">{formatMoney(menu.prix, devise)}</p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {plats.length > 0 ? plats.map((plat) => (
                              <span key={plat.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{plat.nom}</span>
                            )) : <span className="text-xs text-slate-400">Composition non détaillée</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="Comment ça marche">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>Présentez votre QR au superviseur au moment du repas.</li>
                  <li>Le superviseur choisit standard ou premium puis valide.</li>
                  <li>La subvention du jour s’applique automatiquement si elle est disponible.</li>
                  <li>La retenue restante est enregistrée pour votre salaire et visible dans « Mes repas ».</li>
                </ol>
              </Panel>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default DangoteEmployePage;
