-- =====================================================================
-- O RESTO — MIGRATION 2026-10 : identité parent, cycles, déduplication
-- ---------------------------------------------------------------------
-- À exécuter dans le SQL Editor de Supabase. Idempotent : ré-exécutable
-- sans erreur.
--
-- Ce que ce script fait, dans l'ordre :
--   1. Ouvre le champ `cycle` aux 4 cycles (maternelle, primaire,
--      college, lycee).
--   2. Donne au parent une identité unique : son NUMÉRO de téléphone.
--      Les fiches héritées (« awa », « parent1 ») sont ramenées au numéro
--      et leurs enfants / abonnements suivent.
--   3. Supprime les DOUBLONS d'enfants (même parent, même prénom, nom,
--      classe) — c'est la source des doublons de QR Cartes.
--   4. Pose les index d'unicité qui rendent les doublons IMPOSSIBLES
--      désormais (en base, pas seulement dans l'interface).
--
-- ⚠ Sauvegardez la base avant : le script supprime des lignes en double.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. CYCLES : maternelle / primaire / college / lycee
-- ---------------------------------------------------------------------
ALTER TABLE children ADD COLUMN IF NOT EXISTS cycle TEXT;

DO $$
BEGIN
  -- On élargit la contrainte existante (primaire/lycee) aux 4 cycles.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'children_cycle_check'
  ) THEN
    ALTER TABLE children DROP CONSTRAINT children_cycle_check;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE children ADD CONSTRAINT children_cycle_check
    CHECK (cycle IN ('maternelle', 'primaire', 'college', 'lycee'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE children ALTER COLUMN cycle SET DEFAULT 'primaire';

-- Les classes déjà saisies sont recalées sur le bon cycle.
-- CIA/CIB/CIC/CID = Cours d'Initiation (primaire).
UPDATE children SET cycle = 'primaire' WHERE cycle IS NULL OR cycle = 'primaire';
UPDATE children SET cycle = 'maternelle'
 WHERE lower(trim(class_name)) IN ('petite section', 'moyenne section', 'grande section');
UPDATE children SET cycle = 'college'
 WHERE lower(trim(class_name)) IN ('6eme', '6ème', '5eme', '5ème', '4eme', '4ème', '3eme', '3ème');
UPDATE children SET cycle = 'lycee'
 WHERE lower(trim(class_name)) IN ('seconde', 'premiere', 'première', 'terminale');

DO $$
BEGIN
  ALTER TABLE children ALTER COLUMN cycle SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;  -- des lignes hors cycle restent : on ne casse rien
END $$;

CREATE INDEX IF NOT EXISTS idx_children_cycle ON children(cycle);


-- ---------------------------------------------------------------------
-- 2. IDENTITÉ PARENT = NUMÉRO DE TELEPHONE
-- ---------------------------------------------------------------------
-- Colonne de liaison : le nom d'utilisateur Auth quand il diffère du
-- numéro (comptes de démonstration, anciennes fiches).
ALTER TABLE parent_profiles ADD COLUMN IF NOT EXISTS auth_username TEXT;

-- 2a. Une fiche ne peut avoir qu'un numéro : un numéro = un parent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_profiles_phone
  ON parent_profiles(phone) WHERE phone IS NOT NULL AND phone <> '';

-- 2b. Fiches héritées : on rattache les enfants et les abonnements au
--     numéro, puis on supprime la fiche héritée.
--     On ne touche que les fiches dont le numéro est un vrai mobile SN
--     (9 chiffres, 6 ou 7) — les autres restent inchangées.
DO $$
DECLARE
  legacy record;
BEGIN
  FOR legacy IN
    SELECT p.parent_username AS old_username, p.phone
      FROM parent_profiles p
     WHERE p.phone ~ '^[67][0-9]{8}$'
       AND p.parent_username <> p.phone
       AND NOT EXISTS (
         SELECT 1 FROM parent_profiles q WHERE q.parent_username = p.phone
       )
  LOOP
    UPDATE children       SET parent_username = legacy.phone WHERE parent_username = legacy.old_username;
    UPDATE subscriptions  SET client_username = legacy.phone WHERE client_username = legacy.old_username;
    UPDATE oresto_payments SET client_username = legacy.phone WHERE client_username = legacy.old_username;
    UPDATE validations     SET client_username = legacy.phone WHERE client_username = legacy.old_username;

    UPDATE parent_profiles
       SET parent_username = legacy.phone,
           auth_username   = legacy.old_username
     WHERE parent_username = legacy.old_username;
  END LOOP;
END $$;

-- 2c. Le compte Auth du parent porte le numéro : on le aligne.
UPDATE users
   SET username = p.phone
  FROM parent_profiles p
 WHERE p.parent_username = p.phone
   AND p.phone ~ '^[67][0-9]{8}$'
   AND users.username = p.auth_username
   AND users.role = 'client'
   AND users.username <> p.phone
   AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.username = p.phone);


-- ---------------------------------------------------------------------
-- 3. DOUBLONS D'ENFANTS
-- ---------------------------------------------------------------------
-- On garde la ligne la PLUS ANCIENNE (created_at) : c'est elle qui porte
-- l'abonnement, la carte prépayée et les validations. Les autres sont
-- supprimées (avec leur portefeuille orphelin).
DELETE FROM children c
 WHERE c.id NOT IN (
   SELECT keep.id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY lower(parent_username), lower(trim(first_name)),
                           lower(trim(last_name)), lower(trim(class_name))
              ORDER BY created_at ASC NULLS FIRST, id ASC
            ) AS rn
       FROM children
   ) keep WHERE keep.rn = 1
 );

-- Portefeuilles orphelins (l'enfant supprimé) : on les efface.
DELETE FROM wallets
 WHERE child_id NOT IN (SELECT id FROM children);

-- Transactions orphelines.
DELETE FROM wallet_transactions
 WHERE child_id NOT IN (SELECT id FROM children);

-- Validations orphelines.
DELETE FROM validations
 WHERE child_id IS NOT NULL
   AND child_id NOT IN (SELECT id FROM children);


-- ---------------------------------------------------------------------
-- 4. UNICITÉ (en base, pas seulement dans l'interface)
-- ---------------------------------------------------------------------
-- Un enfant = un parent + un prénom + un nom + une classe.
-- Cet index rend impossible la création d'un doublon, même par une
-- écriture directe en base ou un import parallel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_children_natural_key
  ON children (
    lower(parent_username),
    lower(trim(first_name)),
    lower(trim(last_name)),
    lower(trim(class_name))
  );

-- Un QR = un élève. (Déjà en place dans le schéma d'origine : on le
-- recrée au cas où, car c'est la garantie anti-doublon de QR.)
DO $$
BEGIN
  ALTER TABLE children ADD CONSTRAINT children_qr_token_key UNIQUE (qr_token);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Un QR de carte = un élève : pas deux élèves avec le même QR.
DELETE FROM children c
 WHERE c.id NOT IN (
   SELECT id FROM (
     SELECT id, ROW_NUMBER() OVER (PARTITION BY qr_token ORDER BY created_at ASC NULLS FIRST, id ASC) AS rn
       FROM children
   ) x WHERE x.rn = 1
 );

-- Vue de contrôle : ce qui reste en doublon (doit être vide).
CREATE OR REPLACE VIEW public.doublons_enfants AS
SELECT lower(parent_username)  AS parent,
       lower(trim(first_name)) AS prenom,
       lower(trim(last_name))  AS nom,
       lower(trim(class_name)) AS classe,
       count(*)                AS occurrences
  FROM children
 GROUP BY 1, 2, 3, 4
HAVING count(*) > 1;
