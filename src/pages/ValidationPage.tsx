import { useEffect, useMemo, useRef, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { CheckCircle, XCircle, ScanLine, Camera, ImagePlus, Square, Search, UtensilsCrossed } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { pickBackCameraId, isSecureScanContext, friendlyScanError, scanErrorName } from '@/lib/qrScan';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Validation des repas — pensée pour le service d'une cantine scolaire.
 * 4 façons de servir, du plus rapide au plus sûr (scan OK tous navigateurs) :
 * 1. Liste des élèves abonnés : 1 clic = 1 repas servi (file du self).
 * 2. Scan caméra live du badge QR (moteur ZXing intégré : Chrome, Edge, Firefox, Safari…).
 * 3. Photo du badge décodée en local (marche PARTOUT, même en HTTP non sécurisé).
 * 4. Saisie manuelle du code.
 * Contrôles auto : abonnement actif, date valide, repas restants, anti-double (1/jour/QR).
 */
const READER_ID = 'o-resto-qr-reader';
const PHOTO_READER_ID = 'o-resto-qr-photo';
const ValidationPage = () => {
  const { establishments, subscriptions, formulas, validateMeal, validations, children: kids, walletOf } = useResto();
  const [token, setToken] = useState('');
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? '');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const estabRef = useRef(establishmentId);
  estabRef.current = establishmentId;

  const today = useMemo(
    () => validations.filter((v) => sameDay(new Date(v.validatedAt), new Date())),
    [validations],
  );
  const servedToday = today.filter((v) => v.status === 'accepted').length;

  // Élèves avec abonnement actif (file du self), filtrables par nom
  const activeSubs = useMemo(
    () => subscriptions.filter((s) => s.status === 'active' && new Date(s.endDate).getTime() >= Date.now()),
    [subscriptions],
  );
  const servedClientsToday = useMemo(
    () => {
      const counts = new Map<string, number>();
      for (const v of today) {
        if (v.status !== 'accepted') continue;
        // Clé par enfant si validation liée, sinon par compte (évite de fusionner frères/sœurs)
        const key = v.childId ? `child:${v.childId}` : `user:${v.clientUsername}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    },
    [today],
  );
  const servedCountForSub = (s: { childId?: string; clientUsername: string }) =>
    servedClientsToday.get(s.childId ? `child:${s.childId}` : `user:${s.clientUsername}`) ?? 0;
  const classes = useMemo(
    () => Array.from(new Set(kids.map((k) => k.className))).sort(),
    [kids],
  );
  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? activeSubs.filter((s) => s.clientUsername.toLowerCase().includes(q) || s.qrToken.toLowerCase().includes(q))
      : activeSubs;
    return [...list].sort((a, b) => a.clientUsername.localeCompare(b.clientUsername));
  }, [activeSubs, search]);
  const filteredKids = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kids
      .filter((k) => (!classFilter || k.className === classFilter))
      .filter((k) => !q || `${k.firstName} ${k.lastName} ${k.className}`.toLowerCase().includes(q) || k.qrToken.toLowerCase().includes(q))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [kids, search, classFilter]);

  const formulaName = (formulaId: string) => formulas.find((f) => f.id === formulaId)?.name ?? '—';

  const runValidation = (code: string) => {
    if (!code.trim() || !estabRef.current) return;
    const r = validateMeal(code, estabRef.current);
    setResult({ ok: r.ok, message: r.message });
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await scanner.stop();
        }
      } catch {
        /* déjà arrêté */
      }
      try {
        await scanner.clear();
      } catch {
        /* ignore */
      }
    }
  };

  const stopScan = () => {
    void stopScanner();
    setScanning(false);
  };

  // Arrêt caméra à la sortie de la page
  useEffect(() => () => {
    void stopScanner();
  }, []);

  // Démarrage du scan live dès que le lecteur est affiché.
  // html5-qrcode embarque ZXing → tous navigateurs ; détecteur natif utilisé
  // en priorité quand le navigateur le propose.
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      try {
        const scanner = new Html5Qrcode(READER_ID, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        });
        scannerRef.current = scanner;
        let cameraConfig: Parameters<Html5Qrcode['start']>[0] = { facingMode: 'environment' };
        try {
          const cameras = await Html5Qrcode.getCameras();
          const backId = pickBackCameraId(cameras.map((c) => ({ id: c.id, label: c.label })));
          if (backId) cameraConfig = { deviceId: { exact: backId } };
        } catch {
          /* repli : facingMode environment */
        }
        await scanner.start(
          cameraConfig,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            if (cancelled) return;
            const code = text.trim();
            setToken(code);
            void stopScanner();
            setScanning(false);
            runValidation(code);
          },
          () => undefined,
        );
        if (cancelled) await stopScanner();
      } catch (err) {
        if (cancelled) return;
        await stopScanner();
        setScanning(false);
        const secure = typeof window !== 'undefined'
          ? isSecureScanContext(window.location.hostname, window.location.protocol)
          : true;
        setScanError(friendlyScanError(scanErrorName(err), secure));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const startScan = () => {
    setScanError('');
    setResult(null);
    setScanning(true);
  };

  // Repli universel : photo du badge décodée en local (aucune API caméra requise,
  // marche dans tous les navigateurs, même en HTTP non sécurisé).
  const handlePhotoScan = async (file: File) => {
    setScanError('');
    setResult(null);
    const reader = new Html5Qrcode(PHOTO_READER_ID, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
    try {
      const text = await reader.scanFile(file, false);
      const code = text.trim();
      setToken(code);
      runValidation(code);
    } catch {
      setScanError('QR illisible sur cette photo : rapprochez le badge, évitez flou et reflets, ou saisissez le code manuellement.');
    } finally {
      try {
        await reader.clear();
      } catch {
        /* ignore */
      }
    }
  };

  const handleValidate = (e: React.FormEvent) => {
    e.preventDefault();
    runValidation(token);
    setToken('');
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ScanLine className="w-6 h-6 text-orange-500" /> Service du midi — validation des repas</h1>
          <p className="text-slate-500 text-sm">Servez depuis la liste des élèves, scannez le badge ou saisissez le code. Contrôle automatique.</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-green-100 text-green-800 rounded-2xl px-4 py-2 text-center">
            <p className="text-2xl font-black leading-none">{servedToday}</p>
            <p className="text-[11px] font-bold">repas servis</p>
          </div>
          <div className="bg-green-100 text-green-800 rounded-2xl px-4 py-2 text-center">
            <p className="text-2xl font-black leading-none">{activeSubs.length}</p>
            <p className="text-[11px] font-bold">abonnés actifs</p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-700">Cantine (lieu du service)</label>
        <select value={establishmentId} onChange={(e) => setEstablishmentId(e.target.value)} className="mt-1 w-full md:max-w-md px-4 py-3 rounded-xl border-2 border-slate-200 bg-white outline-none focus:border-orange-500">
          {establishments.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {result && (
        <div className={`rounded-2xl p-4 flex gap-2 text-sm font-medium sticky top-2 z-10 shadow-lg ${result.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {result.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
          {result.message}
        </div>
      )}

      {/* 1. Liste des élèves — le plus rapide au self */}
      <div className="bg-white rounded-2xl border shadow overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <p className="font-bold text-slate-800 flex items-center gap-2"><UtensilsCrossed className="w-5 h-5 text-green-700" /> Élèves abonnés ({filteredSubs.length})</p>
          <div className="relative flex-1 min-w-[200px]">
            <Search aria-hidden className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <label htmlFor="search-eleve" className="sr-only">Rechercher un élève</label>
            <input id="search-eleve" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un élève…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700" />
          </div>
          {classes.length > 0 && (
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-green-600">
              <option value="">Toutes classes</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        {filteredSubs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Aucun élève abonné{search ? ' pour cette recherche' : ''}.</p>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {filteredSubs.map((s) => {
              const maxPerDay = 1;
              const served = servedCountForSub(s);
              const already = served >= maxPerDay;
              return (
                <li key={s.id} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-emerald-700 text-white font-black flex items-center justify-center flex-shrink-0">
                    {s.clientUsername.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 capitalize truncate">{s.clientUsername}</p>
                    <p className="text-xs text-slate-500">{formulaName(s.formulaId)} • {s.mealsRemaining} repas restants</p>
                  </div>
                  {already ? (
                    <span className="px-3 py-2 rounded-xl text-xs font-bold bg-green-100 text-green-800 flex items-center gap-1"><CheckCircle aria-hidden className="w-3.5 h-3.5" /> Servi</span>
                  ) : (
                    <button onClick={() => runValidation(s.qrToken)} disabled={s.mealsRemaining <= 0} aria-label={`Servir ${s.clientUsername}`} className="px-4 py-2 rounded-xl text-sm font-bold bg-green-700 text-white hover:bg-green-800 disabled:opacity-40">
                      Servir
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 1b. QR Cartes enfants (recharge prépayée), filtrables par classe */}
      {filteredKids.length > 0 && (
        <div className="bg-white rounded-2xl border shadow overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <p className="font-bold text-slate-800">QR Cartes enfants ({filteredKids.length}) — solde = carte bancaire</p>
          </div>
          <ul className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
            {filteredKids.map((k) => {
              const served = servedClientsToday.get(`child:${k.id}`) ?? 0;
              return (
              <li key={k.id} className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-700 to-emerald-600 text-white font-black flex items-center justify-center flex-shrink-0">
                  {k.firstName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 capitalize truncate">{k.firstName} {k.lastName} <span className="font-normal text-slate-400">• {k.className}</span></p>
                  <p className="text-xs text-slate-500">Solde : <strong>{walletOf(k.id)} FCFA</strong> • {k.qrToken} • servis : {served}</p>
                </div>
                <button onClick={() => runValidation(k.qrToken)} className="px-4 py-2 rounded-xl text-sm font-bold bg-green-700 text-white hover:bg-green-800">
                  Servir
                </button>
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 2, 3 & 4. Scan live + photo + saisie */}
      <div className="bg-white rounded-2xl border shadow p-5 space-y-4">
        <p className="font-bold text-slate-800">Badge QR, photo ou code manuel</p>
        <div className="grid grid-cols-2 gap-2">
          {!scanning ? (
            <button
              type="button"
              onClick={startScan}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-orange-500 text-white hover:bg-orange-600"
            >
              <Camera className="w-4 h-4" /> Scanner caméra
            </button>
          ) : (
            <button
              type="button"
              onClick={stopScan}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-slate-800 text-white"
            >
              <Square className="w-4 h-4" /> Arrêter
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-slate-900 text-white hover:bg-slate-700"
          >
            <ImagePlus className="w-4 h-4" /> Photo du badge
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Photo du badge QR à décoder"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handlePhotoScan(file);
          }}
        />

        {scanning && (
          <div>
            <div id={READER_ID} className="rounded-2xl overflow-hidden border-2 border-orange-400 bg-black" />
            <p className="text-center text-xs text-slate-500 py-2">Présentez le badge de l’élève devant la caméra…</p>
          </div>
        )}
        {scanError && (
          <div className="rounded-xl p-4 flex gap-2 text-sm font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <XCircle className="w-5 h-5 flex-shrink-0" /> {scanError}
          </div>
        )}
        {/* Lecteur caché pour le décodage des photos (aucune caméra requise) */}
        <div id={PHOTO_READER_ID} className="hidden" aria-hidden="true" />

        <p className="text-xs font-bold text-slate-500">Saisie manuelle du code</p>
        <form onSubmit={handleValidate} className="flex gap-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Code élève (ex : ORESTO-XXXXXX)" className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 font-mono uppercase outline-none focus:border-orange-500" />
          <button type="submit" className="px-5 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold rounded-xl">
            Valider
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <p className="p-4 font-bold text-slate-800">Passages du jour ({today.length})</p>
        {today.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-500">Aucun passage aujourd’hui.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left p-3">Heure</th><th className="text-left p-3">Élève</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Motif</th></tr>
            </thead>
            <tbody>
              {today.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="p-3">{new Date(v.validatedAt).toLocaleTimeString('fr-FR')}</td>
                  <td className="p-3 font-semibold capitalize">{v.clientUsername}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${v.status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{v.status === 'accepted' ? 'Servi' : 'Refusé'}</span></td>
                  <td className="p-3 text-slate-500">{v.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ValidationPage;
