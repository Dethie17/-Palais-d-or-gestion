import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Camera,
  CheckCircle2,
  Download,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  StopCircle,
  Users,
  UtensilsCrossed,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
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
  monthStartIso,
  num,
  statutRepasLabel,
  todayIso,
} from '@/lib/dangote';
import type { DangoteApiResponse, DangoteDashboard, DangoteEmploye, DangoteRepas } from '@/types/dangote';
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
  SchemaBanner,
  secondaryButtonClass,
  StatCard,
  StatusBadge,
} from '@/components/dangote/DangoteUI';

const DangoteSuperviseurPage = () => {
  const { user } = useAuth();
  const entiteId = user?.entiteId ?? '';
  const allowed = Boolean(user && (user.role === 'superviseur-dangote' || user.role === 'admin'));

  const [dashboard, setDashboard] = useState<DangoteDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('validation');

  const [qrInput, setQrInput] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [selected, setSelected] = useState<DangoteEmploye | null>(null);
  const [typeRepas, setTypeRepas] = useState<'standard' | 'premium'>('standard');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<DangoteApiResponse | null>(null);
  const [validating, setValidating] = useState(false);

  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerStartedRef = useRef(false);

  const [orderSearch, setOrderSearch] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<DangoteEmploye | null>(null);
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
      const data = await fetchDangoteDashboard(entiteId, { debut: monthStartIso(), fin: todayIso() });
      setDashboard(data);
      if (!data.schemaReady) setError(data.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entiteId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => () => {
    if (scannerRef.current && scannerStartedRef.current) {
      void scannerRef.current.stop().catch(() => undefined);
    }
  }, []);

  const parametres = dashboard?.parametres ?? null;
  const devise = parametres?.devise ?? 'FCFA';
  const employes = dashboard?.employes ?? [];
  const today = todayIso();
  const repas = dashboard?.repas ?? [];
  const todayRepas = useMemo(
    () => repas.filter((repasRow) => repasRow.date_jour === today),
    [repas, today],
  );
  const todayValid = useMemo(
    () => todayRepas.filter((repasRow) => repasRow.statut === 'valide'),
    [todayRepas],
  );
  const budgetSolde = num(dashboard?.budget?.solde ?? dashboard?.stats?.solde ?? 0);
  const todayMenus = useMemo(
    () => (dashboard?.menus ?? []).filter((menu) => menu.date_jour === today && menu.actif),
    [dashboard?.menus, today],
  );

  const priceFor = (type: 'standard' | 'premium') => {
    const menu = todayMenus.find((item) => item.type_repas === type);
    if (menu) return num(menu.prix);
    return num(type === 'premium' ? parametres?.prix_premium : parametres?.prix_standard);
  };

  const employeeToday = useMemo(() => {
    if (!selected) return { repas: 0, subventionnes: 0, subventionnesMois: 0, depense: 0, mois: 0, depenseMois: 0 };
    const mine = repas.filter((row) => row.employe_id === selected.id && row.statut === 'valide');
    const monthStart = monthStartIso();
    return {
      repas: mine.filter((row) => row.date_jour === today).length,
      subventionnes: mine.filter((row) => row.date_jour === today && num(row.subvention_appliquee) > 0).length,
      subventionnesMois: mine.filter((row) => row.date_jour >= monthStart && num(row.subvention_appliquee) > 0).length,
      depense: mine.filter((row) => row.date_jour === today).reduce((sum, row) => sum + num(row.retenue_salaire), 0),
      mois: mine.filter((row) => row.date_jour >= monthStart).length,
      depenseMois: mine.filter((row) => row.date_jour >= monthStart).reduce((sum, row) => sum + num(row.retenue_salaire), 0),
    };
  }, [selected, repas, today]);

  const estimate = useMemo(() => {
    const prix = priceFor(typeRepas);
    const quotaJour = num(parametres?.quota_repas_jour ?? 1);
    const quotaMois = num(parametres?.quota_repas_mois ?? 22);
    const auto = parametres?.auto_subvention !== false;
    const subvention = auto && employeeToday.subventionnes < quotaJour && employeeToday.subventionnesMois < quotaMois
      ? Math.min(num(parametres?.subvention_jour), prix)
      : 0;
    return { prix, subvention, retenue: Math.max(0, prix - subvention) };
  }, [typeRepas, parametres, employeeToday, todayMenus]);

  const filteredManual = useMemo(() => {
    const needle = manualSearch.trim().toLowerCase();
    if (!needle) return [];
    return employes.filter((employe) => (
      employe.actif
      && `${employe.prenom} ${employe.nom} ${employe.matricule} ${employe.service ?? ''}`.toLowerCase().includes(needle)
    )).slice(0, 8);
  }, [employes, manualSearch]);

  const filteredOrders = useMemo(() => {
    const needle = orderSearch.trim().toLowerCase();
    if (!needle) return todayRepas;
    return todayRepas.filter((repasRow) => {
      const employe = employes.find((item) => item.id === repasRow.employe_id);
      return `${employeeName(employe)} ${employe?.matricule ?? ''} ${repasRow.reference ?? ''}`.toLowerCase().includes(needle);
    });
  }, [todayRepas, orderSearch, employes]);

  const todayStats = useMemo(() => ({
    repas: todayValid.length,
    participants: new Set(todayValid.map((row) => row.employe_id)).size,
    standard: todayValid.filter((row) => row.type_repas === 'standard').length,
    premium: todayValid.filter((row) => row.type_repas === 'premium').length,
    subventions: todayValid.reduce((sum, row) => sum + num(row.subvention_appliquee), 0),
    retenues: todayValid.reduce((sum, row) => sum + num(row.retenue_salaire), 0),
    chiffreAffaires: todayValid.reduce((sum, row) => sum + num(row.prix), 0),
  }), [todayValid]);

  const findEmployee = (value?: string) => {
    const token = (value ?? qrInput).trim();
    if (!token) return;
    const found = employes.find((employe) => employe.qr_token === token)
      ?? employes.find((employe) => employe.matricule.toLowerCase() === token.toLowerCase());
    setValidationResult(null);
    if (!found) {
      setSelected(null);
      setValidationError(`Aucun employé ne correspond à « ${token} ».`);
      return;
    }
    if (!found.actif) {
      setSelected(found);
      setValidationError('Ce compte employé est désactivé. Contactez la RH.');
      return;
    }
    setSelected(found);
    setValidationError(null);
  };

  const startScan = async () => {
    if (scanning || scannerStartedRef.current) return;
    setValidationError(null);
    setScanning(true);
    try {
      const scanner = new Html5Qrcode('dangote-scanner');
      scannerRef.current = scanner;
      scannerStartedRef.current = true;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        (text) => {
          setQrInput(text);
          findEmployee(text);
          void stopScan();
        },
        () => undefined,
      );
    } catch {
      scannerStartedRef.current = false;
      scannerRef.current = null;
      setScanning(false);
      setValidationError('Caméra indisponible. Saisissez le QR ou le matricule manuellement.');
    }
  };

  const stopScan = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner && scannerStartedRef.current) {
      scannerStartedRef.current = false;
      await scanner.stop().catch(() => undefined);
    }
    setScanning(false);
  };

  const validateMeal = async () => {
    if (!selected) return;
    if (selected.actif === false) {
      setValidationError('Employé désactivé.');
      return;
    }
    setValidating(true);
    setValidationError(null);
    setValidationResult(null);
    try {
      const menu = todayMenus.find((item) => item.type_repas === typeRepas);
      const result = await dangoteApi<DangoteApiResponse>('meal.validate', {
        entiteId,
        employeId: selected.id,
        typeRepas,
        menuId: menu?.id ?? undefined,
        quantite: 1,
        source: 'qr',
      });
      setValidationResult(result);
      toast.success(`Repas validé pour ${employeeName(selected)}.`);
      await load(true);
    } catch (err) {
      const apiError = err as Error & { payload?: DangoteApiResponse };
      setValidationError(apiError.payload?.message ?? apiError.message);
    } finally {
      setValidating(false);
    }
  };

  const resetValidation = () => {
    setSelected(null);
    setQrInput('');
    setManualSearch('');
    setValidationError(null);
    setValidationResult(null);
    setTypeRepas('standard');
  };

  const cancelMeal = async (repasRow: DangoteRepas) => {
    const motif = window.prompt('Motif d’annulation (facultatif) :', 'Erreur de saisie');
    if (motif === null) return;
    setCancelling(repasRow.id);
    try {
      await dangoteApi('meal.cancel', { entiteId, repasId: repasRow.id, motif });
      toast.success('Repas annulé et budget recrédité.');
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCancelling(null);
    }
  };

  const exportToday = () => {
    const lines: string[][] = [
      ['Date', 'Heure', 'Matricule', 'Employé', 'Type', 'Prix', 'Subvention', 'Retenue', 'Statut', 'Référence'],
    ];
    for (const row of todayRepas) {
      const employe = employes.find((item) => item.id === row.employe_id);
      lines.push([
        row.date_jour,
        formatTimeFr(row.created_at),
        employe?.matricule ?? '',
        employeeName(employe),
        row.type_repas,
        String(row.prix),
        String(row.subvention_appliquee),
        String(row.retenue_salaire),
        statutRepasLabel(row.statut),
        row.reference ?? '',
      ]);
    }
    downloadCsv(`dangote-commandes-${today}.csv`, lines);
  };

  if (!allowed) {
    return <div className="p-8 font-bold text-red-600">Accès réservé au Superviseur MIAM’S.</div>;
  }

  if (loading && !dashboard) {
    return <div className="p-4 lg:p-8"><LoadingState label="Chargement de l’espace Superviseur…" /></div>;
  }

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <DangotePageHeader
        eyebrow="Comptoir MIAM'S"
        title="Espace Superviseur"
        description="Scannez les QR, validez les repas et suivez le service du jour."
        icon={<UtensilsCrossed className="h-5 w-5" />}
        actions={
          <button className={secondaryButtonClass} onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualiser
          </button>
        }
      />

      <SchemaBanner message={error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Repas aujourd’hui" value={todayStats.repas} hint={`${todayStats.participants} participant(s)`} tone="green" icon={<UtensilsCrossed className="h-5 w-5" />} />
        <StatCard label="Subventions du jour" value={formatMoney(todayStats.subventions, devise)} tone="blue" icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Retenues du jour" value={formatMoney(todayStats.retenues, devise)} tone="amber" icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Budget disponible" value={formatMoney(budgetSolde, devise)} tone={budgetSolde > 0 ? 'default' : 'red'} icon={<Wallet className="h-5 w-5" />} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="validation" className="gap-1.5"><ScanLine className="h-4 w-4" /> Validation</TabsTrigger>
          <TabsTrigger value="commandes" className="gap-1.5"><UtensilsCrossed className="h-4 w-4" /> Commandes du jour</TabsTrigger>
          <TabsTrigger value="employes" className="gap-1.5"><Users className="h-4 w-4" /> Employés</TabsTrigger>
          <TabsTrigger value="rapports" className="gap-1.5"><CalendarDays className="h-4 w-4" /> Rapports</TabsTrigger>
        </TabsList>

        <TabsContent value="validation" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel title="Scanner un QR" description="Caméra ou saisie manuelle du QR / matricule.">
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className={inputClass}
                    value={qrInput}
                    onChange={(event) => setQrInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') findEmployee(); }}
                    placeholder="QR token ou matricule"
                  />
                  <button className={primaryButtonClass} onClick={() => findEmployee()}>
                    <Search className="h-4 w-4" /> Chercher
                  </button>
                  <button className={scanning ? dangerButtonClass : secondaryButtonClass} onClick={() => void (scanning ? stopScan() : startScan())}>
                    {scanning ? <StopCircle className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                    {scanning ? 'Arrêter' : 'Scanner'}
                  </button>
                </div>

                <div id="dangote-scanner" className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl" />

                {!scanning ? (
                  <p className="text-xs text-slate-500">
                    Astuce : le QR est lisible depuis la galerie RH ou depuis le téléphone de l’employé. Le matricule fonctionne aussi.
                  </p>
                ) : null}

                <div className="rounded-2xl border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Sélection manuelle</p>
                  <input
                    className={inputClass}
                    value={manualSearch}
                    onChange={(event) => setManualSearch(event.target.value)}
                    placeholder="Nom, matricule ou service…"
                  />
                  {filteredManual.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {filteredManual.map((employe) => (
                        <button
                          key={employe.id}
                          className="flex w-full items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => {
                            setSelected(employe);
                            setQrInput(employe.qr_token);
                            setValidationError(null);
                            setValidationResult(null);
                          }}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-black text-green-800">
                            {employeeInitials(employe)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-800">{employeeName(employe)}</span>
                            <span className="block text-xs text-slate-500">{employe.matricule} · {employe.service ?? '—'}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </Panel>

            <Panel title="Valider le repas" description="Le serveur applique les quotas, plafonds et le budget.">
              {!selected ? (
                <EmptyState title="Aucun employé sélectionné" description="Scannez un QR ou choisissez un employé pour afficher sa situation." icon={<QrCode className="h-8 w-8" />} />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-sm font-black text-green-800">
                        {employeeInitials(selected)}
                      </span>
                      <div>
                        <p className="font-black text-slate-900">{employeeName(selected)}</p>
                        <p className="text-xs text-slate-500">{selected.matricule} · {selected.service ?? 'Sans service'} · {selected.poste ?? '—'}</p>
                      </div>
                    </div>
                    <StatusBadge tone={selected.actif ? 'green' : 'red'}>{selected.actif ? 'Actif' : 'Désactivé'}</StatusBadge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-100 p-2">
                      <p className="text-slate-500">Repas aujourd’hui</p>
                      <p className="text-lg font-black text-slate-900">{employeeToday.repas}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 p-2">
                      <p className="text-slate-500">Repas ce mois</p>
                      <p className="text-lg font-black text-slate-900">{employeeToday.mois}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 p-2">
                      <p className="text-slate-500">Dépense du jour</p>
                      <p className="text-sm font-black text-slate-900">{formatMoney(employeeToday.depense, devise)}</p>
                      <p className="text-[11px] text-slate-400">Plafond : {selected.plafond_journalier != null ? formatMoney(selected.plafond_journalier, devise) : 'libre'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 p-2">
                      <p className="text-slate-500">Dépense du mois</p>
                      <p className="text-sm font-black text-slate-900">{formatMoney(employeeToday.depenseMois, devise)}</p>
                      <p className="text-[11px] text-slate-400">Plafond : {selected.plafond_mensuel != null ? formatMoney(selected.plafond_mensuel, devise) : 'libre'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(['standard', 'premium'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setTypeRepas(type)}
                        className={`rounded-xl border px-3 py-3 text-left transition ${
                          typeRepas === type ? 'border-green-700 bg-green-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">{type}</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatMoney(priceFor(type), devise)}</p>
                        <p className="text-[11px] text-slate-500">
                          {todayMenus.find((menu) => menu.type_repas === type)?.titre ?? 'Prix paramètres'}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-green-900">Prix</span>
                      <span className="font-bold text-green-900">{formatMoney(estimate.prix, devise)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-green-800">Subvention estimée</span>
                      <span className="font-bold text-green-800">−{formatMoney(estimate.subvention, devise)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-green-200 pt-1">
                      <span className="font-bold text-green-900">Retenue estimée</span>
                      <span className="font-black text-green-900">{formatMoney(estimate.retenue, devise)}</span>
                    </div>
                  </div>

                  {validationError ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{validationError}</p>
                    </div>
                  ) : null}

                  {validationResult ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center gap-2 text-emerald-900">
                        <CheckCircle2 className="h-5 w-5" />
                        <p className="font-black">Repas validé</p>
                      </div>
                      <p className="mt-1 text-sm text-emerald-800">
                        {validationResult.prenom} {validationResult.nom} — {validationResult.type_repas}. Retenue : {formatMoney(num(validationResult.retenue), devise)}.
                      </p>
                      <p className="text-xs text-emerald-700">
                        Solde budget après opération : {formatMoney(num(validationResult.solde_apres), devise)}.
                      </p>
                      <button className={`${secondaryButtonClass} mt-3`} onClick={resetValidation}>
                        <QrCode className="h-4 w-4" /> Nouveau scan
                      </button>
                    </div>
                  ) : (
                    <button className={`${primaryButtonClass} w-full`} disabled={validating || !selected.actif} onClick={() => void validateMeal()}>
                      {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {validating ? 'Validation…' : 'Valider le repas'}
                    </button>
                  )}

                  {validationResult ? null : (
                    <button className={secondaryButtonClass} onClick={resetValidation}>
                      Annuler la sélection
                    </button>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="commandes" className="space-y-4">
          <Panel
            title={`Commandes du jour (${todayRepas.length})`}
            description={formatDateFr(today)}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${inputClass} sm:w-64`} value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Rechercher un employé, un matricule…" />
                <button className={secondaryButtonClass} onClick={exportToday}><Download className="h-4 w-4" /> Export CSV</button>
              </div>
            }
          >
            {filteredOrders.length === 0 ? (
              <EmptyState title="Aucune commande aujourd’hui" description="Les repas validés au comptoir apparaîtront ici." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Heure</th>
                      <th className="px-3 py-2">Employé</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Prix</th>
                      <th className="px-3 py-2">Subvention</th>
                      <th className="px-3 py-2">Retenue</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((row) => {
                      const employe = employes.find((item) => item.id === row.employe_id);
                      return (
                        <tr key={row.id} className={`border-t border-slate-100 ${row.statut === 'annule' ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-2 text-slate-600">{formatTimeFr(row.created_at)}</td>
                          <td className="px-3 py-2">
                            <p className="font-bold text-slate-800">{employeeName(employe)}</p>
                            <p className="text-xs text-slate-500">{employe?.matricule ?? '—'}</p>
                          </td>
                          <td className="px-3 py-2"><StatusBadge tone={row.type_repas === 'premium' ? 'amber' : 'green'}>{row.type_repas}</StatusBadge></td>
                          <td className="px-3 py-2 font-bold">{formatMoney(row.prix, devise)}</td>
                          <td className="px-3 py-2">{formatMoney(row.subvention_appliquee, devise)}</td>
                          <td className="px-3 py-2">{formatMoney(row.retenue_salaire, devise)}</td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={row.statut === 'valide' ? 'green' : 'red'}>{statutRepasLabel(row.statut)}</StatusBadge>
                            {row.motif_annulation ? <span className="mt-1 block max-w-[160px] truncate text-[11px] text-slate-400">{row.motif_annulation}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.statut === 'valide' ? (
                              <button className={dangerButtonClass} disabled={cancelling === row.id} onClick={() => void cancelMeal(row)}>
                                {cancelling === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                Annuler
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">{row.annule_par ? `par ${row.annule_par}` : '—'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="employes" className="space-y-4">
          <Panel title={`Employés (${employes.length})`} description="Situation du jour et historique de consommation.">
            <div className="mb-3 max-w-sm">
              <input
                className={inputClass}
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Rechercher un employé…"
              />
            </div>
            {employes.length === 0 ? (
              <EmptyState title="Aucun employé" description="La RH doit ajouter les employés Dangote." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Employé</th>
                      <th className="px-3 py-2">Service</th>
                      <th className="px-3 py-2">Aujourd’hui</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employes
                      .filter((employe) => {
                        const needle = orderSearch.trim().toLowerCase();
                        if (!needle) return true;
                        return `${employe.prenom} ${employe.nom} ${employe.matricule} ${employe.service ?? ''}`.toLowerCase().includes(needle);
                      })
                      .map((employe) => {
                        const mine = todayValid.filter((row) => row.employe_id === employe.id);
                        return (
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
                            <td className="px-3 py-2 text-slate-600">{employe.service ?? '—'}</td>
                            <td className="px-3 py-2">
                              {mine.length > 0 ? (
                                <StatusBadge tone="green">{mine.length} repas</StatusBadge>
                              ) : (
                                <StatusBadge tone="slate">Pas encore servi</StatusBadge>
                              )}
                            </td>
                            <td className="px-3 py-2"><StatusBadge tone={employe.actif ? 'green' : 'red'}>{employe.actif ? 'Actif' : 'Désactivé'}</StatusBadge></td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <button className={secondaryButtonClass} onClick={() => setHistoryEmployee(employe)}>
                                  <History className="h-4 w-4" /> Historique
                                </button>
                                <button className={secondaryButtonClass} onClick={() => setQrEmployee(employe)}>
                                  <QrCode className="h-4 w-4" /> QR
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="rapports" className="space-y-4">
          <Panel
            title="Rapport du jour"
            description={formatDateFr(today)}
            actions={<button className={secondaryButtonClass} onClick={exportToday}><Download className="h-4 w-4" /> Export CSV</button>}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Repas validés" value={todayStats.repas} hint={`${todayStats.standard} standard · ${todayStats.premium} premium`} />
              <StatCard label="Participants" value={todayStats.participants} hint={`${employes.filter((employe) => employe.actif).length} actifs`} />
              <StatCard label="Chiffre d’affaires" value={formatMoney(todayStats.chiffreAffaires, devise)} tone="blue" />
              <StatCard label="Subventions" value={formatMoney(todayStats.subventions, devise)} tone="green" />
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Consommation par service (mois)">
              {(dashboard?.stats?.par_service ?? []).length === 0 ? (
                <EmptyState title="Aucune donnée sur le mois" />
              ) : (
                <div className="space-y-2">
                  {(dashboard?.stats?.par_service ?? []).map((row) => (
                    <div key={row.service} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                      <span className="font-bold text-slate-700">{row.service}</span>
                      <span className="text-sm text-slate-500">{row.repas} repas · {formatMoney(row.retenues, devise)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Derniers jours">
              {(dashboard?.stats?.par_jour ?? []).length === 0 ? (
                <EmptyState title="Aucune donnée sur le mois" />
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
                      {[...(dashboard?.stats?.par_jour ?? [])].reverse().slice(0, 10).map((row) => (
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

          <Panel title="Menus du jour" description="Prix appliqués au comptoir.">
            {todayMenus.length === 0 ? (
              <EmptyState title="Aucun menu publié aujourd’hui" description="Les prix des paramètres sont utilisés par défaut." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {todayMenus.map((menu) => (
                  <div key={menu.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black text-slate-900">{menu.titre}</p>
                      <StatusBadge tone={menu.type_repas === 'premium' ? 'amber' : 'green'}>{menu.type_repas}</StatusBadge>
                    </div>
                    <p className="mt-1 text-sm font-bold text-green-800">{formatMoney(menu.prix, devise)}</p>
                    {menu.description ? <p className="mt-1 text-xs text-slate-500">{menu.description}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(historyEmployee)} onOpenChange={(open) => { if (!open) setHistoryEmployee(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historique de {employeeName(historyEmployee)}</DialogTitle>
            <DialogDescription>{historyEmployee?.matricule} · {historyEmployee?.service ?? 'Sans service'}</DialogDescription>
          </DialogHeader>
          {(() => {
            const rows = historyEmployee ? repas.filter((row) => row.employe_id === historyEmployee.id) : [];
            if (rows.length === 0) return <EmptyState title="Aucun repas enregistré" />;
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Prix</th>
                      <th className="px-3 py-2">Subvention</th>
                      <th className="px-3 py-2">Retenue</th>
                      <th className="px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{formatDateFr(row.date_jour)}<span className="block text-xs text-slate-400">{formatTimeFr(row.created_at)}</span></td>
                        <td className="px-3 py-2">{row.type_repas}</td>
                        <td className="px-3 py-2">{formatMoney(row.prix, devise)}</td>
                        <td className="px-3 py-2">{formatMoney(row.subvention_appliquee, devise)}</td>
                        <td className="px-3 py-2">{formatMoney(row.retenue_salaire, devise)}</td>
                        <td className="px-3 py-2"><StatusBadge tone={row.statut === 'valide' ? 'green' : 'red'}>{statutRepasLabel(row.statut)}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(qrEmployee)} onOpenChange={(open) => { if (!open) setQrEmployee(null); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR de {employeeName(qrEmployee)}</DialogTitle>
            <DialogDescription>{qrEmployee?.matricule}</DialogDescription>
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

export default DangoteSuperviseurPage;
