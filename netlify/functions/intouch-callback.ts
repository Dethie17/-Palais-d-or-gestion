/**
 * Netlify Function - InTouch Callback Webhook
 * Reçoit les notifications de paiement InTouch
 * 
 * URL publique : https://orestosn.com/.netlify/functions/intouch-callback
 * 
 * Variables d'environnement requises (Netlify Dashboard > Site settings > Environment variables) :
 * - INTOUCH_CALLBACK_SECRET : clé secrète fournie par InTouch pour vérifier la signature
 * - SUPABASE_URL : URL de votre projet Supabase
 * - SUPABASE_SERVICE_ROLE_KEY : clé service role Supabase (pour écriture DB)
 * 
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface InTouchCallbackPayload {
  transaction_id: string;
  reference: string;
  amount: number;
  status: 'success' | 'failed' | 'pending';
  phone: string;
  merchant_number: string;
  timestamp: string;
  signature: string;
  // Champs supplémentaires possibles selon la doc InTouch
  operator?: 'orange' | 'free' | 'expresso' | 'wave';
  fees?: number;
  net_amount?: number;
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CALLBACK_SECRET = process.env.INTOUCH_CALLBACK_SECRET || '';

// Handle CORS preflight requests
const handleCors = (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  return null;
};

function verifySignature(payload: InTouchCallbackPayload, secret: string): boolean {
  if (!secret) {
    console.warn('⚠️ INTOUCH_CALLBACK_SECRET non configuré - signature non vérifiée');
    return true; // En dev, on accepte sans signature
  }
  
  // InTouch envoie généralement la signature dans l'en-tête ou dans le body
  // Adaptation selon leur doc exacte
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return payload.signature === expectedSignature;
}

function getClientIp(event: HandlerEvent): string {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || event.headers['x-real-ip'] 
    || 'unknown';
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Seulement POST autorisé
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 
        'Allow': 'POST',
        ...corsHeaders,
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const clientIp = getClientIp(event);
  console.log(`🔔 InTouch callback reçu de ${clientIp}`);

  try {
    // Parse du body
    let payload: InTouchCallbackPayload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return { 
        statusCode: 400, 
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON' }) 
      };
    }

    const { transaction_id, reference, amount, status, signature } = payload;

    if (!reference || !transaction_id) {
      console.error('❌ Payload InTouch invalide: référence manquante');
      return { 
        statusCode: 400, 
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing reference' }) 
      };
    }

    // Vérification signature
    if (!verifySignature(payload, CALLBACK_SECRET)) {
      console.error('❌ Signature InTouch invalide', { reference, clientIp });
      return { 
        statusCode: 401, 
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid signature' }) 
      };
    }

    console.log(`✅ InTouch callback valide: ${reference} - ${status} - ${amount} FCFA`);

    // Recherche du paiement correspondant
    const { data: payments, error: findError } = await supabase
      .from('oresto_payments')
      .select('*')
      .or(`reference.eq.${reference},id.eq.${reference}`)
      .limit(1);

    if (findError) {
      console.error('❌ Erreur recherche paiement:', findError);
      return { 
        statusCode: 500, 
        headers: corsHeaders,
        body: JSON.stringify({ error: 'DB error' }) 
      };
    }

    const payment = payments?.[0];
    if (!payment) {
      console.warn('⚠️ Paiement non trouvé pour référence:', reference);
      // On ne bloque pas - InTouch peut envoyer callback avant création locale
      return { 
        statusCode: 200, 
        headers: corsHeaders,
        body: JSON.stringify({ received: true, note: 'Payment not found locally, logged for reconciliation' }) 
      };
    }

    // Mise à jour selon le statut
    const newStatus = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (status === 'success') {
      updates.paid_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('oresto_payments')
      .update(updates)
      .eq('id', payment.id);

    if (updateError) {
      console.error('❌ Erreur mise à jour paiement:', updateError);
      return { 
        statusCode: 500, 
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Update failed' }) 
      };
    }

    console.log(`✅ Paiement ${payment.id} mis à jour: ${newStatus}`);

    // Si paiement réussi, activer l'abonnement associé
    if (status === 'success' && payment.subscription_id) {
      const { error: subError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          start_date: new Date().toISOString(),
          meals_remaining: supabase.rpc('get_formula_meals', { formula_id: payment.subscription_id }) // optionnel
        })
        .eq('id', payment.subscription_id);

      if (subError) {
        console.error('⚠️ Erreur activation abonnement:', subError);
      } else {
        console.log(`✅ Abonnement ${payment.subscription_id} activé`);
      }
    }

    // Log d'audit
    await supabase.from('payment_callbacks').insert({
      payment_id: payment.id,
      provider: 'intouch',
      transaction_id,
      reference,
      amount,
      status: newStatus,
      raw_payload: payload,
      ip: clientIp,
      created_at: new Date().toISOString()
    }).catch(() => {}); // Non bloquant

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        payment_id: payment.id,
        status: newStatus 
      })
    };

  } catch (err) {
    console.error('💥 Erreur callback InTouch:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

export { handler };