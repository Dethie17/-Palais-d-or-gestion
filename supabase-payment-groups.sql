-- Paiement combiné de plusieurs enfants : une seule transaction SycaPay,
-- plusieurs abonnements liés à la même référence.

CREATE TABLE IF NOT EXISTS public.oresto_payment_groups (
  payment_reference TEXT PRIMARY KEY,
  subscription_ids TEXT[] NOT NULL,
  child_ids TEXT[] NOT NULL DEFAULT '{}',
  parent_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.oresto_settle_payment_group(
  p_reference TEXT,
  p_tag TEXT,
  p_provider_tx TEXT DEFAULT NULL,
  p_event_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group public.oresto_payment_groups%ROWTYPE;
  v_payment public.oresto_payments%ROWTYPE;
  v_sub_id TEXT;
  v_formula public.formulas%ROWTYPE;
BEGIN
  SELECT * INTO v_group FROM public.oresto_payment_groups WHERE payment_reference = p_reference;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown');
  END IF;

  SELECT * INTO v_payment FROM public.oresto_payments WHERE reference = p_reference LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown', 'reference', p_reference);
  END IF;
  IF v_payment.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome', 'already', 'reference', p_reference, 'status', v_payment.status);
  END IF;

  IF p_tag IS NULL OR p_tag = 'PENDING' THEN
    RETURN jsonb_build_object('outcome', 'pending', 'reference', p_reference, 'status', v_payment.status);
  END IF;

  UPDATE public.oresto_payments
  SET provider_tx = COALESCE(p_provider_tx, provider_tx), provider_status = p_tag
  WHERE reference = p_reference;

  IF p_tag <> 'SUCCESS' THEN
    UPDATE public.oresto_payments
    SET status = CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END, settled_at = NOW()
    WHERE reference = p_reference AND status = 'pending';
    UPDATE public.subscriptions
    SET status = 'cancelled'
    WHERE id = ANY(v_group.subscription_ids) AND status = 'pending';
    RETURN jsonb_build_object('outcome', 'ignored', 'reference', p_reference, 'status', p_tag);
  END IF;

  FOREACH v_sub_id IN ARRAY v_group.subscription_ids LOOP
    UPDATE public.subscriptions s SET
      status = 'active',
      meals_remaining = GREATEST(s.meals_remaining, f.meals_included)
    FROM public.formulas f
    WHERE s.id = v_sub_id AND s.formula_id = f.id;
  END LOOP;

  UPDATE public.oresto_payments
  SET status = 'paid', paid_at = NOW(), settled_at = NOW()
  WHERE reference = p_reference AND status = 'pending';

  RETURN jsonb_build_object(
    'outcome', 'settled',
    'reference', p_reference,
    'status', 'paid',
    'subscriptionIds', v_group.subscription_ids
  );
END;
$$;

ALTER TABLE public.oresto_payment_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oresto_payment_groups_parent_insert ON public.oresto_payment_groups;
CREATE POLICY oresto_payment_groups_parent_insert ON public.oresto_payment_groups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.oresto_payment_groups TO authenticated;

REVOKE ALL ON FUNCTION public.oresto_settle_payment_group(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oresto_settle_payment_group(TEXT, TEXT, TEXT, TEXT) TO service_role;
