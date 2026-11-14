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

  // Dépôt de budget Dangote : la référence porte le préfixe DGT- et la ligne
  // vit dans dangote_paiements. On ne tente surtout pas oresto_settle_payment,
  // qui répondrait « unknown » puis ferait échouer le webhook.
  if (args.reference.startsWith('DGT-')) {
    const { data, error } = await db.rpc('dangote_settle_payment', {
      ...common,
      p_status: null,
    });
    if (error) {
      if (isMissingFunction(error)) {
        throw new Error(
          'Fonction dangote_settle_payment() absente : exécutez supabase-dangote-pro.sql dans le SQL Editor Supabase.',
        );
      }
      throw new Error(`Règlement Dangote impossible : ${error.message}`);
    }
    return (data ?? { outcome: 'unknown' }) as SettleOutcome;
  }

  // Paiement combiné multi-enfants : le groupe a priorité sur le règlement
  // standard afin d'activer tous les abonnements liés à une transaction unique.
  const { data: groupData, error: groupError } = await db.rpc('oresto_settle_payment_group', {
    p_reference: args.reference,
    p_tag: tag,
    p_provider_tx: args.providerTx ?? null,
    p_event_id: args.eventId ?? null,
  });
  if (!groupError && groupData && (groupData as SettleOutcome).outcome !== 'unknown') {
    return groupData as SettleOutcome;
  }

  // Reconstitution de secours : certains paiements historiques ont été créés
  // avant que le groupe multi-enfants ne soit persisté, ou juste avant le
  // rendez-vous avec la passerelle. On déduit le groupe des abonnements créés
  // ensemble pour le même parent, puis on rejoue le règlement atomique.
  const { data: payment } = await db.from('oresto_payments').select('*').eq('reference', args.reference).maybeSingle();
  if (payment?.client_username) {
    const { data: siblings } = await db.from('subscriptions')
      .select('*')
      .eq('client_username', payment.client_username);
    const paymentTime = new Date(payment.created_at).getTime();
    const inferredIds = Array.from(new Set([
      ...(typeof payment.subscription_id === 'string' ? [payment.subscription_id] : []),
      ...((siblings ?? []).filter((sub: any) => {
        const created = new Date(sub.created_at).getTime();
        return ['pending', 'cancelled', 'active'].includes(sub.status)
          && Number.isFinite(created) && Number.isFinite(paymentTime)
          && Math.abs(created - paymentTime) <= 60 * 1000;
      }).map((sub: any) => sub.id)),
    ]));
    // Un groupe multi-enfants couvre au moins deux enfants différents : une
    // fenêtre courte + cette contrainte évitent de fusionner deux paiements
    // distincts créés à quelques minutes d'intervalle.
    const inferredChildIds = Array.from(new Set(
      (siblings ?? [])
        .filter((sub: any) => inferredIds.includes(sub.id))
        .map((sub: any) => sub.child_id)
        .filter(Boolean),
    ));
    if (inferredIds.length > 1 && inferredChildIds.length > 1) {
      const childIds = Array.from(new Set([
        ...(typeof payment.child_id === 'string' ? [payment.child_id] : []),
        ...inferredChildIds,
      ]));
      await db.from('oresto_payment_groups').upsert({
        payment_reference: args.reference,
        subscription_ids: inferredIds,
        child_ids: childIds,
        parent_username: payment.client_username,
      });
      const replay = await db.rpc('oresto_settle_payment_group', {
        p_reference: args.reference,
        p_tag: tag,
        p_provider_tx: args.providerTx ?? null,
        p_event_id: args.eventId ?? null,
      });
      if (!replay.error && replay.data && (replay.data as SettleOutcome).outcome !== 'unknown') {
        return replay.data as SettleOutcome;
      }

      // Dernier repli si la migration SQL du groupe n'est pas encore appliquée
      // sur le projet hébergé : chaque abonnement inféré reçoit son résultat.
      if (tag === 'SUCCESS') {
        await db.from('oresto_payments').update({
          status: 'paid', provider_status: 'SUCCESS',
          provider_tx: args.providerTx ?? null, settled_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
        }).eq('reference', args.reference).eq('status', 'pending');
        for (const subscriptionId of inferredIds) {
          const sub = (siblings ?? []).find((item: any) => item.id === subscriptionId);
          if (!sub) continue;
          const { data: formula } = await db.from('formulas').select('meals_included').eq('id', sub.formula_id).maybeSingle();
          await db.from('subscriptions').update({
            status: 'active', meals_remaining: formula?.meals_included ?? sub.meals_remaining,
          }).eq('id', subscriptionId);
        }
        return { outcome: 'settled', reference: args.reference, status: 'paid' };
      }
      if (tag === 'CANCELED') {
        await db.from('oresto_payments').update({
          status: 'cancelled', provider_status: tag, settled_at: new Date().toISOString(),
        }).eq('reference', args.reference).eq('status', 'pending');
        await db.from('subscriptions').update({ status: 'cancelled' }).in('id', inferredIds);
        return { outcome: 'ignored', reference: args.reference, status: 'cancelled' };
      }
    }
  }

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
