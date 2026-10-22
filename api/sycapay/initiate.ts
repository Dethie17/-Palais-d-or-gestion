/**
 * POST /api/sycapay/initiate
 *
 * Initie un paiement mobile money chez SycaPay (service _PM_) et renvoie au
 * navigateur ce dont le client a besoin pour payer — un lien (Wave), un QR et
 * des liens profonds (Orange Money), ou rien du tout quand l'opérateur pousse
 * l'invite sur le téléphone.
 *
 * Ce que cet endpoint NE fait pas : solder quoi que ce soit. Le 201 dit que
 * la demande est partie, pas que l'argent est encaissé. Seul le webhook (ou le
 * rattrapage statusV2) conclut.
 *
 * Corps attendu :
 * {
 *   "reference": "PAY-XXXX",       // votre référence = idPartenaire
 *   "amount": 27000,               // XOF, entier
 *   "codeService": "SN_PM_WAVE",   // ou SN_PM_OM
 *   "numeroBeneficiaire": "771234567",
 *   "metadata": { "client": "..." },
 *   "nomMarchand": "O RESTO"       // optionnel (Orange Money)
 * }
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  call,
  describeError,
  isAccepted,
  isRetryableCallError,
  readConfig,
  requiresReturnUrls,
  isSycaPayConfigured,
  SycaPayConfigError,
  SycaPayTransportError,
  type InitiateResponse,
  type SycaPayCodeService,
} from '../_lib/sycapay.js';
import { adminClient } from '../_lib/supabaseAdmin.js';
import { requireRole, expectedAmountFor, STAFF_OR_ADMIN } from '../_lib/session.js';
import {
  handlePreflight,
  methodNotAllowed,
  parseAmount,
  normalizeLocalPhone,
  readJson,
  sanitizeMetadata,
  sendError,
  sendJson,
} from '../_lib/http.js';

/** Services _PM_ de ce projet : Wave et Orange Money Sénégal. */
const ALLOWED_SERVICES: SycaPayCodeService[] = ['SN_PM_WAVE', 'SN_PM_OM'];

interface InitiateBody {
  reference?: unknown;
  amount?: unknown;
  codeService?: unknown;
  numeroBeneficiaire?: unknown;
  metadata?: unknown;
  nomMarchand?: unknown;
  urlSuccess?: unknown;
  urlFailed?: unknown;
}

/** Les adresses de retour doivent être en https : SycaPay refuse sinon (1120/1121). */
function validReturnUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  // Déclencher un paiement engage le compte marchand : la route est
  // réservée à une session authentifiée. Le personnel initie pour le
  // comptoir ; un parent initie seulement SES propres commandes, montant
  // vérifié — voir le contrôle de propriété ci-dessous. Sans ce garde-fou,
  // l'URL seule suffisait à émettre des demandes de débit.
  const caller = await requireRole(req, res, ['client', ...STAFF_OR_ADMIN]);
  if (!caller) return;

  if (!isSycaPayConfigured()) {
    return sendError(res, 503, 'Passerelle SycaPay non configurée sur ce déploiement.');
  }

  let body: InitiateBody;
  try {
    body = await readJson<InitiateBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
  if (!reference || reference.length > 100) {
    return sendError(res, 400, 'Référence de commande obligatoire (max 100 caractères).');
  }

  const amount = parseAmount(body.amount);
  if (amount == null) {
    return sendError(res, 400, 'Montant invalide : un entier en XOF, au moins 100.');
  }

  const codeService = String(body.codeService ?? '') as SycaPayCodeService;
  if (!ALLOWED_SERVICES.includes(codeService)) {
    return sendError(res, 400, `Service non autorisé. Attendu : ${ALLOWED_SERVICES.join(', ')}.`);
  }

  const phone = normalizeLocalPhone(body.numeroBeneficiaire);
  if (!phone) {
    return sendError(res, 400, 'Numéro mobile invalide — format Sénégal attendu (77/78/76/75/70…), sans indicatif pays.');
  }

  // Un parent ne paie que ses commandes, au montant enregistré : ni la
  // commande d'autrui (référence devinée), ni un prix modifié dans le
  // navigateur. Le personnel du comptoir garde le parcours libre.
  if (caller.role === 'client') {
    let expected: number | null = null;
    try {
      expected = await expectedAmountFor(caller.username, reference);
    } catch {
      expected = null;
    }
    if (expected == null) {
      return sendError(res, 403, 'Cette transaction n’est pas la vôtre.');
    }
    if (expected !== amount) {
      return sendError(res, 400, 'Montant incohérent avec la commande — rechargez la page et réessayez.');
    }
  }

  const transaction: Record<string, unknown> = {
    montant: amount,
    codeService,
    numeroBeneficiaire: phone,
    idPartenaire: reference,
  };

  // url_success / url_failed sont obligatoires sur SN_PM_WAVE et SN_PM_OM :
  // l'opérateur y ramène le client. On y porte notre propre référence pour
  // la retrouver au retour — les paramètres qu'il ajoute sont les siens.
  if (requiresReturnUrls(codeService)) {
    if (!validReturnUrl(body.urlSuccess) || !validReturnUrl(body.urlFailed)) {
      return sendError(
        res,
        400,
        'Ce service exige des adresses de retour en https (urlSuccess et urlFailed). Repli sur une URL publique de l’application requise.',
      );
    }
    transaction.url_success = body.urlSuccess;
    transaction.url_failed = body.urlFailed;
  }

  const metadata = sanitizeMetadata(body.metadata);
  if (metadata) transaction.metadata = metadata;
  const merchant = typeof body.nomMarchand === 'string' ? body.nomMarchand.trim().slice(0, 80) : '';
  if (merchant) transaction.nomMarchand = merchant;

  let config;
  try {
    config = readConfig();
  } catch (err) {
    if (err instanceof SycaPayConfigError) return sendError(res, 500, err.message);
    throw err;
  }

  let response: InitiateResponse;
  try {
    response = await call<InitiateResponse>(config, {
      path: '/initiationTransactionV1',
      body: { loginApi: config.loginApi, mdpApi: config.mdpApi, transaction },
    });
  } catch (err) {
    if (err instanceof SycaPayTransportError) {
      // Panne de transport : rien n'a été engagé, l'appel peut être renvoyé.
      return sendError(res, 502, err.message, { retryable: true });
    }
    throw err;
  }

  if (!isAccepted(response.errorCode)) {
    const message = describeError(response);
    // 1101 : idPartenaire déjà utilisé. La transaction existe déjà — ce n'est
    // pas un échec du client, et rejouer l'appel ne ferait que risquer un
    // second débit : on répond en conflit sans réessayer.
    const alreadyUsed = String(response.errorCode) === '1101';
    // 1101 : une transaction porte déjà cette référence. Elle peut être en
    // vol ou déjà réglée — on ne referme donc rien, on laisse le statut décider.
    if (!alreadyUsed) await markFailed(reference, String(response.errorCode ?? ''), message);
    return sendJson(res, alreadyUsed ? 409 : 400, {
      ok: false,
      error: message,
      errorCode: response.errorCode ?? null,
      // L'appel peut être rejoué tel quel : c'est la seule garantie que la
      // passerelle donne sur un refus d'appel.
      retryable: isRetryableCallError(response.errorCode),
      alreadyUsed,
    });
  }

  // On note la transaction opérateur et ce qu'il faut afficher au client.
  // Le règlement, lui, ne se décide qu'ici après coup.
  await registerTransaction(reference, response);

  return sendJson(res, 200, {
    ok: true,
    accepted: true,
    // errorCode 200 : un dépôt terminé. 201 : en attente du client. Pour un
    // service _PM_ c'est 201, mais on relaie la valeur telle quelle.
    errorCode: response.errorCode ?? '201',
    transactionId: response.transaction?.tokenTX ?? null,
    codeService,
    // Lien de paiement (Wave, Orange Money CI) : redirigez le client dessus.
    redirectUrl: typeof response.urlRedirection === 'string' ? response.urlRedirection : null,
    // QR Orange Money Sénégal : une image PNG en base64, à afficher telle quelle.
    qrCode: typeof response.qrCode === 'string' ? response.qrCode : null,
    // Table application → adresse : parcourez-la, ne codez pas une clé en dur.
    deepLinks: response.deepLinks ?? null,
    validFor: response.validFor ?? null,
  });
}

/** Trace la transaction ouverte (lien, QR, expiration) sur la ligne de commande. */
async function registerTransaction(reference: string, response: InitiateResponse): Promise<void> {
  try {
    const db = adminClient();
    const validFor = response.validFor?.endDateTime;
    // validFor est rendu au format local de l'opérateur, sans fuseau : on le
    // garde tel quel côté client plutôt que de le convertir à l'aveugle.
    const expiresAt = validFor ? new Date(validFor).toISOString() : null;
    const { error } = await db.rpc('oresto_register_provider_tx', {
      p_reference: reference,
      p_provider: 'sycapay',
      p_provider_tx: response.transaction?.tokenTX ?? null,
      p_url: typeof response.urlRedirection === 'string' ? response.urlRedirection : null,
      p_qr: typeof response.qrCode === 'string' ? response.qrCode : null,
      p_deep_links: response.deepLinks ? JSON.stringify(response.deepLinks) : null,
      p_expires_at: Number.isNaN(Date.parse(expiresAt ?? '')) ? null : expiresAt,
    });
    if (error) console.warn('[sycapay/initiate] trace impossible :', error.message);
  } catch (err) {
    // La trace est un confort de réconciliation, pas un préalable : un
    // échec ici ne doit pas faire échouer l'initiation déjà acceptée.
    console.warn('[sycapay/initiate] trace impossible :', (err as Error).message);
  }
}

/** Referme une demande que l'opérateur a refusée dès l'initiation. */
async function markFailed(reference: string, errorCode: string, message: string): Promise<void> {
  if (!errorCode) return;
  try {
    const { error } = await adminClient().rpc('oresto_fail_payment', {
      p_reference: reference,
      p_error_code: errorCode,
      p_error_message: message,
    });
    if (error) console.warn('[sycapay/initiate] clôture impossible :', error.message);
  } catch (err) {
    console.warn('[sycapay/initiate] clôture impossible :', (err as Error).message);
  }
}
