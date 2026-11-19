-- ============================================================
-- O RESTO — Correctif webhook SycaPay : eventId perdu à l'insertion
--
-- À exécuter dans le SQL Editor Supabase (projet de production).
-- Idempotent : ré-exécutable sans effet si le correctif est déjà en place.
--
-- oresto_settle_payment et oresto_settle_topup déclaraient trois colonnes
-- pour deux expressions :
--
--   INSERT INTO sycapay_events (event_id, reference, tag)
--   VALUES (p_reference, p_tag);
--
-- Toute notification v2 portant un eventId levait donc
-- « INSERT has more target columns than expressions » (42601), le webhook
-- répondait 500 et SycaPay rejouait la notification sans jamais solder :
-- seuls les rattrapages POST /statusV2 aboutissaient.
--
-- Ce bloc ne réinstalle pas les fonctions depuis un fichier : il corrige la
-- seule ligne fautive dans la définition actuellement déployée, quelle que
-- soit sa version (fix-mois-futurs, patch 2026-10, TOUT-EXECUTER, …).
-- ============================================================

DO $$
DECLARE
  r RECORD;
  def TEXT;
  fixed TEXT;
  corrected INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('oresto_settle_payment', 'oresto_settle_topup')
  LOOP
    def := pg_get_functiondef(r.oid);
    fixed := regexp_replace(
      def,
      'INSERT\s+INTO\s+(?:public\.)?sycapay_events\s*\(\s*event_id\s*,\s*reference\s*,\s*tag\s*\)\s*VALUES\s*\(\s*p_reference\s*,\s*p_tag\s*\)',
      'INSERT INTO sycapay_events (event_id, reference, tag) VALUES (p_event_id, p_reference, p_tag)',
      'gi'
    );
    IF fixed = def THEN
      RAISE NOTICE 'Rien à corriger : % (déjà conforme)', r.proname;
    ELSE
      EXECUTE fixed;
      corrected := corrected + 1;
      RAISE NOTICE 'Corrigé : %', r.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'Fonctions corrigées : %', corrected;
END $$;

-- Contrôle final : doit renvoyer 0 ligne.
SELECT n.nspname AS schema, p.proname AS fonction
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('oresto_settle_payment', 'oresto_settle_topup')
  AND pg_get_functiondef(p.oid) ILIKE '%VALUES (p_reference, p_tag)%';
