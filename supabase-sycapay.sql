-- ============================================================
-- O RESTO — Passerelle de paiement SycaPay (mobile money SN + carte)
-- À exécuter dans le SQL Editor Supabase APRÈS :
--   supabase-oresto-migration.sql, supabase-oresto-full.sql,
--   supabase-ism-wallet.sql, supabase-solde-carte.sql
-- Idempotent : ré-exécutable sans erreur.
--
-- Ce que ce script installe :
--   1. Les colonnes provider sur oresto_payments et wallet_transactions
--      (transaction SycaPay, état opérateur, lien/QR de paiement, erreur).
--   2. La table sycapay_events : idempotence des notifications SycaPay
--      (une même notification peut être livrée plusieurs fois).
--   3. Deux fonctions de RÈGLEMENT appelées par le webhook et par le
--      rattrapage POST /statusV2. Elles sont le SEUL endroit où un
--      paiement externe devient « payé » : ni le navigateur ni le client
--      ne décident d'un encaissement.
--
-- Règle rappelée par la doc SycaPay : rien n'est payé tant que le
-- webhook ne l'a pas dit (data.tag). Le 201 d'initiation et le retour du
-- client sur url_success ne concluent rien.
-- ============================================================

-- 1. Colonnes provider — paiements ---------------------------------------
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider_tx TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider_error TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider_url TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider_qr TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider_deep_links TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS provider_expires_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
-- Rappel du contexte de règlement : l'abonnement créé par le back-office
-- n'a pas toujours child_id, et le QR personnel est calculé côté client.
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS child_id TEXT;
ALTER TABLE IF EXISTS oresto_payments ADD COLUMN IF NOT EXISTS qr_token TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oresto_payments_child_fk') THEN
    ALTER TABLE oresto_payments ADD CONSTRAINT oresto_payments_child_fk
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_provider_tx ON oresto_payments(provider, provider_tx);
CREATE INDEX IF NOT EXISTS idx_payments_pending ON oresto_payments(status) WHERE status = 'pending';

-- 2. Colonnes provider — recharges carte prépayée -------------------------
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider_tx TEXT;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider_error TEXT;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider_qr TEXT;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider_deep_links TEXT;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider_url TEXT;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS provider_expires_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wallettx_provider_tx ON wallet_transactions(provider, provider_tx);
CREATE INDEX IF NOT EXISTS idx_wallettx_pending ON wallet_transactions(status) WHERE status = 'pending';

-- 3. Idempotence des notifications SycaPay -------------------------------
-- eventId sert de clé : une notification rejouée ne rejoue pas le règlement.
CREATE TABLE IF NOT EXISTS sycapay_events (
  event_id TEXT PRIMARY KEY,
  reference TEXT,
  tag TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sycapay_events_ref ON sycapay_events(reference);

ALTER TABLE sycapay_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_sycapay_events ON sycapay_events;
-- Lecture seule depuis l'app (écran d'historique) ; l'insertion reste
-- reservee au webhook (cle de service).
CREATE POLICY open_sycapay_events ON sycapay_events FOR SELECT USING (true);

-- 4. Règlement d'un paiement ---------------------------------------------
-- Appele par POST /api/sycapay/webhook et par POST /api/sycapay/status.
-- Renvoie { outcome, reference, status, ... } :
--   settled    — le paiement vient d'être soldé par cet appel
--   already    — déjà soldé (notification rejouée, double appel)
--   pending    — la transaction n'est pas encore finalisée chez SycaPay
--   unknown    — aucune ligne ne porte cette référence
--   ignored    — ni payer ni failed (transaction annulée)
CREATE OR REPLACE FUNCTION oresto_settle_payment(
  p_reference TEXT,
  p_tag TEXT,
  p_provider TEXT DEFAULT 'sycapay',
  p_provider_tx TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_event_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_pay oresto_payments%ROWTYPE;
  v_formula formulas%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
  v_active subscriptions%ROWTYPE;
  v_added INTEGER := 0;
  v_qr TEXT;
BEGIN
  -- Idempotence : un eventId déjà vu ne fait rien.
  IF p_event_id IS NOT NULL THEN
    INSERT INTO sycapay_events (event_id, reference, tag) VALUES (p_reference, p_tag)
    ON CONFLICT (event_id) DO NOTHING;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'duplicate', 'reference', p_reference);
    END IF;
  END IF;

  SELECT * INTO v_pay FROM oresto_payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown', 'reference', p_reference);
  END IF;

  IF v_pay.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'outcome', 'already', 'reference', p_reference, 'status', v_pay.status);
  END IF;

  -- Trace opérateur, quel que soit l'issue.
  UPDATE oresto_payments SET
    provider = COALESCE(provider, p_provider),
    provider_tx = COALESCE(p_provider_tx, provider_tx),
    provider_status = COALESCE(p_status, p_tag),
    provider_error = CASE
      WHEN p_error_code IS NULL THEN provider_error
      ELSE p_error_code || CASE WHEN p_error_message IS NULL THEN '' ELSE ' — ' || p_error_message END
    END
  WHERE id = v_pay.id;

  -- Pas une finalisation : rien à solder.
  IF p_tag IS NULL OR p_tag = 'PENDING' THEN
    RETURN jsonb_build_object('outcome', 'pending', 'reference', p_reference, 'status', v_pay.status);
  END IF;

  -- Échec ou annulation : le paiement est clos, AUCUN droit n'est accordé.
  IF p_tag <> 'SUCCESS' THEN
    UPDATE oresto_payments SET
      status = CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
      settled_at = NOW()
    WHERE id = v_pay.id AND status = 'pending';
    RETURN jsonb_build_object(
      'outcome', 'ignored',
      'reference', p_reference,
      'status', CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
      'errorCode', p_error_code,
      'errorMessage', p_error_message,
      'eventType', p_event_type);
  END IF;

  -- ── Réussite ──────────────────────────────────────────────────────────
  -- Abonnement : la cible existe déjà, on l'active.
  IF v_pay.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM subscriptions WHERE id = v_pay.subscription_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'unknown_subscription', 'reference', p_reference);
    END IF;
    SELECT * INTO v_formula FROM formulas WHERE id = v_sub.formula_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'unknown_formula', 'reference', p_reference);
    END IF;

    UPDATE subscriptions SET
      status = 'active',
      meals_remaining = GREATEST(meals_remaining, v_formula.meals_included),
      start_date = NOW(),
      end_date = NOW() + (v_formula.duration_days || ' days')::INTERVAL
    WHERE id = v_sub.id;

    -- Un seul abonnement actif par bénéficiaire.
    UPDATE subscriptions SET status = 'expired'
    WHERE id <> v_sub.id AND status = 'active'
      AND (
        (v_sub.child_id IS NOT NULL AND child_id = v_sub.child_id)
        OR (v_sub.child_id IS NULL AND child_id IS NULL AND client_username = v_sub.client_username)
      );

    UPDATE oresto_payments SET status = 'paid', settled_at = NOW() WHERE id = v_pay.id AND status = 'pending';
    RETURN jsonb_build_object(
      'outcome', 'settled', 'reference', p_reference, 'status', 'paid',
      'subscriptionId', v_sub.id, 'mealsRemaining', GREATEST(v_sub.meals_remaining, v_formula.meals_included));
  END IF;

  -- Ticket : on crédite des repas sur l'abonnement actif du bénéficiaire,
  -- sinon on crée le mini-abonnement « ticket ».
  IF v_pay.formula_id IS NULL OR v_pay.client_username IS NULL THEN
    RETURN jsonb_build_object('outcome', 'ignored', 'reference', p_reference, 'status', v_pay.status,
      'reason', 'ni abonnement ni intention ticket sur ce paiement');
  END IF;

  SELECT * INTO v_formula FROM formulas WHERE id = v_pay.formula_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_formula', 'reference', p_reference);
  END IF;

  SELECT * INTO v_active FROM subscriptions
  WHERE status = 'active'
    AND (
      (v_pay.child_id IS NOT NULL AND child_id = v_pay.child_id)
      OR (v_pay.child_id IS NULL AND client_username = v_pay.client_username)
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE subscriptions SET meals_remaining = meals_remaining + v_formula.meals_included
    WHERE id = v_active.id;
    v_added := v_formula.meals_included;
  ELSE
    v_qr := COALESCE(v_pay.qr_token,
      (SELECT qr_token FROM subscriptions
        WHERE client_username = v_pay.client_username AND qr_token IS NOT NULL
        ORDER BY created_at DESC LIMIT 1),
      'ORESTO-' || UPPER(SUBSTRING(MD5(v_pay.client_username) FROM 1 FOR 6)));
    INSERT INTO subscriptions
      (id, client_username, formula_id, start_date, end_date, status, meals_remaining, qr_token, child_id)
    VALUES (
      'S-' || UPPER(SUBSTRING(MD5(v_pay.reference || NOW()::TEXT) FROM 1 FOR 10)),
      v_pay.client_username,
      v_pay.formula_id,
      NOW(),
      NOW() + (v_formula.duration_days || ' days')::INTERVAL,
      'active',
      v_formula.meals_included,
      v_qr,
      v_pay.child_id
    )
    ON CONFLICT (id) DO NOTHING;
    v_added := v_formula.meals_included;
  END IF;

  UPDATE oresto_payments SET status = 'paid', settled_at = NOW() WHERE id = v_pay.id AND status = 'pending';
  RETURN jsonb_build_object(
    'outcome', 'settled', 'reference', p_reference, 'status', 'paid', 'addedMeals', v_added);
END $$;

-- 5. Règlement d'une recharge de carte prépayée --------------------------
CREATE OR REPLACE FUNCTION oresto_settle_topup(
  p_reference TEXT,
  p_tag TEXT,
  p_provider TEXT DEFAULT 'sycapay',
  p_provider_tx TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_event_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_balance NUMERIC := 0;
BEGIN
  IF p_event_id IS NOT NULL THEN
    INSERT INTO sycapay_events (event_id, reference, tag) VALUES (p_reference, p_tag)
    ON CONFLICT (event_id) DO NOTHING;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'duplicate', 'reference', p_reference);
    END IF;
  END IF;

  SELECT * INTO v_tx FROM wallet_transactions WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown', 'reference', p_reference);
  END IF;

  IF v_tx.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome', 'already', 'reference', p_reference, 'status', v_tx.status);
  END IF;

  UPDATE wallet_transactions SET
    provider = COALESCE(provider, p_provider),
    provider_tx = COALESCE(p_provider_tx, provider_tx),
    provider_status = COALESCE(p_status, p_tag),
    provider_error = CASE
      WHEN p_error_code IS NULL THEN provider_error
      ELSE p_error_code || CASE WHEN p_error_message IS NULL THEN '' ELSE ' — ' || p_error_message END
    END
  WHERE id = v_tx.id;

  IF p_tag IS NULL OR p_tag = 'PENDING' THEN
    RETURN jsonb_build_object('outcome', 'pending', 'reference', p_reference, 'status', v_tx.status);
  END IF;

  IF p_tag <> 'SUCCESS' THEN
    UPDATE wallet_transactions SET
      status = CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
      settled_at = NOW()
    WHERE id = v_tx.id AND status = 'pending';
    RETURN jsonb_build_object(
      'outcome', 'ignored', 'reference', p_reference,
      'status', CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
      'errorCode', p_error_code, 'errorMessage', p_error_message);
  END IF;

  -- Crédit atomique du solde (INSERT … ON CONFLICT : pas de lecture-écriture).
  SELECT COALESCE(balance, 0) INTO v_balance FROM wallets WHERE child_id = v_tx.child_id;
  INSERT INTO wallets (child_id, balance, updated_at) VALUES (v_tx.child_id, v_tx.amount, NOW())
  ON CONFLICT (child_id) DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = NOW();

  UPDATE wallet_transactions SET status = 'paid', settled_at = NOW() WHERE id = v_tx.id AND status = 'pending';
  RETURN jsonb_build_object(
    'outcome', 'settled', 'reference', p_reference, 'status', 'paid',
    'amount', v_tx.amount, 'balance', v_balance + v_tx.amount);
END $$;

-- 6. Enregistrement d'une transaction ouverte (initiation / relance) ------
-- Le navigateur appelle ce RPC en passant par le serveur : il note la
-- transaction opérateur et le lien / QR à afficher, sans jamais solder.
CREATE OR REPLACE FUNCTION oresto_register_provider_tx(
  p_reference TEXT,
  p_provider TEXT,
  p_provider_tx TEXT,
  p_url TEXT DEFAULT NULL,
  p_qr TEXT DEFAULT NULL,
  p_deep_links TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_found INTEGER := 0;
BEGIN
  UPDATE oresto_payments SET
    provider = p_provider, provider_tx = p_provider_tx, provider_status = 'PENDING',
    provider_url = COALESCE(p_url, provider_url),
    provider_qr = COALESCE(p_qr, provider_qr),
    provider_deep_links = COALESCE(p_deep_links, provider_deep_links),
    provider_expires_at = COALESCE(p_expires_at, provider_expires_at),
    provider_error = NULL
  WHERE reference = p_reference AND status = 'pending';
  GET DIAGNOSTICS v_found = ROW_COUNT;

  UPDATE wallet_transactions SET
    provider = p_provider, provider_tx = p_provider_tx, provider_status = 'PENDING',
    provider_url = COALESCE(p_url, provider_url),
    provider_qr = COALESCE(p_qr, provider_qr),
    provider_deep_links = COALESCE(p_deep_links, provider_deep_links),
    provider_expires_at = COALESCE(p_expires_at, provider_expires_at),
    provider_error = NULL
  WHERE reference = p_reference AND status = 'pending';
  GET DIAGNOSTICS v_found = v_found + ROW_COUNT;

  RETURN jsonb_build_object('updated', v_found);
END $$;

-- 7. Marquage d'échec sans transaction (refus à l'initiation) -------------
-- Un refus de l'opérateur ne laisse pas de transaction : le navigateur
-- referme lui-même sa demande.
CREATE OR REPLACE FUNCTION oresto_fail_payment(
  p_reference TEXT,
  p_error_code TEXT,
  p_error_message TEXT,
  p_provider TEXT DEFAULT 'sycapay'
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_found INTEGER := 0;
BEGIN
  UPDATE oresto_payments SET
    provider = COALESCE(provider, p_provider),
    status = 'failed', provider_error = p_error_code || ' — ' || COALESCE(p_error_message, ''),
    settled_at = NOW()
  WHERE reference = p_reference AND status = 'pending';
  GET DIAGNOSTICS v_found = ROW_COUNT;

  UPDATE wallet_transactions SET
    provider = COALESCE(provider, p_provider),
    status = 'failed', provider_error = p_error_code || ' — ' || COALESCE(p_error_message, ''),
    settled_at = NOW()
  WHERE reference = p_reference AND status = 'pending';
  GET DIAGNOSTICS v_found = v_found + ROW_COUNT;

  RETURN jsonb_build_object('updated', v_found);
END $$;