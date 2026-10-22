/**
 * Client HTTP de la passerelle SycaPay.
 *
 * Le navigateur ne parle JAMAIS à SycaPay : il parle à /api/sycapay/*, qui
 * détient le certificat client. Rien ici n'est un secret — l'authentification
 * mTLS vit entièrement côté serveur.
 */

import { supabase } from '@/lib/supabase';
import type {
  PaymentProvider,
  PaymentStatus,
  ProviderMethod,
  StartPaymentInput,
  StartPaymentResult,
} from './types';

/** Codes de service SycaPay correspondant aux moyens de l'application. */
const SERVICE_BY_METHOD: Record<ProviderMethod, string> = {
  wave: 'SN_PM_WAVE',
  mobile_money: 'SN_PM_OM',
  card: 'SN_CARD_GIMUEMOA',
};

/**
 * Adresse publique de l'application. Les url_success / url_failed doivent
 * être en https : SycaPay refuse sinon (1120 / 1121 sur l'initiation).
 */
export function appBaseUrl(): string {
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.origin) return window.location.origin;
  return 'https://oresto-sn.com';
}

/**
 * Adresse de retour sur laquelle l'opérateur ramène le client.
 * On y glisse notre propre référence : c'est ainsi qu'on retrouve la commande
 * au retour, quel que soit l'opérateur puisque SycaPay y touche pas.
 */
export function returnUrl(path: '/ok' | '/echec', reference: string): string {
  const ref = encodeURIComponent(reference);
  return `${appBaseUrl()}/paiement/sycapay${path}?ref=${ref}`;
}

interface ApiEnvelope {
  ok?: boolean;
  /** Message métier d'un refus : celui qu'on affiche tel quel. */
  error?: string | null;
  errorCode?: string | null;
  /** L'appel peut être renvoyé tel quel : rien n'a été engagé. */
  retryable?: boolean;
  alreadyUsed?: boolean;
  redirectUrl?: string | null;
  qrCode?: string | null;
  deepLinks?: Record<string, string> | null;
  validFor?: { startDateTime?: string; endDateTime?: string } | null;
  checkoutUrl?: string | null;
  transactionId?: string | null;
  status?: string;
  outcome?: string;
  addedMeals?: number | null;
  expired?: boolean;
}

/**
 * En-tête d'authentification des appels à /api/sycapay/*.
 *
 * Ces routes manipulent de l'argent : elles exigent une session. Le jeton
 * d'accès est celui que Supabase a déjà signé ; la fonction serveur le
 * confronte à son propre Auth avant d'obtempérer.
 *
 * Sans session, l'appel part quand même (une page de retour de paiement peut
 * être ouverte hors session) mais la fonction répond 401 — ce n'est pas un
 * défaut à masquer côté client, c'est la réponse attendue.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch {
    /* pas de session : la fonction répondra 401 */
  }
  return headers;
}

/** Erreur HTTP : on tente de lire le message métier renvoyé par la fonction. */
async function postJson<T extends ApiEnvelope>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Passerelle de paiement injoignable. Vérifiez votre connexion et réessayez.');
  }

  let payload: ApiEnvelope = {};
  try {
    payload = (await response.json()) as ApiEnvelope;
  } catch {
    if (!response.ok) throw new Error(`La passerelle de paiement a répondu ${response.status}.`);
  }

  if (!response.ok && payload.ok === false) {
    const err = new Error(payload.error || `Paiement refusé (${response.status}).`) as Error & {
      retryable?: boolean;
      code?: string | null;
    };
    err.retryable = Boolean(payload.retryable);
    err.code = payload.errorCode ?? null;
    throw err;
  }
  return payload as T;
}

/** Traduit la réponse d'initiation en défi affichable. */
function toChallenge(payload: ApiEnvelope, method: ProviderMethod, input: StartPaymentInput) {
  // Un lien de paiement : on y redirige le client (Wave, Orange Money CI).
  if (payload.redirectUrl) {
    return { kind: 'redirect' as const, url: payload.redirectUrl, label: method === 'wave' ? 'Wave' : 'Orange Money' };
  }
  // Un QR (Orange Money Sénégal) : à afficher tel quel, base64 à décoder par
  // personne — c'est une image PNG, pas une charge EMV à tracer.
  if (payload.qrCode) {
    const deepLinks = Object.entries(payload.deepLinks ?? {}).map(([app, url]) => ({ app, url }));
    const expiresAt = payload.validFor?.endDateTime ?? null;
    return { kind: 'qr' as const, qrCode: payload.qrCode, deepLinks, ...(expiresAt ? { expiresAt } : {}) };
  }
  // Rien à afficher : l'opérateur pousse l'invite sur le téléphone du client.
  return { kind: 'prompt' as const, phone: input.phone ?? '', label: method === 'wave' ? 'Wave' : 'Mobile Money' };
}

export const sycaPayProvider: PaymentProvider = {
  id: 'sycapay',
  label: 'SycaPay',

  methods: ['wave', 'mobile_money', 'card'],

  isAvailable() {
    // La disponibilité réelle est vérifiée par /api/sycapay/health ; ici on
    // se contente de ne pas advertised un moyen sans passerelle.
    return (import.meta.env.VITE_SYCAPAY_ENABLED as string | undefined) !== 'false';
  },

  async startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
    const codeService = SERVICE_BY_METHOD[input.method];
    const payload = await postJson('/api/sycapay/initiate', {
      reference: input.reference,
      amount: input.amount,
      codeService,
      numeroBeneficiaire: input.phone,
      nomMarchand: 'O RESTO',
      // Obligatoires sur SN_PM_WAVE et SN_PM_OM : l'opérateur y ramène le
      // client après validation. Le retour n'est PAS un reçu — c'est un
      // simple écran d'attente.
      urlSuccess: returnUrl('/ok', input.reference),
      urlFailed: returnUrl('/echec', input.reference),
      metadata: { ref: input.reference, amount: String(input.amount) },
    });

    const challenge = input.method === 'card'
      ? { kind: 'hosted' as const, url: payload.checkoutUrl ?? '', label: 'Carte bancaire' }
      : toChallenge(payload, input.method, input);

    if (challenge.kind === 'hosted' && !challenge.url) {
      return { ok: false, error: 'SycaPay n’a pas renvoyé de lien de paiement.' };
    }
    return {
      ok: true,
      challenge,
      transactionId: payload.transactionId ?? null,
      expiresAt: payload.validFor?.endDateTime ?? null,
    };
  },

  async startCardCheckout(input: StartPaymentInput): Promise<StartPaymentResult> {
    const payload = await postJson('/api/sycapay/card', {
      reference: input.reference,
      amount: input.amount,
      codeService: SERVICE_BY_METHOD.card,
      urlSuccess: returnUrl('/ok', input.reference),
      urlFailed: returnUrl('/echec', input.reference),
      payerName: input.payerName,
      metadata: { ref: input.reference, amount: String(input.amount) },
    });
    if (!payload.checkoutUrl) {
      return { ok: false, error: 'SycaPay n’a pas renvoyé de lien de paiement.' };
    }
    return {
      ok: true,
      challenge: { kind: 'hosted', url: payload.checkoutUrl, label: 'Carte bancaire' },
    };
  },

  async checkStatus(reference: string): Promise<PaymentStatus> {
    const payload = await postJson('/api/sycapay/status', { reference });
    const status = (payload.status ?? 'pending') as PaymentStatus['status'];
    return {
      status,
      reference,
      outcome: payload.outcome,
      addedMeals: payload.addedMeals ?? null,
      transactionId: payload.transactionId ?? null,
      errorCode: payload.errorCode ?? null,
      error: payload.error ?? null,
      expired: Boolean(payload.expired),
      retryable: Boolean(payload.retryable),
    };
  },
};

/** État de la passerelle, tel que rapporté par /api/sycapay/health. */
export interface HealthReport {
  ok: boolean;
  mode: 'sycapay' | 'demo';
  sycapay: boolean;
  database: boolean;
  sycapayError?: string | null;
  databaseError?: string | null;
}

let healthPromise: Promise<HealthReport> | null = null;

/**
 * Sonde la passerelle une fois par session. En échec réseau ou 404 (déploiement
 * sans /api), on bascule en mode démo sans faire crier l'app.
 */
export function fetchHealth(force = false): Promise<HealthReport> {
  if (healthPromise && !force) return healthPromise;
  healthPromise = probeHealth();
  return healthPromise;
}

/**
 * Interroge la sonde, avec une seconde chance.
 *
 * Un raté passager — données mobiles, réveil de la fonction Vercel —
 * ferait basculer toute la session en mode démo : le parent verrait un
 * code à 6 chiffres au lieu de sa page Wave, et croirait avoir payé.
 * On retente donc une fois avant de se résoudre à la démonstration.
 */
async function probeHealth(): Promise<HealthReport> {
  for (let tentative = 0; tentative < 2; tentative++) {
    try {
      const res = await fetch('/api/sycapay/status', {
        headers: { Accept: 'application/json' },
        // Une sonde ne se sert jamais d'une réponse mémorisée.
        cache: 'no-store',
      });
      if (res.ok) return (await res.json()) as HealthReport;
    } catch {
      // Rien à signaler : on retente.
    }
    if (tentative === 0) await new Promise((attente) => setTimeout(attente, 1200));
  }
  return { ok: false, mode: 'demo', sycapay: false, database: false };
}

/** Remet la sonde à zéro (tests, bascule manuelle). */
export function resetHealth() {
  healthPromise = null;
}