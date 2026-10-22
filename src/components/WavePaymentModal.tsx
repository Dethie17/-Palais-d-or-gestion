import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Smartphone, Copy, Check, Timer, ShieldCheck, QrCode, ExternalLink, Loader2, RefreshCw, AlertCircle, CreditCard } from 'lucide-react';
import type { WavePaymentRequest } from '@/lib/wave';
import { isValidSnPhone } from '@/lib/wave';
import type { PaymentChallenge } from '@/lib/payments/types';
import { appLaunchUrl } from '@/lib/payments';

interface Props {
  wave: WavePaymentRequest;
  initialPhone?: string;
  error?: string | null;
  confirming: boolean;
  /** Mode démo : le code saisi solde le paiement. */
  onConfirm: (code: string) => void;
  /**
   * Fournisseur réel : la transaction a été réglée et l'état local rechargé.
   * L'écran se ferme tout seul — aucun code à saisir.
   */
  onPaid?: () => void;
  /** Rattrapage : interroge le prestataire sur la référence. */
  onSync?: (reference: string) => Promise<{ status: string; error?: string | null; expired?: boolean; retryable?: boolean }>;
  onClose: () => void;
}

function useCountdown(expiresAt: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  return { left, label: `${mm}:${ss}` };
}

/** Delai avant l'envoi automatique vers l'application de paiement (ms). */
export const AUTO_REDIRECT_DELAY_MS = 3000;

/**
 * Nom de l'application vers laquelle on envoie le client, pour l'afficher
 * dans le bandeau (« Redirection vers Wave dans 3 s… »).
 */
function autoTargetLabel(challenge: PaymentChallenge | undefined, methodLabel: string): string {
  if (challenge?.kind === 'qr') return "l'application Orange Money / Max it";
  return methodLabel;
}

/** Lien d'initiation affiché tel quel — jamais généré par nous. */
function useQrDataUrl(qrBase64: string | undefined): string | null {
  return useMemo(() => (qrBase64 ? `data:image/png;base64,${qrBase64}` : null), [qrBase64]);
}

/**
 * Écran de paiement mobile.
 *
 * Deux modes, une seule fenêtre :
 *   - fournisseur réel (SycaPay) : lien, QR, page carte ou invite poussée,
 *     puis un écran d'attente qui interroge le prestataire tant que rien
 *     n'est arrivé. Le client ne tape aucun code et ne décide de rien.
 *   - démonstration : le code à 6 chiffres d'avant, qui ne solde rien.
 *
 * La règle qui gouverne l'écran : le retour du client sur l'adresse de
 * retour n'est pas un résultat de paiement. Seul le webhook compte, donc
 * ici on attend.
 */
const PaymentModal = ({ wave, initialPhone, error, confirming, onConfirm, onPaid, onSync, onClose }: Props) => {
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const { left, label } = useCountdown(wave.expiresAt);
  const qrSrc = useQrDataUrl(wave.challenge?.kind === 'qr' ? wave.challenge.qrCode : undefined);
  // Seul le fournisseur décide. Un code qui traînerait dans la session ne
  // fait plus passer un paiement réel pour une démonstration.
  const isDemo = wave.provider === 'demo';
  const phoneValid = isValidSnPhone(phone);
  const codeValid = /^\d{6}$/.test(code.trim());

  // Sur un telephone, un QR ne sert a rien : c'est l'application qu'il faut
  // ouvrir. Wave, lui, se paie toujours sur sa page de paiement.
  const touchDevice =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(pointer: coarse)').matches);

  // Adresse vers laquelle on emmene le client sans lui faire cliquer une
  // seconde fois : la page Wave, la page carte, ou l'application Orange
  // Money (liens profonds) quand il est sur son telephone.
  const autoUrl = useMemo(
    () => (isDemo ? null : appLaunchUrl(wave.challenge, touchDevice)),
    [isDemo, touchDevice, wave.challenge],
  );

  // Filet de sécurité : si le client ferme l'onglet juste après avoir payé,
  // l'écran d'attente de la page de retour reprend la main.
  const paidRef = useRef(onPaid);
  paidRef.current = onPaid;

  /**
   * Envoi automatique vers l'application de paiement (Wave, Max it…).
   *
   * Le parent n'a plus à chercher un bouton : 3 secondes après l'ouverture,
   * on le dépose directement dans son application pour valider. Navigation
   * dans le même onglet (pas window.open) : aucun bloqueur de popups ne peut
   * l'empêcher, et l'opérateur le ramène ici via l'adresse de retour.
   * « Rester ici » annule l'envoi (le parent paie depuis un autre appareil).
   */
  const [autoCancelled, setAutoCancelled] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const autoFiredRef = useRef<string | null>(null);
  useEffect(() => {
    setAutoCancelled(false);
    setAutoLeft(0);
    // Nouvelle demande = nouvel envoi potentiel.
    autoFiredRef.current = null;
  }, [autoUrl, wave.reference]);
  useEffect(() => {
    if (!autoUrl || isDemo || autoCancelled || autoFiredRef.current) return;
    setAutoLeft(AUTO_REDIRECT_DELAY_MS);
    const step = setInterval(() => {
      setAutoLeft((left) => Math.max(0, left - 1000));
    }, 1000);
    const fire = setTimeout(() => {
      autoFiredRef.current = autoUrl;
      clearInterval(step);
      setWaiting(true);
      window.location.href = autoUrl;
    }, AUTO_REDIRECT_DELAY_MS);
    return () => {
      clearInterval(step);
      clearTimeout(fire);
    };
  }, [autoUrl, isDemo, autoCancelled]);
  const autoCountdown = autoLeft > 0 ? Math.ceil(autoLeft / 1000) : 0;

  useEffect(() => {
    if (isDemo || !onSync) return;
    // On ne commence à interroger qu'une fois que le client a eu le temps de
    // payer ; sinon on brûle des appels pour rien.
    const kick = setTimeout(() => setWaiting(true), 4000);
    return () => clearTimeout(kick);
  }, [isDemo, onSync]);

  useEffect(() => {
    if (!waiting || !onSync) return;
    let alive = true;
    const tick = async () => {
      try {
        const status = await onSync(wave.reference);
        if (!alive) return;
        if (status.status === 'paid') {
          setWaiting(false);
          paidRef.current?.();
          return;
        }
        if (status.status === 'failed' || status.status === 'cancelled') {
          setWaiting(false);
          setSyncError(status.error ?? 'Le paiement n’a pas abouti.');
          if (status.expired) setExpired(true);
        }
      } catch {
        // Panne réseau : on continue d'attendre, le prestataire est la source.
        if (alive) setSyncError('Connexion instable — nous vérifions encore votre paiement.');
      }
    };
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [waiting, onSync, wave.reference]);

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(wave.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  /** Ouvre le lien de paiement / la page carte dans un nouvel onglet. */
  const openExternal = (url: string) => {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) window.location.href = url;
    setWaiting(true);
  };

  return (
    <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg flex items-center gap-2">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </span>
            Payer avec {wave.methodLabel}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl" aria-label="Fermer">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="mt-4 bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Montant à payer</p>
            <p className="text-2xl font-extrabold">{wave.amountLabel}</p>
            <p className="text-xs text-slate-300 mt-1">
              Marchand : <strong>{wave.merchantName}</strong> • {wave.merchantNumber}
              {phone && <span className="block text-slate-400">Depuis : {phone}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
              <Timer className="w-3.5 h-3.5" /> Expire dans
            </p>
            <p className={`text-xl font-black font-mono ${left === 0 ? 'text-red-400' : ''}`}>{label}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between bg-slate-50 border rounded-xl px-3 py-2.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Référence du paiement</p>
            <p className="font-mono font-bold text-sm">{wave.reference}</p>
          </div>
          <button onClick={copyRef} className="p-2 rounded-lg bg-white border hover:bg-slate-100" title="Copier la référence">
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
          </button>
        </div>

        {/* ---------- Mode fournisseur réel ---------- */}
        {autoUrl && !autoCancelled && (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
            <Loader2 className="w-6 h-6 mx-auto text-blue-600 animate-spin" />
            <p className="mt-2 text-sm font-bold text-slate-800">
              Redirection vers {autoTargetLabel(wave.challenge, wave.methodLabel)}
              {autoCountdown > 0 ? ` dans ${autoCountdown} s…` : '…'}
            </p>
            <button
              onClick={() => {
                autoFiredRef.current = autoUrl;
                setWaiting(true);
                window.location.href = autoUrl;
              }}
              className="mt-3 w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
            >
              Ouvrir maintenant
            </button>
            <button
              onClick={() => setAutoCancelled(true)}
              className="mt-2 w-full py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline"
            >
              Rester ici (je paie depuis un autre appareil)
            </button>
            <p className="mt-2 text-[11px] text-slate-500">
              Vous serez déposé dans votre application pour valider. Vous reviendrez ici automatiquement après avoir payé.
            </p>
          </div>
        )}
        {autoUrl && autoCancelled && (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-sm font-bold text-slate-800">
              Envoi automatique annulé
            </p>
            <button
              onClick={() => {
                autoFiredRef.current = autoUrl;
                setWaiting(true);
                window.location.href = autoUrl;
              }}
              className="mt-3 w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
            >
              Ouvrir maintenant
            </button>
            <p className="mt-2 text-[11px] text-slate-500">
              Vérifiez le montant avant de valider dans votre application.
            </p>
          </div>
        )}

        {!isDemo && wave.challenge && (
          <ChallengeBlock challenge={wave.challenge} qrSrc={qrSrc} onOpen={openExternal} touchDevice={touchDevice} />
        )}

        {wave.error && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{wave.error}</span>
          </div>
        )}

        {syncError && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{syncError}{expired ? ' Relancez pour obtenir un nouveau lien.' : ''}</span>
          </div>
        )}

        <ol className="mt-4 space-y-2 text-sm text-slate-600">
          {wave.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {!isDemo && onSync && (
          <label className="block text-sm font-bold text-slate-700 mt-4 mb-1.5">
            Votre numéro {wave.methodLabel} <span className="font-normal text-slate-400">(ex : 77 123 45 67)</span>
          </label>
        )}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="77 123 45 67"
          aria-label="Numéro de téléphone"
          className={`w-full px-4 py-3 rounded-xl border-2 outline-none font-semibold ${phone === '' || phoneValid ? 'border-slate-200 focus:border-blue-500' : 'border-red-300 focus:border-red-400'}`}
        />
        {phone !== '' && !phoneValid && (
          <p className="mt-1 text-xs font-semibold text-red-600">Numéro invalide (format Sénégal : 77, 78, 76, 75, 70…).</p>
        )}

        {/* ---------- Mode démonstration (développement seulement) ---------- */}
        {isDemo && !import.meta.env.PROD && (
          <>
            {wave.demoCode && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <strong>Mode démo :</strong> aucun argent ne circule. Utilisez le code{' '}
                <strong className="font-mono text-sm">{wave.demoCode}</strong> pour valider le parcours de bout en bout.
              </div>
            )}

            <label className="block text-sm font-bold text-slate-700 mt-4 mb-1.5">
              Code de confirmation à 6 chiffres
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="••••••"
              aria-label="Code de confirmation"
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-center text-2xl font-black tracking-[0.4em] focus:border-blue-500 outline-none"
            />
            {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

            <button
              onClick={() => codeValid && !confirming && onConfirm(code)}
              disabled={!codeValid || confirming || left === 0}
              className="mt-4 w-full py-3.5 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {confirming ? 'Vérification…' : `Confirmer le paiement de ${wave.amountLabel}`}
            </button>
          </>
        )}

        {isDemo && import.meta.env.PROD && (
          <p className="mt-4 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Le parcours de démonstration est désactivé sur ce site. Rechargez la page.
          </p>
        )}

        {/* ---------- Écran d'attente ---------- */}
        {!isDemo && (
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-center">
            {waiting ? (
              <>
                <Loader2 className="w-5 h-5 mx-auto text-blue-600 animate-spin" />
                <p className="mt-2 text-sm font-bold text-slate-700">En attente de la confirmation…</p>
                <p className="mt-1 text-xs text-slate-500">
                  Validez la demande sur votre téléphone. Cette page se fermera dès que le paiement sera confirmé.
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  Vous pouvez fermer cette fenêtre : votre carte s’activera quand même.
                </p>
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 mx-auto text-slate-400" />
                <p className="mt-2 text-sm font-bold text-slate-700">Vous n’avez pas encore payé</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ouvrez le lien ci-dessus, validez chez l’opérateur, puis revenez ici.
                </p>
                {onSync && (
                  <button
                    onClick={() => setWaiting(true)}
                    className="mt-3 text-xs font-bold text-blue-700 hover:underline"
                  >
                    J’ai déjà payé — vérifier mon paiement
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <p className="mt-3 text-center text-xs text-slate-400">
          La carte s’active automatiquement après confirmation du paiement.
        </p>
      </div>
    </div>
  );
};

/**
 * Affiche le défi selon sa forme. Le code de service décide de laquelle il
 * s'agit : un lien, un QR, une page hébergée, ou rien du tout quand
 * l'opérateur pousse l'invite sur le téléphone.
 */
/** Noms d'applications tels qu'Orange les publie, rendus lisibles. */
const DEEP_LINK_LABELS: Record<string, string> = {
  MAXIT: 'Max it',
  OM: 'Orange Money',
};

function ChallengeBlock({
  challenge,
  qrSrc,
  onOpen,
  touchDevice,
}: {
  challenge: PaymentChallenge;
  qrSrc: string | null;
  onOpen: (url: string) => void;
  touchDevice: boolean;
}) {
  if (challenge.kind === 'redirect') {
    return (
      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
        <ExternalLink className="w-6 h-6 mx-auto text-blue-600" />
        <p className="mt-2 text-sm font-bold text-slate-800">Page de paiement {challenge.label}</p>
        <button
          onClick={() => onOpen(challenge.url)}
          className="mt-3 w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
        >
          Rouvrir la page de paiement
        </button>
        <p className="mt-2 text-[11px] text-slate-500">
          La page s’est ouverte automatiquement. Vérifiez le montant avant de valider.
        </p>
      </div>
    );
  }

  if (challenge.kind === 'hosted') {
    return (
      <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-center">
        <CreditCard className="w-6 h-6 mx-auto text-indigo-600" />
        <p className="mt-2 text-sm font-bold text-slate-800">Paiement par carte</p>
        <button
          onClick={() => onOpen(challenge.url)}
          className="mt-3 w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700"
        >
          Ouvrir la page de paiement
        </button>
        <p className="mt-2 text-[11px] text-slate-500">
          Saisissez votre carte sur la page sécurisée. Aucun montant n’est débité avant confirmation.
        </p>
      </div>
    );
  }

  if (challenge.kind === 'qr') {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-center">
        <QrCode className="w-6 h-6 mx-auto text-orange-600" />
        {/* Sur telephone, l'application s'ouvre toute seule : le QR est
            inutile, on ne le montre qu'en petit, pour un autre appareil. */}
        <p className="mt-2 text-sm font-bold text-slate-800">
          {touchDevice ? 'Payer avec Orange Money' : 'Scannez pour payer'}
        </p>
        {challenge.deepLinks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            {challenge.deepLinks.map((dl) => (
              <button
                key={dl.app}
                onClick={() => onOpen(dl.url)}
                className={`px-4 py-3 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 ${touchDevice ? 'w-full' : ''}`}
              >
                Ouvrir {DEEP_LINK_LABELS[dl.app.toUpperCase()] ?? dl.app}
              </button>
            ))}
          </div>
        )}
        {qrSrc && (
          <img
            src={qrSrc}
            alt="QR de paiement"
            className={`mx-auto rounded-xl ${touchDevice ? 'mt-3 w-28 h-28 opacity-70' : 'mt-3 w-44 h-44'}`}
          />
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          {touchDevice
            ? "L'application Orange Money s'est ouverte automatiquement. Sinon, utilisez les boutons ci-dessus."
            : "Sur ordinateur : scannez le QR. Sur mobile : l'application s'ouvre automatiquement."}
        </p>
      </div>
    );
  }

  // 'prompt' : l'opérateur pousse l'invite sur le téléphone du client.
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
      <Smartphone className="w-6 h-6 mx-auto text-slate-500" />
      <p className="mt-2 text-sm font-bold text-slate-800">
        {challenge.phone ? `Validez la demande sur le ${challenge.phone}` : 'Validez la demande sur votre téléphone'}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Vous avez reçu une demande de paiement sur votre téléphone. Rien à afficher ici.
      </p>
    </div>
  );
}

export default PaymentModal;