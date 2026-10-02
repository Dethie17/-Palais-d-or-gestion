-- ── O RESTO — Remise à zéro des menus (UNE FOIS) ───────────────────
-- Contexte : les premières installations contenaient des plats d'exemple.
-- Règle actuelle : un jour n'existe que si le DG l'a composé (items non vide).
-- Ce script vide les 5 jours (noms + plats) pour repartir de zéro :
-- la section Menus affichera le bel état "Menus en préparation"
-- jusqu'à la prochaine publication complète (5/5) depuis Gestion du menu.
-- Idempotent : ré-exécutable sans erreur (mais efface à chaque fois !).

UPDATE weekly_menus
SET name = '', description = '', items = '[]', updated_at = NOW()
WHERE day IN ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi');
