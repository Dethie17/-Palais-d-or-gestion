import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, X-Intouch-Signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CALLBACK_SECRET = process.env.INTOUCH_CALLBACK_SECRET || '';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function verifySignature(payload, rawBody, secret) {
  if (!secret) {
    console.warn('WARNING: INTOUCH_CALLBACK_SECRET not set - signature not verified');
    return true;
  }
  const provided = payload.signature || '';
  const { signature, ...rest } = payload;
  const candidates = [
    crypto.createHmac('sha256', secret).update(JSON.stringify(rest)).digest('hex'),
    crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex'),
  ];
  return candidates.some(
    (expected) =>
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  );
}

function getClientIp(event) {
  const headers = event.headers || {};
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  return forwarded
    ? forwarded.split(',')[0].trim()
    : headers['x-real-ip'] || 'unknown';
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, Allow: 'POST' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const clientIp = getClientIp(event);
  console.log(`InTouch callback received from ${clientIp}`);

  const supabase = getClient();
  if (!supabase) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Server not configured' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { transaction_id, reference, amount, status, signature } = payload;

  if (!reference || !transaction_id) {
    console.error('Invalid InTouch payload: missing reference or transaction_id');
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing reference' }),
    };
  }

  if (!verifySignature(payload, event.body, CALLBACK_SECRET)) {
    console.error('Invalid InTouch signature', { reference, clientIp });
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid signature' }),
    };
  }

  console.log(`Valid InTouch callback: ${reference} - ${status} - ${amount}`);

  const newStatus = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';
  const now = new Date().toISOString();

  const safeReference = String(reference).replace(/[,()]/g, '');
  const { data: payments, error: findError } = await supabase
    .from('oresto_payments')
    .select('*')
    .or(`reference.eq.${safeReference},id.eq.${safeReference}`)
    .limit(1);

  if (findError) {
    console.error('Payment lookup failed:', findError);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'DB error' }),
    };
  }

  const payment = payments?.[0];

  if (!payment) {
    console.warn('No local payment for reference:', reference);
    const { error: logError } = await supabase.from('payment_callbacks').insert({
      payment_id: null,
      provider: 'intouch',
      transaction_id,
      reference: safeReference,
      amount,
      status: newStatus,
      raw_payload: payload,
      ip: clientIp,
      created_at: now,
    });
    if (logError) console.error('Callback audit insert failed:', logError);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ received: true, note: 'Payment not found locally' }),
    };
  }

  const updates = { status: newStatus, updated_at: now };
  if (status === 'success') updates.paid_at = now;

  const { error: updateError } = await supabase
    .from('oresto_payments')
    .update(updates)
    .eq('id', payment.id);

  if (updateError) {
    console.error('Payment update failed:', updateError);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Update failed' }),
    };
  }

  console.log(`Payment ${payment.id} updated: ${newStatus}`);

  if (status === 'success' && payment.subscription_id) {
    const { data: plan, error: planError } = await supabase
      .from('formulas')
      .select('meals_per_week')
      .eq('id', payment.subscription_id)
      .maybeSingle();

    if (planError) {
      console.error('Formula lookup failed:', planError);
    }

    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        start_date: now,
        ...(plan?.meals_per_week != null ? { meals_remaining: plan.meals_per_week } : {}),
      })
      .eq('id', payment.subscription_id);

    if (subError) console.error('Subscription activation failed:', subError);
    else console.log(`Subscription ${payment.subscription_id} activated`);
  }

  const { error: auditError } = await supabase.from('payment_callbacks').insert({
    payment_id: payment.id,
    provider: 'intouch',
    transaction_id,
    reference: safeReference,
    amount,
    status: newStatus,
    raw_payload: payload,
    ip: clientIp,
    created_at: now,
  });
  if (auditError) console.error('Callback audit insert failed:', auditError);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ success: true, payment_id: payment.id, status: newStatus }),
  };
};