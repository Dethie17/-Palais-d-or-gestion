import { PageName } from '@/types/menu';
import { UserRole } from '@/context/AuthContext';
import {
  UserRound,
  UtensilsCrossed,
  Store,
  Crown,
  type LucideIcon,
} from 'lucide-react';

export interface RoleTask {
  label: string;
  page?: PageName;
  detail: string;
}

export interface RoleDefinition {
  role: UserRole;
  title: string;
  /** Icône Lucide officielle du profil (plus d'emoji). */
  icon: LucideIcon;
  mission: string;
  color: string;
  tasks: RoleTask[];
  forbidden: string[];
  kpis: string[];
}

/**
 * Référentiel unique des profils O RESTO.
 * - La caisse comptant (POS) est réservée au Gérant de cantine.
 * - Le Directeur Général supervise (lecture des encaissements, rapports)
 *   mais ne tient pas la caisse.
 * Utilisé par : Login, Sidebar, Accueil, Profil, Accès réservé.
 */
export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  client: {
    role: 'client',
    title: 'Client',
    icon: UserRound,
    mission: 'Consultez les menus, payez en ligne et présentez votre QR Code.',
    color: 'from-blue-500 to-indigo-600',
    tasks: [
      { label: 'Consulter menus semaine + carte', page: 'menus', detail: 'Voir menu du jour et catalogue, sans modifier' },
      { label: 'Choisir formule / ticket', page: 'subscription', detail: 'Comparer prix/repas, réserver en 1 clic' },
      { label: 'Payer Wave / Espèces', page: 'subscription', detail: 'Activation après confirmation mobile ou encaissement comptoir' },
      { label: 'Présenter mon QR Code', page: 'qrcode', detail: 'Badge scannable, export PNG, impression' },
      { label: 'Suivre ma consommation', page: 'history', detail: 'Repas validés, reçus, solde restant' },
    ],
    forbidden: ['Valider les repas', 'Créer les menus', 'Voir la caisse', 'Pilotage global'],
    kpis: ['Repas restants', 'Jours avant expiration', 'Total dépensé'],
  },
  personnel: {
    role: 'personnel',
    title: 'Personnel de service',
    icon: UtensilsCrossed,
    mission: 'Contrôle des QR Code et fluidité du service.',
    color: 'from-emerald-500 to-teal-600',
    tasks: [
      { label: 'Scanner QR caméra / saisie', page: 'validation', detail: 'Contrôle auto : actif, date, solde, anti-double 1/jour' },
      { label: 'Voir menu du jour servi', page: 'menus', detail: 'Lecture seule pour annoncer les plats' },
      { label: 'Voir passages du jour', page: 'validation', detail: 'Servis / refusés en temps réel' },
      { label: 'Consulter historique service', page: 'history', detail: 'Tracer ce qui a été servi' },
    ],
    forbidden: ['Encaisser / Caisse POS', 'Créer ou modifier menus', 'Gérer abonnements', 'Voir chiffre d’affaires'],
    kpis: ['Servis aujourd’hui', 'Refusés aujourd’hui', 'Dernier passage'],
  },
  gestionnaire: {
    role: 'gestionnaire',
    title: 'Gérant de cantine',
    icon: Store,
    mission: 'Pilotage de votre cantine : menus, abonnés, validations et caisse comptant (seul habilité).',
    color: 'from-violet-500 to-purple-600',
    tasks: [
      { label: 'Tableau de bord de ma cantine', page: 'dashboard', detail: 'Repas jour, abonnés actifs, alertes expiration' },
      { label: 'Caisse POS comptant', page: 'pos', detail: 'Seul à tenir la caisse : vente directe, ticket, monnaie rendue' },
      { label: 'Créer / publier les menus', page: 'menu', detail: 'CRUD plats, disponibilité = publication' },
      { label: 'Gérer abonnés + encaisser espèces', page: 'subscriptions', detail: 'Activer après paiement comptoir, annuler' },
      { label: 'Gérer ma cantine', page: 'establishments', detail: 'Adresse, responsable, téléphone' },
      { label: 'Valider les repas (renfort)', page: 'validation', detail: 'Même contrôle que le personnel' },
    ],
    forbidden: ['Pilotage multi-sites global', 'Gérer les gérants', 'Supprimer les données'],
    kpis: ['Repas servis (jour)', 'Abonnements actifs', 'Paiements en attente'],
  },
  admin: {
    role: 'admin',
    title: 'Directeur Général',
    icon: Crown,
    mission: 'Supervision globale : sites, abonnés, rapports. La caisse comptant est tenue par le Gérant.',
    color: 'from-orange-500 to-red-600',
    tasks: [
      { label: 'Tableau de bord + rapports PDF/Excel', page: 'dashboard', detail: 'CA jour/semaine/mois, top produits, graphiques' },
      { label: 'Suivi des encaissements (lecture)', page: 'subscriptions', detail: 'Paiements Wave, espèces — sans tenir la caisse' },
      { label: 'Abonnés, formules, paiements', page: 'subscriptions', detail: 'CRUD offres, remboursements, annulations' },
      { label: 'Utilisateurs & accès', page: 'users', detail: 'Voir abonnés, comptes et périmètres' },
      { label: 'Paramètres : gérer les gérants', page: 'settings', detail: 'Ajouter/supprimer, réinitialiser mots de passe' },
      { label: 'Menus + cantines + validation', page: 'menu', detail: 'Supervision complète multi-sites' },
    ],
    forbidden: ['Tenir la caisse POS (réservé au Gérant)'],
    kpis: ['CA tickets & abos', 'Clients actifs', 'Repas du jour'],
  },
  caissier: {
    role: 'caissier',
    title: 'Personnel de service',
    icon: UtensilsCrossed,
    mission: 'Contrôle des QR Code et fluidité du service.',
    color: 'from-emerald-500 to-teal-600',
    tasks: [
      { label: 'Scanner QR caméra / saisie', page: 'validation', detail: 'Contrôle auto : actif, date, solde, anti-double 1/jour' },
      { label: 'Voir menu du jour servi', page: 'menus', detail: 'Lecture seule pour annoncer les plats' },
      { label: 'Voir passages du jour', page: 'validation', detail: 'Servis / refusés en temps réel' },
      { label: 'Consulter historique service', page: 'history', detail: 'Tracer ce qui a été servi' },
    ],
    forbidden: ['Encaisser / Caisse POS', 'Créer ou modifier menus', 'Gérer abonnements'],
    kpis: ['Servis aujourd’hui', 'Refusés aujourd’hui'],
  },
  manager: {
    role: 'manager',
    title: 'Directeur Général',
    icon: Crown,
    mission: 'Supervision globale : sites, abonnés, rapports. La caisse comptant est tenue par le Gérant.',
    color: 'from-orange-500 to-red-600',
    tasks: [
      { label: 'Tableau de bord + rapports PDF/Excel', page: 'dashboard', detail: 'CA jour/semaine/mois, top produits, graphiques' },
      { label: 'Suivi des encaissements (lecture)', page: 'subscriptions', detail: 'Paiements Wave, espèces — sans tenir la caisse' },
      { label: 'Abonnés, formules, paiements', page: 'subscriptions', detail: 'CRUD offres, remboursements' },
      { label: 'Utilisateurs & accès', page: 'users', detail: 'Voir abonnés, comptes et périmètres' },
      { label: 'Paramètres : gérer les gérants', page: 'settings', detail: 'Ajouter/supprimer, réinitialiser mots de passe' },
      { label: 'Menus + cantines + validation', page: 'menu', detail: 'Supervision complète' },
    ],
    forbidden: ['Tenir la caisse POS (réservé au Gérant)'],
    kpis: ['CA tickets & abos', 'Clients actifs', 'Repas du jour'],
  },
};

export function getRoleDef(role?: UserRole): RoleDefinition {
  if (!role) return ROLE_DEFINITIONS.client;
  return ROLE_DEFINITIONS[role] ?? ROLE_DEFINITIONS.client;
}
