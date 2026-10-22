-- ============================================================
-- O RESTO — Patch 2026-10 : tickets journaliers, recharge
-- multiple, compte parent inactif, expiration fin de mois.
-- Exécuter APRÈS supabase-...-migration.sql + supabase-sycapay-TOUT-EXECUTER.sql
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

-- 1. Lien entre une recharge de carte prépayée et le paiement (recharge multiple)
ALTER TABLE IF EXISTS wallet_transactions ADD COLUMN IF NOT EXISTS payment_id TEXT;
CREATE INDEX IF NOT EXISTS idx_wallettx_payment_id ON wallet_transactions(payment_id);

-- 2. Règlement d'un paiement : mise à jour d'oresto_settle_payment
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
  v_sub subscriptions%ROWTYPE;
  v_formula formulas%ROWTYPE;
  v_active subscriptions%ROWTYPE;
  v_added INTEGER := 0;
  v_qr TEXT;
  v_inactive_key TEXT;
  v_end_of_month TIMESTAMPTZ;
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

  UPDATE oresto_payments SET
    provider = COALESCE(provider, p_provider),
    provider_tx = COALESCE(p_provider_tx, provider_tx),
    provider_status = COALESCE(p_status, p_tag),
    provider_error = CASE
      WHEN p_error_code IS NULL THEN provider_error
      ELSE p_error_code || CASE WHEN p_error_message IS NULL THEN '' ELSE ' — ' || p_error_message END
    END
  WHERE id = v_pay.id;

  IF p_tag IS NULL OR p_tag = 'PENDING' THEN
    RETURN jsonb_build_object('outcome', 'pending', 'reference', p_reference, 'status', v_pay.status);
  END IF;

  IF p_tag <> 'SUCCESS' THEN
    UPDATE oresto_payments SET
      status = CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
      settled_at = NOW()
    WHERE id = v_pay.id AND status = 'pending';
    RETURN jsonb_build_object(
      'outcome', 'ignored', 'reference', p_reference,
      'status', CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
      'errorCode', p_error_code,
      'errorMessage', p_error_message,
      'eventType', p_event_type);
  END IF;

  -- ── Fin du mois civil (expiration des repas achetés) ────────────────
  -- Tous les repas (abonnements et tickets) expirent le dernier jour du
  -- mois civil à 23:59:59.
  v_end_of_month := DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second';

  -- Un compte parent inactif est réactivé dès qu'un de ses paiements réussit.
  IF v_pay.client_username IS NOT NULL THEN
    v_inactive_key := 'inactive_parent_' || v_pay.client_username;
  END IF;

  -- ── Réussite : abonnement ────────────────────────────────────────────
  IF v_pay.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM subscriptions WHERE id = v_pay.subscription_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'unknown_subscription', 'reference', p_reference);
    END IF;
    v_inactive_key := 'inactive_parent_' || v_sub.client_username;

    -- Ticket du jour (pseudo-formule hors « formulas ») : +1 repas sur la
    -- carte de l'enfant, sans expirer l'abonnement actif de l'enfant.
    IF v_sub.formula_id = 'TICKET-JOUR' THEN
      UPDATE subscriptions SET
        status = 'active',
        meals_remaining = meals_remaining + 1,
        start_date = NOW(),
        end_date = v_end_of_month
      WHERE id = v_sub.id;
      DELETE FROM finance_settings WHERE key = v_inactive_key;
      UPDATE oresto_payments SET status = 'paid', settled_at = NOW()
        WHERE id = v_pay.id AND status = 'pending';
      RETURN jsonb_build_object(
        'outcome', 'settled', 'reference', p_reference, 'status', 'paid',
        'mealsRemaining', v_sub.meals_remaining + 1);
    END IF;

    SELECT * INTO v_formula FROM formulas WHERE id = v_sub.formula_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'unknown_formula', 'reference', p_reference);
    END IF;

    UPDATE subscriptions SET
      status = 'active',
      meals_remaining = GREATEST(meals_remaining, v_formula.meals_included),
      start_date = NOW(),
      end_date = v_end_of_month
    WHERE id = v_sub.id;

    -- Un seul abonnement actif par bénéficiaire.
    UPDATE subscriptions SET status = 'expired'
    WHERE id <> v_sub.id AND status = 'active'
      AND (
        (v_sub.child_id IS NOT NULL AND child_id = v_sub.child_id)
        OR (v_sub.child_id IS NULL AND child_id IS NULL AND client_username = v_sub.client_username)
      );

    DELETE FROM finance_settings WHERE key = v_inactive_key;

    UPDATE oresto_payments SET status = 'paid', settled_at = NOW()
      WHERE id = v_pay.id AND status = 'pending';
    RETURN jsonb_build_object(
      'outcome', 'settled', 'reference', p_reference, 'status', 'paid',
      'subscriptionId', v_sub.id,
      'mealsRemaining', GREATEST(v_sub.meals_remaining, v_formula.meals_included));
  END IF;

  -- ── Réussite : recharge multiple (plusieurs cartes, un paiement) ------
  IF v_pay.subscription_id IS NULL AND v_pay.formula_id = 'TOPUP-MULTI' THEN
    INSERT INTO wallets (child_id, balance, updated_at)
    SELECT wt.child_id, SUM(wt.amount), NOW()
    FROM wallet_transactions wt
    WHERE wt.payment_id = v_pay.id AND wt.status = 'pending'
    GROUP BY wt.child_id
    ON CONFLICT (child_id) DO UPDATE SET
      balance = wallets.balance + EXCLUDED.balance,
      updated_at = NOW();

    UPDATE wallet_transactions SET status = 'paid', settled_at = NOW()
      WHERE payment_id = v_pay.id AND status = 'pending';
    UPDATE oresto_payments SET status = 'paid', settled_at = NOW()
      WHERE id = v_pay.id AND status = 'pending';
    RETURN jsonb_build_object('outcome', 'settled', 'reference', p_reference, 'status', 'paid');
  END IF;

  -- ── Réussite : ticket repas classique (mini-abonnement ou crédits) ----
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
      v_end_of_month,
      'active',
      v_formula.meals_included,
      v_qr,
      v_pay.child_id
    )
    ON CONFLICT (id) DO NOTHING;
    v_added := v_formula.meals_included;
  END IF;

  DELETE FROM finance_settings WHERE key = v_inactive_key;

  UPDATE oresto_payments SET status = 'paid', settled_at = NOW()
    WHERE id = v_pay.id AND status = 'pending';
  RETURN jsonb_build_object(
    'outcome', 'settled', 'reference', p_reference, 'status', 'paid', 'addedMeals', v_added);
END $$;

-- 3. (inchange) oresto_settle_topup et oresto_register_provider_tx restent
--    identiques : recréation évitée, seule la section ci-dessus change.
