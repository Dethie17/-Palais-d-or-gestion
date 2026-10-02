-- ============================================================
-- O RESTO — Site unique : ISM Thiès
-- Le logiciel ne couvre qu'un seul établissement pour le moment.
-- À exécuter dans le SQL Editor Supabase (idempotent).
-- - Crée le site ISM Thiès (E-ISM)
-- - Rattache l'historique des validations à ce site
-- - Retire les anciens sites démo E1/E2 (sans historique restant)
-- ============================================================

INSERT INTO establishments (id, name, address, manager) VALUES
  ('E-ISM', 'ISM Thiès', 'Thiès, Sénégal', 'Direction ISM')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, address = EXCLUDED.address, manager = EXCLUDED.manager;

UPDATE validations SET establishment_id = 'E-ISM'
WHERE establishment_id IS DISTINCT FROM 'E-ISM';

DELETE FROM establishments WHERE id IN ('E1', 'E2')
  AND NOT EXISTS (SELECT 1 FROM validations WHERE establishment_id = establishments.id);
