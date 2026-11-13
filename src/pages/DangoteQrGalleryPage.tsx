import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Printer, QrCode, Search, ShieldCheck, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { employeeInitials, employeeName } from '@/lib/dangote';
import type { DangoteEmploye } from '@/types/dangote';
import {
  DangotePageHeader,
  EmptyState,
  inputClass,
  LoadingState,
  Panel,
  primaryButtonClass,
  secondaryButtonClass,
  StatCard,
  StatusBadge,
} from '@/components/dangote/DangoteUI';

const DangoteQrGalleryPage = () => {
  const { user } = useAuth();
  const entiteId = user?.entiteId ?? '';
  const allowed = Boolean(user && (user.role === 'rh' || user.role === 'superviseur-dangote' || user.role === 'admin'));

  const [employes, setEmployes] = useState<DangoteEmploye[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    if (!allowed || !entiteId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('dangote_employes')
        .select('*')
        .eq('entite_id', entiteId)
        .order('nom', { ascending: true });
      if (queryError) setError(queryError.message);
      setEmployes((data as DangoteEmploye[] | null) ?? []);
      setLoading(false);
    })();
  }, [allowed, entiteId]);

  const services = useMemo(
    () => Array.from(new Set(employes.map((employe) => employe.service?.trim()).filter(Boolean) as string[])).sort(),
    [employes],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return employes.filter((employe) => {
      if (!showInactive && !employe.actif) return false;
      if (service && employe.service !== service) return false;
      if (!needle) return true;
      return `${employe.prenom} ${employe.nom} ${employe.matricule} ${employe.service ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [employes, search, service, showInactive]);

  const downloadQr = (employe: DangoteEmploye) => {
    const svg = document.querySelector(`#qr-card-${employe.id} svg`);
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qr-${employe.matricule}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!allowed) {
    return <div className="p-8 font-bold text-red-600">Accès réservé à la RH et au Superviseur MIAM’S.</div>;
  }

  if (loading) {
    return <div className="p-4 lg:p-8"><LoadingState label="Chargement des QR employés…" /></div>;
  }

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <div className="print:hidden">
        <DangotePageHeader
          eyebrow="Badges & QR"
          title="Galerie QR employés"
          description="Recherchez, imprimez ou téléchargez les QR utilisés au comptoir."
          icon={<QrCode className="h-5 w-5" />}
          actions={
            <button className={primaryButtonClass} onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimer la planche
            </button>
          }
        />
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <StatCard label="Employés" value={employes.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Actifs" value={employes.filter((employe) => employe.actif).length} tone="green" icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Services" value={services.length} tone="blue" />
      </div>

      <div className="print:hidden">
        <Panel title="Filtres" description="Affinez la planche avant impression.">
          <div className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, matricule, service…"
              />
            </div>
            <select className={inputClass} value={service} onChange={(event) => setService(event.target.value)}>
              <option value="">Tous les services</option>
              {services.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-green-700"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Inclure les désactivés
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {filtered.length} badge(s) affiché(s). L’impression utilise une grille de 3 colonnes.
          </p>
        </Panel>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Aucun employé à afficher" description={search || service ? 'Modifiez les filtres.' : 'Ajoutez des employés depuis l’espace RH.'} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 print:grid-cols-3 print:gap-3">
          {filtered.map((employe) => (
            <div
              key={employe.id}
              id={`qr-card-${employe.id}`}
              className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:shadow-none"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-xs font-black text-green-800">
                  {employeeInitials(employe)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{employeeName(employe)}</p>
                  <p className="text-xs text-slate-500">{employe.matricule}</p>
                </div>
                <StatusBadge tone={employe.actif ? 'green' : 'red'}>{employe.actif ? 'Actif' : 'Off'}</StatusBadge>
              </div>

              <div className="mt-3 flex justify-center rounded-xl border border-slate-100 bg-white p-2">
                <QRCodeSVG value={employe.qr_token} size={140} />
              </div>

              <p className="mt-2 truncate text-center text-[10px] text-slate-400">{employe.service ?? 'Sans service'}</p>
              <p className="mt-1 break-all text-center font-mono text-[10px] text-slate-500">{employe.qr_token}</p>

              <div className="mt-3 flex justify-center gap-1 print:hidden">
                <button className={secondaryButtonClass} onClick={() => downloadQr(employe)} title="Télécharger le QR">
                  <Download className="h-4 w-4" />
                </button>
                <button className={secondaryButtonClass} onClick={() => window.print()} title="Imprimer">
                  <Printer className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DangoteQrGalleryPage;
