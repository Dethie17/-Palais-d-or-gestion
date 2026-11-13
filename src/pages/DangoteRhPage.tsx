import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  dangoteApi,
  downloadCsv,
  employeeInitials,
  employeeName,
  fetchDangoteDashboard,
  formatDateFr,
  formatMoney,
  formatTimeFr,
  moyenPaiementLabel,
  monthStartIso,
  num,
  shiftDate,
  statutPaiementLabel,
  statutRepasLabel,
  todayIso,
} from '@/lib/dangote';
import type {
  DangoteDashboard,
  DangoteEmploye,
  DangoteFacture,
  DangoteMenu,
  DangotePaiement,
  DangoteRepas,
  DangoteStats,
} from '@/types/dangote';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  dangerButtonClass,
  DangotePageHeader,
  EmptyState,
  Field,
  inputClass,
  LoadingState,
  Panel,
  primaryButtonClass,
  ProgressBar,
  SchemaBanner,
  secondaryButtonClass,
  StatCard,
  StatusBadge,
} from '@/components/dangote/DangoteUI';
import DangoteEmployeeDialog from '@/components/dangote/DangoteEmployeeDialog';
import DangoteDepositDialog from '@/components/dangote/DangoteDepositDialog';
import DangoteMenuDialog from '@/components/dangote/DangoteMenuDialog';
import DangoteCataloguePanel from '@/components/dangote/DangoteCataloguePanel';

interface SettingsForm {
  nomRestaurant: string;
  devise: string;
  heureOuverture: string;
  heureFermeture: string;
  prixStandard: string;
  prixPremium: string;
  subventionJour: string;
  valeurTicket: string;
  ticketsParTalon: string;
  quotaRepasJour: string;
  quotaRepasMois: string;
  budgetAlerteSeuil: string;
  autoSubvention: boolean;
}

const emptySettings: SettingsForm = {
  nomRestaurant: '',
  devise: 'FCFA',
  heureOuverture: '07:00',
  heureFermeture: '17:00',
  prixStandard: '1400',
  prixPremium: '2300',
  subventionJour: '750',
  valeurTicket: '1400',
  ticketsParTalon: '10',
  quotaRepasJour: '1',
  quotaRepasMois: '22',
  budgetAlerteSeuil: '50000',
  autoSubvention: true,
};

function paymentTone(statut: string): 'green' | 'amber' | 'red' | 'slate' {
  if (statut === 'paid') return 'green';
  if (statut === 'pending') return 'amber';
  if (statut === 'failed' || statut === 'cancelled') return 'red';
  return 'slate';
}

const DangoteRhPage = () => {
  const { user } = useAuth();
  const entiteId = user?.entiteId ?? '';
  const allowed = Boolean(user && (user.role === 'rh' || user.role === 'admin'));

  const [dashboard, setDashboard] = useState<DangoteDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('apercu');
  const [debut, setDebut] = useState(monthStartIso());
  const [fin, setFin] = useState(todayIso());
  const [reportDebut, setReportDebut] = useState(monthStartIso());
  const [reportFin, setReportFin] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [menuDate, setMenuDate] = useState(todayIso());
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(emptySettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [generatingFacture, setGeneratingFacture] = useState(false);

  const [employeeEditor, setEmployeeEditor] = useState<{ open: boolean; employe: DangoteEmploye | null }>({
    open: false,
    employe: null,
  });
  const [depositOpen, setDepositOpen] = useState(false);
  const [menuEditor, setMenuEditor] = useState<{ open: boolean; type: 'standard' | 'premium'; menu: DangoteMenu | null }>({
    open: false,
    type: 'standard',
    menu: null,
  });
  const [qrEmployee, setQrEmployee] = useState<DangoteEmploye | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!entiteId) {
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchDangoteDashboard(entiteId, { debut, fin });
      setDashboard(data);
      if (!data.schemaReady) setError(data.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entiteId, debut, fin]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => {
    const params = dashboard?.parametres;
    if (!params) return;
    setSettingsForm({
      nomRestaurant: params.nom_restaurant ?? '',
      devise: params.devise ?? 'FCFA',
      heureOuverture: params.heure_ouverture ?? '07:00',
      heureFermeture: params.heure_fermeture ?? '17:00',
      prixStandard: String(params.prix_standard ?? ''),
      prixPremium: String(params.prix_premium ?? ''),
      subventionJour: String(params.subvention_jour ?? ''),
      valeurTicket: String(params.valeur_ticket ?? ''),
      ticketsParTalon: String(params.tickets_par_talon ?? ''),
      quotaRepasJour: String(params.quota_repas_jour ?? ''),
      quotaRepasMois: String(params.quota_repas_mois ?? ''),
      budgetAlerteSeuil: String(params.budget_alerte_seuil ?? ''),
      autoSubvention: params.auto_subvention !== false,
    });
  }, [dashboard?.parametres]);

  const parametres = dashboard?.parametres ?? null;
  const devise = parametres?.devise ?? 'FCFA';
  const budgetSolde = num(dashboard?.budget?.solde ?? dashboard?.stats?.solde ?? 0);
  const seuilAlerte = num(parametres?.budget_alerte_seuil ?? 0);
  const budgetBas = seuilAlerte > 0 && budgetSolde <= seuilAlerte;

  const employes = dashboard?.employes ?? [];
  const activeEmployees = useMemo(() => employes.filter((employe) => employe.actif), [employes]);
  const repasValides = useMemo(
    () => (dashboard?.repas ?? []).filter((repas) => repas.statut === 'valide'),
    [dashboard?.repas],
  );
  const today = todayIso();
  const repasAujourdhui = useMemo(
    () => repasValides.filter((repas) => repas.date_jour === today),
    [repasValides, today],
  );
  const menusAujourdhui = useMemo(
    () => (dashboard?.menus ?? []).filter((menu) => menu.date_jour === today),
    [dashboard?.menus, today],
  );
  const lowStock = useMemo(
    () => (dashboard?.plats ?? []).filter(
      (plat) => plat.stock_quantite != null && plat.stock_alerte != null && plat.stock_quantite <= plat.stock_alerte,
    ),
    [dashboard?.plats],
  );

  const stats: DangoteStats = useMemo(() => {
    if (dashboard?.stats) return dashboard.stats;
    const byService = new Map<string, { repas: number; retenues: number }>();
    const byDay = new Map<string, { repas: number; chiffre_affaires: number; retenues: number }>();
    for (const repas of repasValides) {
      const employe = employes.find((item) => item.id === repas.employe_id);
      const service = employe?.service?.trim() || 'Non affecté';
      const serviceRow = byService.get(service) ?? { repas: 0, retenues: 0 };
      serviceRow.repas += 1;
      serviceRow.retenues += num(repas.retenue_salaire);
      byService.set(service, serviceRow);

      const dayRow = byDay.get(repas.date_jour) ?? { repas: 0, chiffre_affaires: 0, retenues: 0 };
      dayRow.repas += 1;
      dayRow.chiffre_affaires += num(repas.prix);
      dayRow.retenues += num(repas.retenue_salaire);
      byDay.set(repas.date_jour, dayRow);
    }
    return {
      ok: true,
      debut,
      fin,
      solde: budgetSolde,
      employes_actifs: activeEmployees.length,
      repas: repasValides.length,
      repas_standard: repasValides.filter((repas) => repas.type_repas === 'standard').length,
      repas_premium: repasValides.filter((repas) => repas.type_repas === 'premium').length,
      chiffre_affaires: repasValides.reduce((sum, repas) => sum + num(repas.prix), 0),
      subventions: repasValides.reduce((sum, repas) => sum + num(repas.subvention_appliquee), 0),
      retenues: repasValides.reduce((sum, repas) => sum + num(repas.retenue_salaire), 0),
      participants: new Set(repasValides.map((repas) => repas.employe_id)).size,
      par_service: Array.from(byService.entries()).map(([service, row]) => ({ service, ...row })),
      par_jour: Array.from(byDay.entries())
        .map(([date_jour, row]) => ({ date_jour, ...row }))
        .sort((a, b) => a.date_jour.localeCompare(b.date_jour)),
    };
  }, [dashboard?.stats, repasValides, employes, activeEmployees.length, budgetSolde, debut, fin]);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return employes;
    return employes.filter((employe) => (
      `${employe.prenom} ${employe.nom} ${employe.matricule} ${employe.service ?? ''} ${employe.poste ?? ''}`
        .toLowerCase()
        .includes(needle)
    ));
  }, [employes, search]);

  const menuFor = (type: 'standard' | 'premium') =>
    (dashboard?.menus ?? []).find((menu) => menu.date_jour === menuDate && menu.type_repas === type) ?? null;

  const platsForMenu = (menu: DangoteMenu | null) => {
    if (!menu) return [];
    const ids = new Set(
      (dashboard?.menuPlats ?? []).filter((row) => row.menu_id === menu.id).map((row) => row.plat_id),
    );
    return (dashboard?.plats ?? []).filter((plat) => ids.has(plat.id));
  };

  const openMenuEditor = (type: 'standard' | 'premium') => {
    setMenuEditor({ open: true, type, menu: menuFor(type) });
  };

  const verifyPayment = async (reference: string) => {
    setVerifying(reference);
    try {
      const result = await dangoteApi<{ ok?: boolean; status?: string; error?: string; montant?: number }>(
        'deposit.status',
        { entiteId, reference },
      );
      if (result.status === 'paid') {
        toast.success(`Paiement confirmé : ${formatMoney(num(result.montant), devise)}.`);
      } else if (result.status === 'pending') {
        toast.info('Paiement toujours en attente chez SycaPay.');
      } else {
        toast.error(result.error ?? `Paiement ${result.status ?? 'échoué'}.`);
      }
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifying(null);
    }
  };

  const toggleEmployee = async (employe: DangoteEmploye) => {
    const next = !employe.actif;
    if (!window.confirm(`${next ? 'Réactiver' : 'Désactiver'} ${employeeName(employe)} ?`)) return;
    try {
      await dangoteApi('employee.toggle', { entiteId, id: employe.id, actif: next });
      toast.success(next ? 'Employé réactivé.' : 'Employé désactivé.');
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const rotateQr = async (employe: DangoteEmploye) => {
    if (!window.confirm(`Générer un nouveau QR pour ${employeeName(employe)} ? L’ancien QR cessera de fonctionner.`)) return;
    try {
      const result = await dangoteApi<{ qr_token?: string }>('employee.rotateQr', { entiteId, id: employe.id });
      toast.success(`Nouveau QR : ${result.qr_token ?? 'généré'}.`);
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deleteMenu = async (menu: DangoteMenu) => {
    if (!window.confirm(`Supprimer le menu « ${menu.titre} » du ${formatDateFr(menu.date_jour)} ?`)) return;
    try {
      await dangoteApi('menu.delete', { entiteId, id: menu.id });
      toast.success('Menu supprimé.');
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      await dangoteApi('settings.save', {
        entiteId,
        nomRestaurant: settingsForm.nomRestaurant,
        devise: settingsForm.devise,
        heureOuverture: settingsForm.heureOuverture,
        heureFermeture: settingsForm.heureFermeture,
        prixStandard: settingsForm.prixStandard,
        prixPremium: settingsForm.prixPremium,
        subventionJour: settingsForm.subventionJour,
        valeurTicket: settingsForm.valeurTicket,
        ticketsParTalon: settingsForm.ticketsParTalon,
        quotaRepasJour: settingsForm.quotaRepasJour,
        quotaRepasMois: settingsForm.quotaRepasMois,
        budgetAlerteSeuil: settingsForm.budgetAlerteSeuil,
        autoSubvention: settingsForm.autoSubvention,
      });
      toast.success('Paramètres enregistrés.');
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  const applyRange = () => {
    if (!reportDebut || !reportFin) {
      toast.error('Choisissez une période complète.');
      return;
    }
    if (reportDebut > reportFin) {
      toast.error('La date de début doit précéder la date de fin.');
      return;
    }
    setDebut(reportDebut);
    setFin(reportFin);
  };

  const exportRepas = () => {
    const lines: string[][] = [
      ['Date', 'Heure', 'Matricule', 'Employé', 'Service', 'Type', 'Prix', 'Subvention', 'Retenue', 'Statut', 'Référence'],
    ];
    for (const repas of dashboard?.repas ?? []) {
      const employe = employes.find((item) => item.id === repas.employe_id);
      lines.push([
        repas.date_jour,
        formatTimeFr(repas.created_at),
        employe?.matricule ?? '',
        employeeName(employe),
        employe?.service ?? '',
        repas.type_repas,
        String(repas.prix),
        String(repas.subvention_appliquee),
        String(repas.retenue_salaire),
        statutRepasLabel(repas.statut),
        repas.reference ?? '',
      ]);
    }
    downloadCsv(`dangote-repas-${debut}-${fin}.csv`, lines);
  };

  const generateFacture = async () => {
    setGeneratingFacture(true);
    try {
      const result = await dangoteApi<{ facture?: DangoteFacture }>('facture.generate', { entiteId, debut, fin });
      const facture = result.facture;
      if (facture) {
        await downloadFacturePdf(facture, parametres?.nom_restaurant ?? "MIAM'S Dangote", devise);
      }
      toast.success('Facture générée.');
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGeneratingFacture(false);
    }
  };

  const downloadFacturePdf = async (facture: DangoteFacture, nomRestaurant: string, monnaie: string) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(nomRestaurant, 20, 20);
    doc.setFontSize(11);
    doc.text('Facture de restauration collective', 20, 28);
    doc.setFontSize(10);
    doc.text(`Numéro : ${facture.numero}`, 20, 42);
    doc.text(`Période : ${formatDateFr(facture.periode_debut)} au ${formatDateFr(facture.periode_fin)}`, 20, 49);
    doc.text(`Total repas : ${formatMoney(facture.montant_total, monnaie)}`, 20, 56);
    doc.text(`Subvention entreprise : ${formatMoney(facture.montant_subvention, monnaie)}`, 20, 63);
    doc.text(`Retenues salariés : ${formatMoney(facture.montant_retenues, monnaie)}`, 20, 70);
    doc.text(`Statut : ${facture.statut}`, 20, 77);
    doc.text(`Émise le : ${new Date(facture.created_at).toLocaleString('fr-FR')}`, 20, 84);
    doc.save(`facture-${facture.numero}.pdf`);
  };

  if (!allowed) {
    return <div className="p-8 font-bold text-red-600">Accès réservé à la Direction du Capital Humain.</div>;
  }

  if (loading && !dashboard) {
    return (
      <div className="space-y-4 p-4 lg:p-8">
        <LoadingState label="Chargement du module Dangote Pro…" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <DangotePageHeader
        eyebrow="Direction du Capital Humain"
        title={parametres?.nom_restaurant ?? "MIAM'S Dangote"}
        description="Pilotez les employés, les menus, le budget et les rapports de restauration."
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <>
            <button className={secondaryButtonClass} onClick={() => void load(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualiser
            </button>
            <button className={secondaryButtonClass} onClick={() => setDepositOpen(true)}>
              <Wallet className="h-4 w-4" /> Recharger le budget
            </button>
            <button className={primaryButtonClass} onClick={() => setEmployeeEditor({ open: true, employe: null })}>
              <Plus className="h-4 w-4" /> Ajouter un employé
            </button>
          </>
        }
      />

      <SchemaBanner message={error} />

      {!dashboard?.schemaReady && !error ? (
        <SchemaBanner message="Exécutez supabase-dangote-pro.sql dans Supabase pour activer toutes les fonctions Pro." />
      ) : null}

      {budgetBas ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Budget bas</p>
            <p className="mt-0.5 text-xs">
              Solde actuel : {formatMoney(budgetSolde, devise)}. Seuil d’alerte : {formatMoney(seuilAlerte, devise)}.
              Rechargez le budget avant la prochaine validation.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="apercu" className="gap-1.5"><LayoutDashboard className="h-4 w-4" /> Vue d’ensemble</TabsTrigger>
          <TabsTrigger value="employes" className="gap-1.5"><Users className="h-4 w-4" /> Employés</TabsTrigger>
          <TabsTrigger value="menus" className="gap-1.5"><UtensilsCrossed className="h-4 w-4" /> Menus</TabsTrigger>
          <TabsTrigger value="budget" className="gap-1.5"><Wallet className="h-4 w-4" /> Budget</TabsTrigger>
          <TabsTrigger value="rapports" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Rapports</TabsTrigger>
          <TabsTrigger value="parametres" className="gap-1.5"><Settings className="h-4 w-4" /> Paramètres</TabsTrigger>
        </TabsList>

        <TabsContent value="apercu" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Budget disponible"
              value={formatMoney(budgetSolde, devise)}
              hint={budgetBas ? 'Sous le seuil d’alerte' : `Seuil d’alerte ${formatMoney(seuilAlerte, devise)}`}
              tone={budgetBas ? 'amber' : 'green'}
              icon={<Wallet className="h-5 w-5" />}
            />
            <StatCard
              label="Repas servis aujourd’hui"
              value={repasAujourdhui.length}
              hint={`${repasAujourdhui.filter((repas) => repas.type_repas === 'premium').length} premium`}
              tone="blue"
              icon={<UtensilsCrossed className="h-5 w-5" />}
            />
            <StatCard
              label="Employés actifs"
              value={activeEmployees.length}
              hint={`${employes.length - activeEmployees.length} désactivé(s)`}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Retenues du mois"
              value={formatMoney(stats.retenues, devise)}
              hint={`${stats.repas} repas · ${stats.participants} participant(s)`}
              icon={<Banknote className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Menus du jour"
              description={formatDateFr(today)}
              actions={<button className={secondaryButtonClass} onClick={() => setTab('menus')}>Gérer</button>}
            >
              {menusAujourdhui.length === 0 ? (
                <EmptyState title="Aucun menu publié aujourd’hui" description="Créez les menus standard et premium pour cadrer les prix du jour." />
              ) : (
                <div className="space-y-3">
                  {menusAujourdhui.map((menu) => {
                    const plats = platsForMenu(menu);
                    return (
                      <div key={menu.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black text-slate-900">{menu.titre}</p>
                              <StatusBadge tone={menu.type_repas === 'premium' ? 'amber' : 'green'}>
                                {menu.type_repas === 'premium' ? 'Premium' : 'Standard'}
                              </StatusBadge>
                              {!menu.actif ? <StatusBadge tone="red">Inactif</StatusBadge> : null}
                            </div>
                            {menu.description ? <p className="mt-1 text-xs text-slate-500">{menu.description}</p> : null}
                          </div>
                          <p className="text-sm font-black text-green-800">{formatMoney(menu.prix, devise)}</p>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {plats.length > 0 ? plats.map((plat) => plat.nom).join(' · ') : 'Aucun plat détaillé'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Alertes stock" description="Plats au niveau ou sous le seuil d’alerte.">
              {lowStock.length === 0 ? (
                <EmptyState title="Aucune alerte stock" description="Tous les plats suivis sont au-dessus de leur seuil." />
              ) : (
                <div className="space-y-2">
                  {lowStock.map((plat) => (
                    <div key={plat.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <div>
                        <p className="text-sm font-bold text-amber-900">{plat.nom}</p>
                        <p className="text-xs text-amber-700">Seuil : {plat.stock_alerte}</p>
                      </div>
                      <StatusBadge tone="amber">{plat.stock_quantite} restant(s)</StatusBadge>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Panel title="Derniers repas" description="Les six dernières validations.">
              {repasValides.length === 0 ? (
                <EmptyState title="Aucun repas validé sur la période" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Employé</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Prix</th>
                        <th className="px-3 py-2">Retenue</th>
                        <th className="px-3 py-2">Heure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repasValides.slice(0, 6).map((repas) => {
                        const employe = employes.find((item) => item.id === repas.employe_id);
                        return (
                          <tr key={repas.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <p className="font-bold text-slate-800">{employeeName(employe)}</p>
                              <p className="text-xs text-slate-500">{employe?.matricule ?? '—'}</p>
                            </td>
                            <td className="px-3 py-2"><StatusBadge tone={repas.type_repas === 'premium' ? 'amber' : 'green'}>{repas.type_repas}</StatusBadge></td>
                            <td className="px-3 py-2 font-bold">{formatMoney(repas.prix, devise)}</td>
                            <td className="px-3 py-2">{formatMoney(repas.retenue_salaire, devise)}</td>
                            <td className="px-3 py-2 text-slate-500">{formatTimeFr(repas.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Derniers mouvements budget">
              {(dashboard?.ledger ?? []).length === 0 ? (
                <EmptyState title="Aucun mouvement" />
              ) : (
                <div className="space-y-2">
                  {(dashboard?.ledger ?? []).slice(0, 6).map((row) => {
                    const positive = num(row.montant) >= 0;
                    return (
                      <div key={row.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                        <div className="flex items-center gap-2">
                          {positive ? <ArrowDownLeft className="h-4 w-4 text-emerald-600" /> : <ArrowUpRight className="h-4 w-4 text-red-500" />}
                          <div>
                            <p className="text-sm font-bold capitalize text-slate-800">{row.type}</p>
                            <p className="text-xs text-slate-500">{formatTimeFr(row.created_at)} · {row.created_by_username ?? 'système'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-black ${positive ? 'text-emerald-700' : 'text-red-600'}`}>
                            {positive ? '+' : ''}{formatMoney(row.montant, devise)}
                          </p>
                          <p className="text-xs text-slate-500">solde {formatMoney(row.solde_apres, devise)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="employes" className="space-y-4">
          <Panel
            title={`Employés (${employes.length})`}
            description="Fiches, plafonds et QR codes individuels."
            actions={
              <>
                <input
                  className={`${inputClass} sm:w-64`}
                  placeholder="Rechercher un nom, matricule, service…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button className={primaryButtonClass} onClick={() => setEmployeeEditor({ open: true, employe: null })}>
                  <Plus className="h-4 w-4" /> Ajouter
                </button>
              </>
            }
          >
            {filteredEmployees.length === 0 ? (
              <EmptyState title="Aucun employé trouvé" description={search ? 'Modifiez votre recherche.' : 'Ajoutez le premier employé Dangote.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Employé</th>
                      <th className="px-3 py-2">Service / poste</th>
                      <th className="px-3 py-2">Plafonds</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2">QR</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employe) => (
                      <tr key={employe.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-xs font-black text-green-800">
                              {employeeInitials(employe)}
                            </span>
                            <div>
                              <p className="font-bold text-slate-800">{employeeName(employe)}</p>
                              <p className="text-xs text-slate-500">{employe.matricule}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-slate-700">{employe.service ?? '—'}</p>
                          <p className="text-xs text-slate-500">{employe.poste ?? ''}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          <p>Jour : {employe.plafond_journalier != null ? formatMoney(employe.plafond_journalier, devise) : 'libre'}</p>
                          <p>Mois : {employe.plafond_mensuel != null ? formatMoney(employe.plafond_mensuel, devise) : 'libre'}</p>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={employe.actif ? 'green' : 'red'}>{employe.actif ? 'Actif' : 'Désactivé'}</StatusBadge>
                        </td>
                        <td className="px-3 py-2">
                          <button className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700" onClick={() => setQrEmployee(employe)}>
                            <QrCode className="h-3.5 w-3.5" /> Voir
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button className={secondaryButtonClass} title="Modifier" onClick={() => setEmployeeEditor({ open: true, employe })}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button className={secondaryButtonClass} title="Nouveau QR" onClick={() => void rotateQr(employe)}>
                              <RotateCcw className="h-4 w-4" />
                            </button>
                            <button className={employe.actif ? dangerButtonClass : secondaryButtonClass} title={employe.actif ? 'Désactiver' : 'Réactiver'} onClick={() => void toggleEmployee(employe)}>
                              {employe.actif ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="menus" className="space-y-4">
          <Panel
            title="Menus du jour"
            description="Publiez le menu standard et le menu premium. Le prix du menu s’applique à la validation."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <button className={secondaryButtonClass} onClick={() => setMenuDate(shiftDate(menuDate, -1))}>
                  <CalendarDays className="h-4 w-4" /> Veille
                </button>
                <input type="date" className={`${inputClass} w-40`} value={menuDate} onChange={(event) => setMenuDate(event.target.value)} />
                <button className={secondaryButtonClass} onClick={() => setMenuDate(shiftDate(menuDate, 1))}>
                  <CalendarDays className="h-4 w-4" /> Lendemain
                </button>
              </div>
            }
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {(['standard', 'premium'] as const).map((type) => {
                const menu = menuFor(type);
                const plats = platsForMenu(menu);
                return (
                  <div key={type} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-900">{type === 'premium' ? 'Menu premium' : 'Menu standard'}</p>
                          <StatusBadge tone={type === 'premium' ? 'amber' : 'green'}>{type}</StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{formatDateFr(menuDate)}</p>
                      </div>
                      {menu ? (
                        <div className="flex gap-1">
                          <button className={secondaryButtonClass} onClick={() => openMenuEditor(type)}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button className={dangerButtonClass} onClick={() => void deleteMenu(menu)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button className={primaryButtonClass} onClick={() => openMenuEditor(type)}>
                          <Plus className="h-4 w-4" /> Créer
                        </button>
                      )}
                    </div>
                    {menu ? (
                      <>
                        <p className="mt-3 text-lg font-black text-slate-900">{menu.titre}</p>
                        {menu.description ? <p className="mt-1 text-sm text-slate-500">{menu.description}</p> : null}
                        <p className="mt-2 text-sm font-bold text-green-800">{formatMoney(menu.prix, devise)}</p>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {plats.length > 0 ? plats.map((plat) => (
                            <span key={plat.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{plat.nom}</span>
                          )) : <span className="text-xs text-slate-400">Aucun plat détaillé</span>}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">Aucun menu publié pour cette date.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <DangoteCataloguePanel
            entiteId={entiteId}
            categories={dashboard?.categories ?? []}
            plats={dashboard?.plats ?? []}
            onChanged={() => void load(true)}
          />
        </TabsContent>

        <TabsContent value="budget" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Solde budget" value={formatMoney(budgetSolde, devise)} tone={budgetBas ? 'amber' : 'green'} icon={<Wallet className="h-5 w-5" />} />
            <StatCard label="Dépôts (période)" value={formatMoney((dashboard?.ledger ?? []).filter((row) => row.type === 'depot' || row.type === 'achat').reduce((sum, row) => sum + num(row.montant), 0), devise)} tone="blue" icon={<ArrowDownLeft className="h-5 w-5" />} />
            <StatCard label="Consommations (période)" value={formatMoney(stats.retenues, devise)} tone="amber" icon={<ArrowUpRight className="h-5 w-5" />} />
          </div>

          <Panel
            title="Paiements et recharges"
            description="Les paiements SycaPay restent en attente jusqu’à confirmation. Vérifiez manuellement si besoin."
            actions={<button className={primaryButtonClass} onClick={() => setDepositOpen(true)}><Plus className="h-4 w-4" /> Nouveau dépôt</button>}
          >
            {(dashboard?.paiements ?? []).length === 0 ? (
              <EmptyState title="Aucun paiement enregistré" description="Rechargez le budget par Wave, Orange Money, carte ou dépôt manuel." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Référence</th>
                      <th className="px-3 py-2">Montant</th>
                      <th className="px-3 py-2">Moyen</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.paiements ?? []).map((paiement: DangotePaiement) => (
                      <tr key={paiement.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{formatDateFr(paiement.created_at)}<span className="block text-xs text-slate-400">{formatTimeFr(paiement.created_at)}</span></td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">{paiement.reference}</td>
                        <td className="px-3 py-2 font-bold">{formatMoney(paiement.montant, devise)}</td>
                        <td className="px-3 py-2">{moyenPaiementLabel(paiement.methode)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={paymentTone(paiement.statut)}>{statutPaiementLabel(paiement.statut)}</StatusBadge>
                          {paiement.provider_status ? <span className="mt-1 block text-[11px] text-slate-400">{paiement.provider_status}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {paiement.statut === 'pending' ? (
                            <button className={secondaryButtonClass} disabled={verifying === paiement.reference} onClick={() => void verifyPayment(paiement.reference)}>
                              {verifying === paiement.reference ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              Vérifier
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">{paiement.settled_at ? formatDateFr(paiement.settled_at) : '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Journal du budget" description="Tous les mouvements : dépôts, consommations, annulations, factures.">
            {(dashboard?.ledger ?? []).length === 0 ? (
              <EmptyState title="Aucun mouvement" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Montant</th>
                      <th className="px-3 py-2">Solde après</th>
                      <th className="px-3 py-2">Référence</th>
                      <th className="px-3 py-2">Acteur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.ledger ?? []).map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{formatDateFr(row.created_at)}<span className="block text-xs text-slate-400">{formatTimeFr(row.created_at)}</span></td>
                        <td className="px-3 py-2"><StatusBadge tone={num(row.montant) >= 0 ? 'green' : 'amber'}>{row.type}</StatusBadge></td>
                        <td className={`px-3 py-2 font-bold ${num(row.montant) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.montant, devise)}</td>
                        <td className="px-3 py-2">{formatMoney(row.solde_apres, devise)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.reference ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.created_by_username ?? 'système'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="rapports" className="space-y-4">
          <Panel
            title="Période d’analyse"
            description="Toutes les statistiques et exports portent sur cette période."
            actions={
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Du">
                  <input type="date" className={`${inputClass} w-40`} value={reportDebut} onChange={(event) => setReportDebut(event.target.value)} />
                </Field>
                <Field label="Au">
                  <input type="date" className={`${inputClass} w-40`} value={reportFin} onChange={(event) => setReportFin(event.target.value)} />
                </Field>
                <button className={primaryButtonClass} onClick={applyRange}><RefreshCw className="h-4 w-4" /> Appliquer</button>
                <button className={secondaryButtonClass} onClick={exportRepas}><Download className="h-4 w-4" /> Export CSV</button>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Repas" value={stats.repas} hint={`${stats.repas_standard} standard · ${stats.repas_premium} premium`} />
              <StatCard label="Participants" value={stats.participants} hint={`${stats.employes_actifs} employés actifs`} />
              <StatCard label="Chiffre d’affaires" value={formatMoney(stats.chiffre_affaires, devise)} tone="blue" />
              <StatCard label="Subventions" value={formatMoney(stats.subventions, devise)} tone="green" />
              <StatCard label="Retenues salariés" value={formatMoney(stats.retenues, devise)} tone="amber" />
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Par service">
              {stats.par_service.length === 0 ? (
                <EmptyState title="Aucune donnée sur la période" />
              ) : (
                <div className="space-y-3">
                  {stats.par_service.map((row) => {
                    const max = Math.max(...stats.par_service.map((item) => item.repas), 1);
                    return (
                      <div key={row.service}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-bold text-slate-700">{row.service}</span>
                          <span className="text-slate-500">{row.repas} repas · {formatMoney(row.retenues, devise)}</span>
                        </div>
                        <ProgressBar value={(row.repas / max) * 100} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Par jour">
              {stats.par_jour.length === 0 ? (
                <EmptyState title="Aucune donnée sur la période" />
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Repas</th>
                        <th className="px-3 py-2">CA</th>
                        <th className="px-3 py-2">Retenues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.par_jour.map((row) => (
                        <tr key={row.date_jour} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{formatDateFr(row.date_jour)}</td>
                          <td className="px-3 py-2 font-bold">{row.repas}</td>
                          <td className="px-3 py-2">{formatMoney(row.chiffre_affaires, devise)}</td>
                          <td className="px-3 py-2">{formatMoney(row.retenues, devise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <Panel
            title="Facturation"
            description="Générez une facture PDF sur la période sélectionnée et retrouvez l’historique."
            actions={<button className={primaryButtonClass} disabled={generatingFacture} onClick={() => void generateFacture()}>
              {generatingFacture ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Générer la facture
            </button>}
          >
            {(dashboard?.factures ?? []).length === 0 ? (
              <EmptyState title="Aucune facture" description="La facture reprend le total repas, la subvention et les retenues de la période." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Numéro</th>
                      <th className="px-3 py-2">Période</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Subvention</th>
                      <th className="px-3 py-2">Retenues</th>
                      <th className="px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.factures ?? []).map((facture) => (
                      <tr key={facture.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs font-bold text-slate-700">{facture.numero}</td>
                        <td className="px-3 py-2 text-slate-600">{formatDateFr(facture.periode_debut)} → {formatDateFr(facture.periode_fin)}</td>
                        <td className="px-3 py-2 font-bold">{formatMoney(facture.montant_total, devise)}</td>
                        <td className="px-3 py-2">{formatMoney(facture.montant_subvention, devise)}</td>
                        <td className="px-3 py-2">{formatMoney(facture.montant_retenues, devise)}</td>
                        <td className="px-3 py-2"><StatusBadge tone={facture.statut === 'payee' ? 'green' : facture.statut === 'annulee' ? 'red' : 'blue'}>{facture.statut}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Journal d’audit" description="Les 60 dernières actions sensibles.">
            {(dashboard?.audit ?? []).length === 0 ? (
              <EmptyState title="Aucune action enregistrée" />
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Acteur</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Cible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.audit ?? []).map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{formatDateFr(row.created_at)}<span className="block text-xs text-slate-400">{formatTimeFr(row.created_at)}</span></td>
                        <td className="px-3 py-2 font-bold text-slate-700">{row.acteur_username ?? 'système'}</td>
                        <td className="px-3 py-2">{row.action}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{row.cible_type ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="parametres" className="space-y-4">
          <Panel title="Paramètres du restaurant" description="Prix, quotas, horaires et seuil d’alerte budget.">
            <form onSubmit={saveSettings} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Nom du restaurant">
                  <input className={inputClass} value={settingsForm.nomRestaurant} onChange={(event) => setSettingsForm((current) => ({ ...current, nomRestaurant: event.target.value }))} required />
                </Field>
                <Field label="Devise">
                  <input className={inputClass} value={settingsForm.devise} onChange={(event) => setSettingsForm((current) => ({ ...current, devise: event.target.value }))} required />
                </Field>
                <Field label="Seuil d’alerte budget (FCFA)">
                  <input type="number" min={0} className={inputClass} value={settingsForm.budgetAlerteSeuil} onChange={(event) => setSettingsForm((current) => ({ ...current, budgetAlerteSeuil: event.target.value }))} />
                </Field>
                <Field label="Heure d’ouverture">
                  <input type="time" className={inputClass} value={settingsForm.heureOuverture} onChange={(event) => setSettingsForm((current) => ({ ...current, heureOuverture: event.target.value }))} />
                </Field>
                <Field label="Heure de fermeture">
                  <input type="time" className={inputClass} value={settingsForm.heureFermeture} onChange={(event) => setSettingsForm((current) => ({ ...current, heureFermeture: event.target.value }))} />
                </Field>
                <Field label="Prix standard (FCFA)">
                  <input type="number" min={0} className={inputClass} value={settingsForm.prixStandard} onChange={(event) => setSettingsForm((current) => ({ ...current, prixStandard: event.target.value }))} />
                </Field>
                <Field label="Prix premium (FCFA)">
                  <input type="number" min={0} className={inputClass} value={settingsForm.prixPremium} onChange={(event) => setSettingsForm((current) => ({ ...current, prixPremium: event.target.value }))} />
                </Field>
                <Field label="Subvention journalière (FCFA)">
                  <input type="number" min={0} className={inputClass} value={settingsForm.subventionJour} onChange={(event) => setSettingsForm((current) => ({ ...current, subventionJour: event.target.value }))} />
                </Field>
                <Field label="Valeur du ticket (FCFA)">
                  <input type="number" min={0} className={inputClass} value={settingsForm.valeurTicket} onChange={(event) => setSettingsForm((current) => ({ ...current, valeurTicket: event.target.value }))} />
                </Field>
                <Field label="Tickets par talon">
                  <input type="number" min={1} className={inputClass} value={settingsForm.ticketsParTalon} onChange={(event) => setSettingsForm((current) => ({ ...current, ticketsParTalon: event.target.value }))} />
                </Field>
                <Field label="Repas subventionnés / jour">
                  <input type="number" min={1} className={inputClass} value={settingsForm.quotaRepasJour} onChange={(event) => setSettingsForm((current) => ({ ...current, quotaRepasJour: event.target.value }))} />
                </Field>
                <Field label="Repas subventionnés / mois">
                  <input type="number" min={1} className={inputClass} value={settingsForm.quotaRepasMois} onChange={(event) => setSettingsForm((current) => ({ ...current, quotaRepasMois: event.target.value }))} />
                </Field>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600"
                  checked={settingsForm.autoSubvention}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, autoSubvention: event.target.checked }))}
                />
                  Appliquer automatiquement la subvention dans la limite des quotas
              </label>
              <div className="flex justify-end">
                <button type="submit" className={primaryButtonClass} disabled={savingSettings}>
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer les paramètres
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="État du module" description="Vérifications rapides avant la mise en production.">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <CheckCircle2 className={`h-4 w-4 ${dashboard?.schemaReady ? 'text-emerald-600' : 'text-amber-600'}`} />
                Schéma Pro : {dashboard?.schemaReady ? 'installé' : 'à installer'}
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <CheckCircle2 className={`h-4 w-4 ${parametres ? 'text-emerald-600' : 'text-amber-600'}`} />
                Paramètres : {parametres ? 'configurés' : 'manquants'}
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <CheckCircle2 className={`h-4 w-4 ${employes.length > 0 ? 'text-emerald-600' : 'text-slate-400'}`} />
                Employés : {employes.length}
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <CheckCircle2 className={`h-4 w-4 ${budgetSolde > 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                Budget : {formatMoney(budgetSolde, devise)}
              </div>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <DangoteEmployeeDialog
        open={employeeEditor.open}
        onOpenChange={(open) => setEmployeeEditor((current) => ({ ...current, open }))}
        entiteId={entiteId}
        employe={employeeEditor.employe}
        onSaved={() => void load(true)}
      />

      <DangoteDepositDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        entiteId={entiteId}
        onDone={() => void load(true)}
      />

      <DangoteMenuDialog
        open={menuEditor.open}
        onOpenChange={(open) => setMenuEditor((current) => ({ ...current, open }))}
        entiteId={entiteId}
        dateJour={menuDate}
        typeRepas={menuEditor.type}
        menu={menuEditor.menu}
        menuPlats={dashboard?.menuPlats ?? []}
        plats={dashboard?.plats ?? []}
        categories={dashboard?.categories ?? []}
        defaultPrix={Number(menuEditor.type === 'premium' ? parametres?.prix_premium ?? 2300 : parametres?.prix_standard ?? 1400)}
        onSaved={() => void load(true)}
      />

      <Dialog open={Boolean(qrEmployee)} onOpenChange={(open) => { if (!open) setQrEmployee(null); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR de {employeeName(qrEmployee)}</DialogTitle>
            <DialogDescription>{qrEmployee?.matricule} — présentez ce code au comptoir.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              {qrEmployee ? <QRCodeSVG value={qrEmployee.qr_token} size={220} /> : null}
            </div>
          </div>
          <p className="break-all font-mono text-xs text-slate-500">{qrEmployee?.qr_token}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DangoteRhPage;
