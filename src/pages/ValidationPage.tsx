import { useEffect, useMemo, useRef, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { CheckCircle, XCircle, ScanLine, Camera, Keyboard, Square, Search, UtensilsCrossed } from 'lucide-react';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Validation des repas — pensée pour le service d'une cantine scolaire.
 * 3 façons de servir, du plus rapide au plus sûr :
 * 1. Liste des élèves abonnés : 1 clic = 1 repas servi (file du self).
 * 2. Scan caméra du badge QR.
 * 3. Saisie manuelle du code.
 * Contrôles auto : abonnement actif, date valide, repas restants, anti-double (1/jour/QR).
 */
const ValidationPage = () => {
  const { establishments, subscriptions, formulas, validateMeal, validations } = useResto();
  const [token, setToken] = useState('');
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? '');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [search, setSearch] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
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
  const servedTokensToday = useMemo(
    () => new Set(today.filter((v) => v.status === 'accepted').map((v) => v.qrToken.toUpperCase())),
    [today],
  );
  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? activeSubs.filter((s) => s.clientUsername.toLowerCase().includes(q) || s.qrToken.toLowerCase().includes(q))
      : activeSubs;
    return [...list].sort((a, b) => a.clientUsername.localeCompare(b.clientUsername));
  }, [activeSubs, search]);

  const formulaName = (formulaId: string) => formulas.find((f) => f.id === formulaId)?.name ?? '—';

  const runValidation = (code: string) => {
    if (!code.trim() || !estabRef.current) return;
    const r = validateMeal(code, estabRef.current);
    setResult({ ok: r.ok, message: r.message });
  };

  const stopScan = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Arrêt caméra à la sortie de la page
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Boucle de détection dès que la vidéo est affichée
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    const video = videoRef.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => undefined);
    }
    const Detector = (window as unknown as { BarcodeDetector?: new (o?: object) => { detect(v: HTMLVideoElement): Promise<{ rawValue?: string }[]> } }).BarcodeDetector;
    if (!Detector || !video) return;
    const detector = new Detector({ formats: ['qr_code'] });
    const tick = async () => {
      if (cancelled) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes && codes.length && codes[0].rawValue) {
            const code = codes[0].rawValue.trim();
            setToken(code);
            stopScan();
            runValidation(code);
            return;
          }
        }
      } catch {
        /* ignore et réessaie à la frame suivante */
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // Scan caméra natif (Chrome / Edge) : validation auto dès détection
  const startScan = async () => {
    setScanError('');
    setResult(null);
    const Detector = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    if (typeof Detector === 'undefined') {
      setScanError('Scan caméra non supporté par ce navigateur : utilisez Chrome ou Edge récent, ou servez depuis la liste des élèves.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
    } catch {
      setScanError('Caméra indisponible : autorisez l’accès caméra (connexion HTTPS ou localhost requise), ou servez depuis la liste des élèves.');
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
          <div className="bg-violet-100 text-violet-800 rounded-2xl px-4 py-2 text-center">
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
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un élève…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600" />
          </div>
        </div>
        {filteredSubs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Aucun élève abonné{search ? ' pour cette recherche' : ''}.</p>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {filteredSubs.map((s) => {
              const already = servedTokensToday.has(s.qrToken.toUpperCase());
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
                    <span className="px-3 py-2 rounded-xl text-xs font-bold bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Servi</span>
                  ) : (
                    <button onClick={() => runValidation(s.qrToken)} disabled={s.mealsRemaining <= 0} className="px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40">
                      Servir
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 2 & 3. Scan + saisie */}
      <div className="bg-white rounded-2xl border shadow p-5 space-y-4">
        <p className="font-bold text-slate-800">Badge QR ou code manuel</p>
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
          <div className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-500">
            <Keyboard className="w-4 h-4" /> Saisie manuelle ↓
          </div>
        </div>

        {scanning && (
          <div className="rounded-2xl overflow-hidden border-2 border-orange-400 bg-black">
            <video ref={videoRef} muted playsInline className="w-full max-h-80 object-cover" />
            <p className="text-center text-xs text-white py-2">Présentez le badge de l’élève devant la caméra…</p>
          </div>
        )}
        {scanError && (
          <div className="rounded-xl p-4 flex gap-2 text-sm font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <XCircle className="w-5 h-5 flex-shrink-0" /> {scanError}
          </div>
        )}

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
