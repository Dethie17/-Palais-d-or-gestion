-- ── O RESTO — Paiement InTouch : validation mobile par code ────────────────
-- Moyen 'intouch' : même parcours que Wave (demande pending + code à 6 chiffres,
-- activation automatique après confirmation). Les paiements sont tracés dans
-- oresto_payments avec method = 'intouch'.
--
-- BASE EXISTANTE : exécutez ce fichier UNE FOIS dans Supabase SQL Editor,
-- APRÈS supabase-solde-carte.sql (ou après supabase-install-complet.sql).
-- BASE NEUVE : ajoutez 'intouch' aux listes method ci-dessous si vous rejouez
-- l'installation complète. Idempotent : ré-exécutable sans erreur.

ALTER TABLE IF EXISTS oresto_payments DROP CONSTRAINT IF EXISTS oresto_payments_method_check;
ALTER TABLE IF EXISTS oresto_payments ADD CONSTRAINT oresto_payments_method_check
  CHECK (method IN ('cash', 'wave', 'intouch', 'mobile_money', 'card', 'balance'));

-- Marchand InTouch configurable côté app via :
--   VITE_INTOUCH_MERCHANT_NUMBER (défaut : +221 77 000 00 00)
--   VITE_INTOUCH_MERCHANT_NAME   (défaut : O RESTO)
