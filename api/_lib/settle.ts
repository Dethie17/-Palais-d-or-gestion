/**
 * Règlement d'une transaction SycaPay.
 *
 * Point unique de vérité sur ce qui vaut paiement : le webhook et le
 * rattrapage statusV2 passent tous les deux par ici, et le règlement réel
 * est fait par SQL (oresto_settle_payment / oresto_settle_topup), donc
 * atomique et rejouable sans double crédit.
 *
 * Rappel de la doc SycaPay : rien n'est payé tant que le webhook ne l'a pas
 * dit. Ni le 201 d'initiation, ni le retour du navigateur sur url_success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, isMissingFunction } from './supabaseAdmin.js';
import type { StatusTransaction, WebhookEvent, WebhookEventV1 } from './sycapay.js';

export interface SettleOutcome {
  outcome: 'settled' | 'already' | 'duplicate' | 'pending' | 'unknown' | 'ignored';
  reference?: string;
  status?: string;
  addedMeals?: number;
  amount?: number;
  balance?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  eventType?: string | null;
  reason?: string;
}

interface SettleArgs {
  reference: string;
  tag: string | null | undefined;
  providerTx?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  eventId?: string | null;
  /** true quand la transaction est finalisée (FINISHED chez SycaPay). */
  finalized?: boolean;
  /** eventType du webhook v2, conservé pour la traçabilité. */
  eventType?: string | null;
}

function normalizeTag(tag: unknown): string | null {
  if (typeof tag !== 'string' || !tag.trim()) return null;
  return tag.trim().toUpperCase();
}

/**
 * Choisit la table de règlement : une recharge de carte prépayée vit dans
 * wallet_transactions, tout le reste dans oresto_payments. La référence
 * suffit à les départager (les préfixes sont distincts par construction).
 */
async function settleWithRpc(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<SettleOutcome> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (isMissingFunction(error)) {
      throw new Error(
        `Fonction ${fn}() absente : exécutez supabase-sycapay.sql dans le SQL Editor Supabase.`,
      );
    }
    throw new Error(`Règlement impossible (${fn}) : ${error.message}`);
  }
  return (data ?? { outcome: 'unknown' }) as SettleOutcome;
}

/**
 * Applique l'issue d'une transaction sur la ligne de commande correspondante.
 * Idempotent : un statut déjà soldé, un eventId rejoué ou un tag nul ne
 * changent rien.
 */
export async function settle(args: SettleArgs, db: SupabaseClient = adminClient()): Promise<SettleOutcome> {
  const tag = normalizeTag(args.tag);
  const common = {
    p_reference: args.reference,
    p_tag: tag,
    p_provider_tx: args.providerTx ?? null,
    p_error_code: args.errorCode ?? null,
    p_error_message: args.errorMessage ?? null,
    p_event_id: args.eventId ?? null,
  };

  // Une recharge porte sa référence dans wallet_transactions ; on tente
  // d'abord oresto_payments, et « unknown » bascule alors sur le wallet.
  const first = await settleWithRpc(db, 'oresto_settle_payment', { ...common, p_event_type: args.eventType ?? null });
  if (first.outcome !== 'unknown') return first;
  return settleWithRpc(db, 'oresto_settle_topup', common);
}

/**
 * Extrait la référence et l'issue d'un webhook v2.
 * eventType vaut <typeService>.<issue> ; c'est data.tag qui fait foi, mais
 * eventType permet de rejeter vite un dépôt (encaissement) alors que nous
 * n'attendons qu'un paiement (decaissement).
 */
export function readWebhookV2(event: WebhookEvent): { reference: string; eventType?: string; tx?: StatusTransaction } | null {
  const reference = event?.data?.idPartenaire
    ?? (event?.data as { transaction?: { idPartenaire?: unknown } } | undefined)?.transaction?.idPartenaire;
  if (typeof reference !== 'string' || !reference.trim()) return null;
  return {
    reference: reference.trim(),
    eventType: typeof event.eventType === 'string' ? event.eventType : undefined,
    tx: event.data,
  };
}

/** Extrait la référence et l'issue d'un webhook v1 (déprécié, encore servi). */
export function readWebhookV1(event: WebhookEventV1): { reference: string; tag?: string; reason?: string } | null {
  const reference = event?.idPartenaire ?? (event as { data?: { idPartenaire?: string } })?.data?.idPartenaire;
  if (typeof reference !== 'string' || !reference.trim()) return null;
  return {
    reference: reference.trim(),
    tag: typeof event.tag === 'string' ? event.tag : undefined,
    reason: typeof event.reasonForFailure === 'string' ? event.reasonForFailure : undefined,
  };
}

/** Vrai si l'événement annonce un paiement (pas un dépôt). */
export function isPaymentEvent(eventType: string | undefined, codeService: string | undefined): boolean {
  if (eventType) return eventType.startsWith('decaissement.') || eventType.startsWith('transaction.');
  if (codeService) return codeService.includes('_PM_');
  return true;
}
