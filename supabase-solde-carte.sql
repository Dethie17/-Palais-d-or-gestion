-- ── O RESTO — Carte prépayée : abonnements payés avec le solde ──────────
-- Moyen 'balance' : le montant de l'abonnement est débité du wallet de l'enfant
-- (wallet_transactions kind 'subscription', method 'card' — déjà autorisé),
-- le paiement est tracé soldé dans oresto_payments (method 'balance'),
-- et l'abonnement est activé aussitôt. Refusé si solde insuffisant.
--
-- BASE EXISTANTE : exécutez ce fichier UNE FOIS dans Supabase SQL Editor,
-- APRÈS supabase-oresto-migration.sql et supabase-ism-wallet.sql.
-- BASE NEUVE : supabase-oresto-migration.sql inclut déjà 'balance', rien à faire.

ALTER TABLE IF EXISTS oresto_payments DROP CONSTRAINT IF EXISTS oresto_payments_method_check;
ALTER TABLE IF EXISTS oresto_payments ADD CONSTRAINT oresto_payments_method_check
  CHECK (method IN ('cash', 'wave', 'mobile_money', 'card', 'balance'));
