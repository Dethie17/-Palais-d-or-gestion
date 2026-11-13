/**
 * POST /api/dangote
 *
 * Point d'entrée unique du module Dangote Pro. Les opérations qui engagent
 * de l'argent ou qui doivent rester atomiques passent par ici : validation
 * d'un repas, annulation, dépôt de budget, paiement SycaPay, rotation de QR.
 *
 * Les lectures (employés, menus, historique) restent faites directement par
 * le navigateur sous RLS : le serveur n'a pas à relayer ce que PostgreSQL
 * sait déjà filtrer.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, isMissingFunction } from './_lib/supabaseAdmin.js';
import { requireRole, type AppRole, type Caller } from './_lib/session.js';
import { insertUserProfile } from './_lib/profile.js';
import {
  authEmailDomain,
  isValidUsername,
  normalizeUsername,
  STAFF_SIGNUP_FLAG,
} from './_lib/username.js';
import { personalQrToken } from './_lib/qrToken.js';
import { settle, type SettleOutcome } from './_lib/settle.js';
import {
  call,
  describeError,
  isAccepted,
  isRetryableCallError,
  isSycaPayConfigured,
  readConfig,
  SycaPayCertificateError,
  SycaPayConfigError,
  SycaPayTransportError,
  type CheckoutSessionResponse,
  type InitiateResponse,
  type StatusResponse,
} from './_lib/sycapay.js';
import {
  handlePreflight,
  methodNotAllowed,
  normalizeLocalPhone,
  parseAmount,
  readJson,
  sanitizeMetadata,
  sendError,
  sendJson,
} from './_lib/http.js';

export const config = { runtime: 'nodejs' };

const DANGOTE_STAFF: AppRole[] = ['admin', 'rh', 'superviseur-dangote'];
const DANGOTE_RH: AppRole[] = ['admin', 'rh'];

type Body = Record<string, unknown>;

interface ApiError extends Error {
  code?: string;
  details?: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function schemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205'
    || error.code === '42P01'
    || /could not find the table|relation .* does not exist/i.test(error.message ?? '')
  );
}

function failSchema(res: ServerResponse): void {
  sendError(
    res,
    503,
    'Module Dangote Pro non installé : exécutez supabase-dangote-pro.sql dans le SQL Editor Supabase.',
    { code: 'dangote-schema-missing' },
  );
}

function failDb(res: ServerResponse, error: ApiError | null): void {
  if (schemaMissing(error)) return failSchema(res);
  sendError(res, 500, error?.message ?? 'Erreur base de données.');
}

function newQrToken(): string {
  return `DGT-${randomBytes(8).toString('hex').toUpperCase()}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function publicBaseUrl(): string {
  const configured = (
    process.env.DANGOTE_APP_URL
    ?? process.env.APP_URL
    ?? ''
  ).trim();
  if (configured.startsWith('https://')) return configured.replace(/\/+$/, '');
  return 'https://orestosn.com';
}

async function resolveEntite(db: SupabaseClient, caller: Caller, requested: unknown): Promise<string | null> {
  const explicit = text(requested);
  if (explicit) {
    if (caller.role !== 'admin' && caller.entiteId && explicit !== caller.entiteId) return null;
    return explicit;
  }
  if (caller.entiteId) return caller.entiteId;
  if (caller.role === 'admin') {
    const { data } = await db.from('entites').select('id').eq('slug', 'dangote').maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  }
  return null;
}

async function ensureStaffEntity(
  db: SupabaseClient,
  caller: Caller,
  body: Body,
): Promise<{ entiteId: string } | null> {
  const entiteId = await resolveEntite(db, caller, body.entiteId);
  if (!entiteId) return null;
  if (caller.role !== 'admin' && caller.entiteId && caller.entiteId !== entiteId) return null;
  return { entiteId };
}

async function audit(
  db: SupabaseClient,
  entiteId: string,
  caller: Caller,
  action: string,
  cibleType: string,
  cibleId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await db.from('dangote_audit_log').insert({
    entite_id: entiteId,
    acteur_id: caller.userId,
    acteur_username: caller.username,
    action,
    cible_type: cibleType,
    cible_id: cibleId,
    details,
  }).then(() => undefined, () => undefined);
}

// ---------------------------------------------------------------------------
// Repas
// ---------------------------------------------------------------------------
async function validateMeal(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const employeId = text(body.employeId);
  if (!employeId) return sendError(res, 400, 'Employé obligatoire.');

  const typeRepas = text(body.typeRepas) || 'standard';
  if (typeRepas !== 'standard' && typeRepas !== 'premium') {
    return sendError(res, 400, 'Type de repas invalide.');
  }

  const quantite = Math.max(1, Math.min(20, Math.round(numberOrNull(body.quantite) ?? 1)));
  const menuId = text(body.menuId) || null;

  const { data, error } = await db.rpc('dangote_valider_repas', {
    p_entite_id: entiteId,
    p_employe_id: employeId,
    p_type_repas: typeRepas,
    p_menu_id: menuId,
    p_quantite: quantite,
    p_source: text(body.source) || 'qr',
    p_acteur_id: caller.userId,
    p_acteur_username: caller.username,
  });

  if (error) {
    if (isMissingFunction(error) || schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const outcome = String(result.outcome ?? 'error');
  if (outcome === 'valide') {
    return sendJson(res, 200, { ok: true, ...result });
  }
  if (outcome === 'forbidden') {
    return sendJson(res, 403, { ok: false, ...result });
  }
  if (outcome === 'not_found') {
    return sendJson(res, 404, { ok: false, ...result });
  }
  return sendJson(res, 409, { ok: false, ...result });
}

async function cancelMeal(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const repasId = text(body.repasId);
  if (!repasId) return sendError(res, 400, 'Repas obligatoire.');

  const { data, error } = await db.rpc('dangote_annuler_repas', {
    p_entite_id: entiteId,
    p_repas_id: repasId,
    p_motif: text(body.motif) || null,
    p_acteur_id: caller.userId,
    p_acteur_username: caller.username,
  });

  if (error) {
    if (isMissingFunction(error) || schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const outcome = String(result.outcome ?? 'error');
  if (outcome === 'annule') return sendJson(res, 200, { ok: true, ...result });
  if (outcome === 'forbidden') return sendJson(res, 403, { ok: false, ...result });
  if (outcome === 'not_found') return sendJson(res, 404, { ok: false, ...result });
  return sendJson(res, 409, { ok: false, ...result });
}

// ---------------------------------------------------------------------------
// Budget et paiements
// ---------------------------------------------------------------------------
async function depositManual(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const amount = parseAmount(body.montant ?? body.amount);
  if (amount == null) {
    return sendError(res, 400, 'Montant invalide : un entier en FCFA, au moins 100.');
  }

  const { data, error } = await db.rpc('dangote_deposer_budget', {
    p_entite_id: entiteId,
    p_montant: amount,
    p_methode: text(body.methode) || 'cash',
    p_reference: text(body.reference) || null,
    p_acteur_id: caller.userId,
    p_acteur_username: caller.username,
    p_metadata: sanitizeMetadata(body.metadata) ?? null,
  });

  if (error) {
    if (isMissingFunction(error) || schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.outcome === 'depose') return sendJson(res, 200, { ok: true, ...result });
  if (result.outcome === 'forbidden') return sendJson(res, 403, { ok: false, ...result });
  return sendJson(res, 409, { ok: false, ...result });
}

const METHOD_SERVICE: Record<string, string> = {
  wave: 'SN_PM_WAVE',
  mobile_money: 'SN_PM_OM',
  card: 'SN_CARD_GIMUEMOA',
};

async function depositInitiate(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  if (!isSycaPayConfigured()) {
    return sendError(res, 503, 'Passerelle SycaPay non configurée sur ce déploiement.');
  }

  const amount = parseAmount(body.montant ?? body.amount);
  if (amount == null) {
    return sendError(res, 400, 'Montant invalide : un entier en FCFA, au moins 100.');
  }

  const method = text(body.methode) || 'wave';
  if (!METHOD_SERVICE[method]) {
    return sendError(res, 400, 'Moyen de paiement invalide. Attendu : wave, mobile_money ou card.');
  }

  const phone = method === 'card' ? null : normalizeLocalPhone(body.telephone ?? body.phone);
  if (method !== 'card' && !phone) {
    return sendError(res, 400, 'Numéro mobile invalide — format Sénégal attendu (77/78/76/75/70…).');
  }

  const reference = `DGT-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const base = publicBaseUrl();
  const successUrl = `${base}/paiement/dangote/ok?ref=${encodeURIComponent(reference)}`;
  const failedUrl = `${base}/paiement/dangote/echec?ref=${encodeURIComponent(reference)}`;

  const { data: inserted, error: insertError } = await db
    .from('dangote_paiements')
    .insert({
      entite_id: entiteId,
      reference,
      montant: amount,
      methode: method,
      statut: 'pending',
      beneficiaire_type: 'budget_entreprise',
      initie_par: caller.userId,
      initie_par_username: caller.username,
      metadata: sanitizeMetadata(body.metadata) ?? null,
    })
    .select('id')
    .single();

  if (insertError) {
    if (schemaMissing(insertError)) return failSchema(res);
    return failDb(res, insertError as ApiError);
  }

  let config;
  try {
    config = readConfig();
  } catch (err) {
    if (err instanceof SycaPayConfigError) return sendError(res, 500, err.message);
    throw err;
  }

  const payerName = text(body.payerName) || 'MIAM\'S Dangote';

  try {
    if (method === 'card') {
      const response = await call<CheckoutSessionResponse>(config, {
        path: '/checkout/session',
        body: {
          loginApi: config.loginApi,
          mdpApi: config.mdpApi,
          montant: amount,
          urlSuccess: successUrl,
          urlFailed: failedUrl,
          merchantReference: reference,
          codeService: METHOD_SERVICE.card,
          payerName,
          metadata: sanitizeMetadata({
            ...(body.metadata as Record<string, unknown> | undefined),
            module: 'dangote',
            reference,
          }),
        },
      });

      if (!isAccepted(response.errorCode) || !response.checkoutUrl) {
        const message = describeError(response);
        await markPaymentFailed(db, reference, String(response.errorCode ?? ''), message);
        return sendJson(res, 400, {
          ok: false,
          error: message,
          errorCode: response.errorCode ?? null,
          retryable: isRetryableCallError(response.errorCode),
        });
      }

      await db.from('dangote_paiements').update({
        provider: 'sycapay',
        provider_url: response.checkoutUrl,
        provider_tx: response.token ?? null,
        provider_status: 'PENDING',
      }).eq('reference', reference);

      return sendJson(res, 200, {
        ok: true,
        reference,
        montant: amount,
        methode: method,
        checkoutUrl: response.checkoutUrl,
        transactionId: response.token ?? null,
      });
    }

    const codeService = METHOD_SERVICE[method];
    const response = await call<InitiateResponse>(config, {
      path: '/initiationTransactionV1',
      body: {
        loginApi: config.loginApi,
        mdpApi: config.mdpApi,
        transaction: {
          montant: amount,
          codeService,
          numeroBeneficiaire: phone,
          idPartenaire: reference,
          url_success: successUrl,
          url_failed: failedUrl,
          nomMarchand: payerName,
          metadata: sanitizeMetadata({
            ...(body.metadata as Record<string, unknown> | undefined),
            module: 'dangote',
            reference,
          }),
        },
      },
    });

    if (!isAccepted(response.errorCode)) {
      const message = describeError(response);
      const alreadyUsed = String(response.errorCode) === '1101';
      if (!alreadyUsed) {
        await markPaymentFailed(db, reference, String(response.errorCode ?? ''), message);
      }
      return sendJson(res, alreadyUsed ? 409 : 400, {
        ok: false,
        error: message,
        errorCode: response.errorCode ?? null,
        retryable: isRetryableCallError(response.errorCode),
        alreadyUsed,
      });
    }

    const expiresAt = response.validFor?.endDateTime
      ? new Date(response.validFor.endDateTime).toISOString()
      : null;

    await db.from('dangote_paiements').update({
      provider: 'sycapay',
      provider_tx: response.transaction?.tokenTX ?? null,
      provider_url: response.urlRedirection ?? null,
      provider_qr: response.qrCode ?? null,
      provider_deep_links: response.deepLinks ? JSON.stringify(response.deepLinks) : null,
      provider_status: 'PENDING',
      provider_expires_at: Number.isNaN(Date.parse(expiresAt ?? '')) ? null : expiresAt,
    }).eq('reference', reference);

    return sendJson(res, 200, {
      ok: true,
      reference,
      montant: amount,
      methode: method,
      redirectUrl: response.urlRedirection ?? null,
      qrCode: response.qrCode ?? null,
      deepLinks: response.deepLinks ?? null,
      validFor: response.validFor ?? null,
      transactionId: response.transaction?.tokenTX ?? null,
    });
  } catch (err) {
    if (err instanceof SycaPayCertificateError) {
      await markPaymentFailed(db, reference, 'mtls-certificate', err.message);
      return sendError(res, 502, err.message, {
        retryable: false,
        status: 'failed',
        errorCode: 'mtls-certificate',
        reference,
      });
    }
    if (err instanceof SycaPayTransportError) {
      return sendError(res, 502, err.message, { retryable: true, reference });
    }
    throw err;
  } finally {
    // Rien à faire : la ligne reste en pending si le transport a échoué, ce
    // qui permet de relancer le statut sans créer un second débit.
    void inserted;
  }
}

async function markPaymentFailed(
  db: SupabaseClient,
  reference: string,
  errorCode: string,
  message: string,
): Promise<void> {
  await db.from('dangote_paiements').update({
    statut: errorCode === 'CANCELED' ? 'cancelled' : 'failed',
    provider_error: [errorCode, message].filter(Boolean).join(' — '),
    settled_at: new Date().toISOString(),
  }).eq('reference', reference).eq('statut', 'pending');
}

async function depositStatus(
  db: SupabaseClient,
  res: ServerResponse,
  entiteId: string,
  body: Body,
): Promise<void> {
  const reference = text(body.reference);
  if (!reference) return sendError(res, 400, 'Référence obligatoire.');

  const { data: payment, error } = await db
    .from('dangote_paiements')
    .select('*')
    .eq('reference', reference)
    .eq('entite_id', entiteId)
    .maybeSingle();

  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }
  if (!payment) return sendError(res, 404, 'Paiement introuvable.');

  const row = payment as Record<string, unknown>;
  const currentStatus = String(row.statut ?? 'pending');
  if (currentStatus !== 'pending') {
    let solde: number | null = null;
    if (currentStatus === 'paid') {
      const { data: budget } = await db
        .from('dangote_budget')
        .select('solde')
        .eq('entite_id', entiteId)
        .maybeSingle();
      solde = budget ? Number((budget as { solde?: number }).solde ?? 0) : null;
    }
    return sendJson(res, 200, {
      ok: true,
      reference,
      status: currentStatus,
      montant: row.montant,
      solde,
      providerStatus: row.provider_status ?? null,
      providerError: row.provider_error ?? null,
      settledAt: row.settled_at ?? null,
    });
  }

  if (!isSycaPayConfigured()) {
    return sendJson(res, 200, {
      ok: true,
      reference,
      status: 'pending',
      message: 'Passerelle SycaPay non configurée : le dépôt reste en attente.',
    });
  }

  let config;
  try {
    config = readConfig();
  } catch (err) {
    if (err instanceof SycaPayConfigError) return sendError(res, 500, err.message);
    throw err;
  }

  let response: StatusResponse;
  try {
    response = await call<StatusResponse>(config, {
      path: '/statusV2',
      body: { loginApi: config.loginApi, mdpApi: config.mdpApi, idPartenaire: reference },
    });
  } catch (err) {
    if (err instanceof SycaPayCertificateError) {
      return sendError(res, 502, err.message, { retryable: false, status: 'unknown', reference });
    }
    if (err instanceof SycaPayTransportError) {
      return sendError(res, 502, err.message, { retryable: true, status: 'unknown', reference });
    }
    throw err;
  }

  const data = response.data;
  if (!data) {
    return sendJson(res, 200, {
      ok: true,
      reference,
      status: 'pending',
      providerStatus: 'PENDING',
      message: describeError(response),
    });
  }

  const tag = typeof data.tag === 'string' ? data.tag : null;
  if (!tag) {
    return sendJson(res, 200, {
      ok: true,
      reference,
      status: 'pending',
      providerStatus: data.statut ?? 'PENDING',
      transactionId: data.tokenTX ?? null,
    });
  }

  let outcome: SettleOutcome;
  try {
    outcome = await settle({
      reference,
      tag,
      providerTx: data.tokenTX ?? null,
      errorCode: data.erreur?.code ?? data.reasonForFailure ?? null,
      errorMessage: data.erreur?.message ?? data.reasonForFailure ?? null,
      eventId: null,
      finalized: data.statut ? data.statut.toUpperCase() === 'FINISHED' : true,
      eventType: `${data.typeService ?? 'transaction'}.${tag}`,
    });
  } catch (err) {
    console.error('[dangote] règlement dépôt impossible :', (err as Error).message);
    return sendError(res, 500, (err as Error).message, { reference });
  }

  const settledStatus = String(outcome.status ?? '');
  const status = settledStatus === 'paid'
    ? 'paid'
    : settledStatus === 'cancelled'
      ? 'cancelled'
      : settledStatus === 'pending'
        ? 'pending'
        : tag === 'SUCCESS'
          ? 'paid'
          : tag === 'CANCELED'
            ? 'cancelled'
            : tag === 'PENDING'
              ? 'pending'
              : 'failed';
  const paid = status === 'paid';
  return sendJson(res, 200, {
    ok: true,
    reference,
    status,
    outcome: outcome.outcome,
    montant: outcome.amount ?? row.montant,
    solde: outcome.balance ?? null,
    providerStatus: data.statut ?? null,
    transactionId: data.tokenTX ?? null,
    errorCode: data.erreur?.code ?? data.reasonForFailure ?? null,
    error: paid || status === 'pending' ? null : data.erreur?.message ?? data.reasonForFailure ?? null,
  });
}

// ---------------------------------------------------------------------------
// Employés
// ---------------------------------------------------------------------------
async function createEmployee(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const nom = text(body.nom);
  const prenom = text(body.prenom);
  if (!nom || !prenom) return sendError(res, 400, 'Nom et prénom obligatoires.');

  const usernameRaw = text(body.username);
  const password = text(body.password);
  const hasAccount = Boolean(usernameRaw || password);

  let username = '';
  if (hasAccount) {
    username = normalizeUsername(usernameRaw);
    if (!isValidUsername(username)) {
      return sendError(res, 400, 'Nom d’utilisateur : 3 à 24 caractères (lettres, chiffres, . _ -).');
    }
    if (password.length < 8) {
      return sendError(res, 400, 'Mot de passe de 8 caractères minimum.');
    }
  }

  const matricule = text(body.matricule) || username || `EMP-${Date.now().toString(36).toUpperCase()}`;
  const qrToken = hasAccount ? personalQrToken(username) : newQrToken();

  let authUserId: string | null = null;
  if (hasAccount) {
    const domain = authEmailDomain();
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: `${username}@${domain}`,
      password,
      email_confirm: true,
      app_metadata: { oresto: STAFF_SIGNUP_FLAG },
    });
    if (createError || !created?.user) {
      return sendError(res, 400, 'Création impossible : identifiant déjà utilisé ou invalide.');
    }
    authUserId = created.user.id;

    const profileError = await insertUserProfile(
      db,
      {
        username,
        role: 'employe-dangote',
        auth_id: authUserId,
        qr_token: qrToken,
        entite_id: entiteId,
      },
      password,
    );
    if (profileError) {
      await db.auth.admin.deleteUser(authUserId).catch(() => undefined);
      return sendError(res, 500, 'Compte créé, mais fiche métier non enregistrée.');
    }
  }

  const { data, error } = await db
    .from('dangote_employes')
    .insert({
      entite_id: entiteId,
      user_id: authUserId,
      matricule,
      nom,
      prenom,
      service: text(body.service) || null,
      email: text(body.email) || (hasAccount ? `${username}@${authEmailDomain()}` : null),
      telephone: text(body.telephone) || null,
      poste: text(body.poste) || null,
      date_embauche: isDate(text(body.dateEmbauche)) ? text(body.dateEmbauche) : null,
      date_fin: isDate(text(body.dateFin)) ? text(body.dateFin) : null,
      plafond_journalier: numberOrNull(body.plafondJournalier),
      plafond_mensuel: numberOrNull(body.plafondMensuel),
      notes: text(body.notes) || null,
      actif: bool(body.actif, true),
      qr_token: qrToken,
    })
    .select('*')
    .single();

  if (error) {
    if (authUserId) {
      await db.from('users').delete().eq('auth_id', authUserId);
      await db.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    if (schemaMissing(error)) return failSchema(res);
    if (error.code === '23505') return sendError(res, 409, 'Matricule ou QR déjà utilisé.');
    return failDb(res, error as ApiError);
  }

  await audit(db, entiteId, caller, 'employe.create', 'dangote_employe', String((data as { id?: string }).id), {
    matricule,
    compte: hasAccount,
  });

  return sendJson(res, 201, { ok: true, employe: data, compte: hasAccount, username: hasAccount ? username : null });
}

async function updateEmployee(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const id = text(body.id);
  if (!id) return sendError(res, 400, 'Employé obligatoire.');

  const patch: Record<string, unknown> = {};
  if (body.matricule !== undefined) patch.matricule = text(body.matricule);
  if (body.nom !== undefined) patch.nom = text(body.nom);
  if (body.prenom !== undefined) patch.prenom = text(body.prenom);
  if (body.service !== undefined) patch.service = text(body.service) || null;
  if (body.email !== undefined) patch.email = text(body.email) || null;
  if (body.telephone !== undefined) patch.telephone = text(body.telephone) || null;
  if (body.poste !== undefined) patch.poste = text(body.poste) || null;
  if (body.dateEmbauche !== undefined) patch.date_embauche = isDate(text(body.dateEmbauche)) ? text(body.dateEmbauche) : null;
  if (body.dateFin !== undefined) patch.date_fin = isDate(text(body.dateFin)) ? text(body.dateFin) : null;
  if (body.plafondJournalier !== undefined) patch.plafond_journalier = numberOrNull(body.plafondJournalier);
  if (body.plafondMensuel !== undefined) patch.plafond_mensuel = numberOrNull(body.plafondMensuel);
  if (body.notes !== undefined) patch.notes = text(body.notes) || null;
  if (body.actif !== undefined) patch.actif = bool(body.actif);
  patch.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from('dangote_employes')
    .update(patch)
    .eq('id', id)
    .eq('entite_id', entiteId)
    .select('*')
    .single();

  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    if (error.code === '23505') return sendError(res, 409, 'Matricule déjà utilisé.');
    return failDb(res, error as ApiError);
  }

  await audit(db, entiteId, caller, 'employe.update', 'dangote_employe', id, patch);
  return sendJson(res, 200, { ok: true, employe: data });
}

async function toggleEmployee(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const id = text(body.id);
  if (!id) return sendError(res, 400, 'Employé obligatoire.');
  const actif = bool(body.actif, true);

  const { data, error } = await db
    .from('dangote_employes')
    .update({ actif, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('entite_id', entiteId)
    .select('*')
    .single();

  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  await audit(db, entiteId, caller, actif ? 'employe.activer' : 'employe.desactiver', 'dangote_employe', id, { actif });
  return sendJson(res, 200, { ok: true, employe: data });
}

async function rotateQr(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const id = text(body.id);
  if (!id) return sendError(res, 400, 'Employé obligatoire.');

  const { data, error } = await db.rpc('dangote_rotate_qr', {
    p_entite_id: entiteId,
    p_employe_id: id,
    p_acteur_id: caller.userId,
    p_acteur_username: caller.username,
  });

  if (error) {
    if (isMissingFunction(error) || schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.outcome === 'ok') return sendJson(res, 200, { ok: true, ...result });
  if (result.outcome === 'forbidden') return sendJson(res, 403, { ok: false, ...result });
  return sendJson(res, 404, { ok: false, ...result });
}

// ---------------------------------------------------------------------------
// Catalogue / menus
// ---------------------------------------------------------------------------
async function saveMenu(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const dateJour = text(body.dateJour);
  if (!isDate(dateJour)) return sendError(res, 400, 'Date invalide (AAAA-MM-JJ).');

  const typeRepas = text(body.typeRepas) || 'standard';
  if (typeRepas !== 'standard' && typeRepas !== 'premium') {
    return sendError(res, 400, 'Type de menu invalide.');
  }

  const titre = text(body.titre);
  if (!titre) return sendError(res, 400, 'Titre du menu obligatoire.');

  const prix = numberOrNull(body.prix);
  if (prix == null || prix < 0) return sendError(res, 400, 'Prix du menu invalide.');

  const { data: menu, error } = await db
    .from('dangote_menus')
    .upsert({
      entite_id: entiteId,
      date_jour: dateJour,
      type_repas: typeRepas,
      titre,
      description: text(body.description) || null,
      prix,
      actif: bool(body.actif, true),
      created_by: caller.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'entite_id,date_jour,type_repas' })
    .select('*')
    .single();

  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  const menuRow = menu as { id: string };
  await db.from('dangote_menu_plats').delete().eq('menu_id', menuRow.id);

  const plats = Array.isArray(body.plats) ? body.plats : [];
  if (plats.length > 0) {
    const rows = plats
      .map((item) => {
        const plat = item as Record<string, unknown>;
        const platId = text(plat.platId ?? plat.id);
        if (!platId) return null;
        return {
          menu_id: menuRow.id,
          plat_id: platId,
          quantite: Math.max(1, Math.round(numberOrNull(plat.quantite) ?? 1)),
        };
      })
      .filter((row): row is { menu_id: string; plat_id: string; quantite: number } => row !== null);

    if (rows.length > 0) {
      const { error: platsError } = await db.from('dangote_menu_plats').insert(rows);
      if (platsError) return failDb(res, platsError as ApiError);
    }
  }

  await audit(db, entiteId, caller, 'menu.save', 'dangote_menu', menuRow.id, {
    date_jour: dateJour,
    type_repas: typeRepas,
    titre,
    prix,
  });

  return sendJson(res, 200, { ok: true, menu });
}

async function deleteMenu(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const id = text(body.id);
  if (!id) return sendError(res, 400, 'Menu obligatoire.');

  const { error } = await db.from('dangote_menus').delete().eq('id', id).eq('entite_id', entiteId);
  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  await audit(db, entiteId, caller, 'menu.delete', 'dangote_menu', id, {});
  return sendJson(res, 200, { ok: true });
}

async function savePlat(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const nom = text(body.nom);
  if (!nom) return sendError(res, 400, 'Nom du plat obligatoire.');
  const prix = numberOrNull(body.prix);
  if (prix == null || prix < 0) return sendError(res, 400, 'Prix du plat invalide.');

  const id = text(body.id);
  const row: Record<string, unknown> = {
    entite_id: entiteId,
    categorie_id: text(body.categorieId) || null,
    nom,
    description: text(body.description) || null,
    prix,
    cout: numberOrNull(body.cout),
    image_url: text(body.imageUrl) || null,
    est_premium: bool(body.estPremium),
    disponible: bool(body.disponible, true),
    stock_quantite: numberOrNull(body.stockQuantite),
    stock_alerte: numberOrNull(body.stockAlerte),
    updated_at: new Date().toISOString(),
  };
  if (id) {
    row.id = id;
    const { data: existing, error: lookupError } = await db
      .from('dangote_plats')
      .select('id')
      .eq('id', id)
      .eq('entite_id', entiteId)
      .maybeSingle();
    if (lookupError) {
      if (schemaMissing(lookupError)) return failSchema(res);
      return failDb(res, lookupError as ApiError);
    }
    if (!existing) return sendError(res, 404, 'Plat introuvable.');
  }

  const { data, error } = await db.from('dangote_plats').upsert(row).select('*').single();
  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  await audit(db, entiteId, caller, id ? 'plat.update' : 'plat.create', 'dangote_plat', String((data as { id?: string }).id), { nom, prix });
  return sendJson(res, 200, { ok: true, plat: data });
}

async function deletePlat(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const id = text(body.id);
  if (!id) return sendError(res, 400, 'Plat obligatoire.');
  const { error } = await db.from('dangote_plats').delete().eq('id', id).eq('entite_id', entiteId);
  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }
  await audit(db, entiteId, caller, 'plat.delete', 'dangote_plat', id, {});
  return sendJson(res, 200, { ok: true });
}

async function saveCategorie(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const nom = text(body.nom);
  if (!nom) return sendError(res, 400, 'Nom de catégorie obligatoire.');
  const id = text(body.id);
  const row: Record<string, unknown> = {
    entite_id: entiteId,
    nom,
    description: text(body.description) || null,
    ordre: Math.round(numberOrNull(body.ordre) ?? 0),
    actif: bool(body.actif, true),
  };
  if (id) {
    row.id = id;
    const { data: existing, error: lookupError } = await db
      .from('dangote_categories')
      .select('id')
      .eq('id', id)
      .eq('entite_id', entiteId)
      .maybeSingle();
    if (lookupError) {
      if (schemaMissing(lookupError)) return failSchema(res);
      return failDb(res, lookupError as ApiError);
    }
    if (!existing) return sendError(res, 404, 'Catégorie introuvable.');
  }

  const { data, error } = await db.from('dangote_categories').upsert(row).select('*').single();
  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    if (error.code === '23505') return sendError(res, 409, 'Cette catégorie existe déjà.');
    return failDb(res, error as ApiError);
  }

  await audit(db, entiteId, caller, id ? 'categorie.update' : 'categorie.create', 'dangote_categorie', String((data as { id?: string }).id), { nom });
  return sendJson(res, 200, { ok: true, categorie: data });
}

// ---------------------------------------------------------------------------
// Paramètres / factures
// ---------------------------------------------------------------------------
async function saveSettings(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const stringFields: [string, string][] = [
    ['nomRestaurant', 'nom_restaurant'],
    ['devise', 'devise'],
    ['heureOuverture', 'heure_ouverture'],
    ['heureFermeture', 'heure_fermeture'],
  ];
  for (const [input, column] of stringFields) {
    if (body[input] !== undefined) patch[column] = text(body[input]);
  }
  const numberFields: [string, string][] = [
    ['prixStandard', 'prix_standard'],
    ['prixPremium', 'prix_premium'],
    ['subventionJour', 'subvention_jour'],
    ['valeurTicket', 'valeur_ticket'],
    ['ticketsParTalon', 'tickets_par_talon'],
    ['quotaRepasJour', 'quota_repas_jour'],
    ['quotaRepasMois', 'quota_repas_mois'],
    ['budgetAlerteSeuil', 'budget_alerte_seuil'],
  ];
  for (const [input, column] of numberFields) {
    if (body[input] !== undefined) patch[column] = numberOrNull(body[input]);
  }
  if (body.autoSubvention !== undefined) patch.auto_subvention = bool(body.autoSubvention, true);

  const { data, error } = await db
    .from('dangote_parametres')
    .upsert({ entite_id: entiteId, ...patch }, { onConflict: 'entite_id' })
    .select('*')
    .single();

  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  await audit(db, entiteId, caller, 'parametres.update', 'dangote_parametres', entiteId, patch);
  return sendJson(res, 200, { ok: true, parametres: data });
}

async function generateFacture(
  db: SupabaseClient,
  res: ServerResponse,
  caller: Caller,
  entiteId: string,
  body: Body,
): Promise<void> {
  const debut = text(body.debut) || `${today().slice(0, 7)}-01`;
  const fin = text(body.fin) || today();
  if (!isDate(debut) || !isDate(fin)) return sendError(res, 400, 'Période invalide.');

  const { data: repas, error } = await db
    .from('dangote_repas')
    .select('prix, subvention_appliquee, retenue_salaire')
    .eq('entite_id', entiteId)
    .gte('date_jour', debut)
    .lte('date_jour', fin)
    .eq('statut', 'valide');

  if (error) {
    if (schemaMissing(error)) return failSchema(res);
    return failDb(res, error as ApiError);
  }

  const rows = (repas ?? []) as { prix?: number; subvention_appliquee?: number; retenue_salaire?: number }[];
  const total = rows.reduce((sum, row) => sum + Number(row.prix ?? 0), 0);
  const subvention = rows.reduce((sum, row) => sum + Number(row.subvention_appliquee ?? 0), 0);
  const retenues = rows.reduce((sum, row) => sum + Number(row.retenue_salaire ?? 0), 0);
  const numero = `FAC-${debut.slice(0, 7)}-${randomBytes(3).toString('hex').toUpperCase()}`;

  const { data, error: insertError } = await db
    .from('dangote_factures')
    .insert({
      entite_id: entiteId,
      numero,
      periode_debut: debut,
      periode_fin: fin,
      montant_total: total,
      montant_subvention: subvention,
      montant_retenues: retenues,
      statut: 'emise',
      created_by: caller.userId,
    })
    .select('*')
    .single();

  if (insertError) {
    if (schemaMissing(insertError)) return failSchema(res);
    return failDb(res, insertError as ApiError);
  }

  await audit(db, entiteId, caller, 'facture.generate', 'dangote_facture', String((data as { id?: string }).id), {
    periode_debut: debut,
    periode_fin: fin,
    total,
    subvention,
    retenues,
  });

  return sendJson(res, 201, { ok: true, facture: data });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const caller = await requireRole(req, res, DANGOTE_STAFF);
  if (!caller) return;

  let body: Body;
  try {
    body = await readJson<Body>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const action = text(body.action);
  if (!action) return sendError(res, 400, 'Action obligatoire.');

  const db = adminClient();
  const scope = await ensureStaffEntity(db, caller, body);
  if (!scope) {
    return sendError(res, 403, 'Entité Dangote non autorisée.');
  }
  const { entiteId } = scope;

  const rhOnly = new Set([
    'deposit.initiate', 'deposit.status', 'deposit.manual',
    'settings.save', 'facture.generate',
    'employee.create', 'employee.update', 'employee.toggle', 'employee.rotateQr',
    'menu.save', 'menu.delete', 'plat.save', 'plat.delete', 'categorie.save',
  ]);
  if (rhOnly.has(action) && !DANGOTE_RH.includes(caller.role)) {
    return sendError(res, 403, 'Opération réservée à la Direction du Capital Humain.');
  }

  try {
    switch (action) {
      case 'meal.validate':
        return await validateMeal(db, res, caller, entiteId, body);
      case 'meal.cancel':
        return await cancelMeal(db, res, caller, entiteId, body);
      case 'deposit.initiate':
        return await depositInitiate(db, res, caller, entiteId, body);
      case 'deposit.status':
        return await depositStatus(db, res, entiteId, body);
      case 'deposit.manual':
        return await depositManual(db, res, caller, entiteId, body);
      case 'employee.create':
        return await createEmployee(db, res, caller, entiteId, body);
      case 'employee.update':
        return await updateEmployee(db, res, caller, entiteId, body);
      case 'employee.toggle':
        return await toggleEmployee(db, res, caller, entiteId, body);
      case 'employee.rotateQr':
        return await rotateQr(db, res, caller, entiteId, body);
      case 'menu.save':
        return await saveMenu(db, res, caller, entiteId, body);
      case 'menu.delete':
        return await deleteMenu(db, res, caller, entiteId, body);
      case 'plat.save':
        return await savePlat(db, res, caller, entiteId, body);
      case 'plat.delete':
        return await deletePlat(db, res, caller, entiteId, body);
      case 'categorie.save':
        return await saveCategorie(db, res, caller, entiteId, body);
      case 'settings.save':
        return await saveSettings(db, res, caller, entiteId, body);
      case 'facture.generate':
        return await generateFacture(db, res, caller, entiteId, body);
      default:
        return sendError(res, 400, `Action inconnue : ${action}.`);
    }
  } catch (err) {
    const error = err as ApiError;
    if (schemaMissing(error)) return failSchema(res);
    console.error('[dangote]', action, error.message);
    return sendError(res, 500, error.message || 'Erreur interne du module Dangote.');
  }
}
