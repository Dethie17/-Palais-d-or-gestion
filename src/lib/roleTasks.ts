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
 * - La caisse comptant (POS) est tenue par le Gérant de cantine (sans accueil :
 *   tableau de bord, vente POS, menus récréation en lecture, historique).
 * - Les menus du jour sont composés et publiés par le Personnel de service,
 *   qui gère aussi la validation repas, les utilisateurs et l'établissement.
 * - Abonnements, finance et pilotage global : Direction (DG).
 * Utilisé par : Login, Sidebar, Accueil, Profil, Accès réservé.
 */
const SERVICE_TASKS: RoleTask[] = [
  { label: 'Scanner QR caméra / saisie', page: 'validation', detail: 'Contrôle auto : actif, date, solde, anti-double 1/jour' },
  { label: 'Composer les menus du jour', page: 'menu', detail: 'Plats + prix par jour, publication de la semaine' },
  { label: 'Créer les tickets repas', page: 'menu', detail: 'Nom, prix, durée, repas — tous les champs' },
  { label: 'Encaisser abonnements & recharges', page: 'subscriptions', detail: 'Espèces au comptoir, confirmations' },
  { label: 'Voir passages du jour', page: 'validation', detail: 'Servis / refusés en temps réel' },
  { label: 'Gérer les utilisateurs', page: 'users', detail: 'Parents, enfants et comptes du site' },
  { label: 'Gérer les établissements', page: 'establishments', detail: 'Ajouter ou supprimer un site de service' },
  { label: 'Paramètres du site', page: 'settings', detail: 'Comptes, accès et mots de passe' },
  { label: 'Consulter historique service', page: 'history', detail: 'Tracer ce qui a été servi' },
];

const DIRECTION_TASKS: RoleTask[] = [
  { label: 'Tableau de bord + rapports PDF/Excel', page: 'dashboard', detail: 'CA jour/semaine/mois, top produits, graphiques' },
  { label: 'Finance & comptabilité', page: 'finance', detail: 'Ventes, abonnements, solde ISM' },
  { label: 'Suivi des encaissements (lecture)', page: 'subscriptions', detail: 'Paiements Wave, espèces — sans tenir la caisse' },
  { label: 'Abonnés, formules, paiements', page: 'subscriptions', detail: 'CRUD offres, remboursements, annulations' },
  { label: 'Utilisateurs & accès', page: 'users', detail: 'Voir abonnés, comptes et périmètres' },
  { label: 'Paramètres : gérer les gérants', page: 'settings', detail: 'Ajouter/supprimer, réinitialiser mots de passe' },
];

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  client: {
    role: 'client',
    title: 'Parent',
    icon: UserRound,
    mission: 'Inscrivez vos enfants, rechargez leurs QR Cartes et suivez leurs dépenses.',
    color: 'from-green-700 to-green-600',
    tasks: [
      { label: 'Inscrire mes enfants', page: 'children', detail: 'Nom, prénom, classe, un QR unique par enfant' },
      { label: 'Recharger les QR Cartes', page: 'children', detail: 'Wave / Espèces, solde suivi par carte' },
      { label: 'Choisir formule / ticket', page: 'subscription', detail: 'Comparer prix/repas, réserver en 1 clic' },
      { label: 'QR Codes des enfants', page: 'qrcode', detail: 'Badges scannables, export PNG, impression' },
      { label: 'Suivre les dépenses', page: 'history', detail: 'Historique par enfant, soldes restants' },
    ],
    forbidden: ['Valider les repas', 'Créer les menus', 'Voir la caisse', 'Pilotage global'],
    kpis: ['Enfants inscrits', 'Soldes cartes', 'Total dépensé'],
  },
  personnel: {
    role: 'personnel',
    title: 'Personnel de service',
    icon: UtensilsCrossed,
    mission: 'Cantine terrain : menus, validation QR, utilisateurs et établissement.',
    color: 'from-green-700 to-emerald-600',
    tasks: SERVICE_TASKS,
    forbidden: ['Encaisser / Caisse POS', 'Voir chiffre d’affaires'],
    kpis: ['Servis aujourd’hui', 'Refusés aujourd’hui', 'Dernier passage'],
  },
  gestionnaire: {
    role: 'gestionnaire',
    title: 'Gérant de cantine',
    icon: Store,
    mission: 'Vente au comptoir et pilotage du jour : caisse POS, tableau de bord, menus récréation, historique. Sans accueil.',
    color: 'from-slate-800 to-slate-900',
    tasks: [
      { label: 'Tableau de bord de ma cantine', page: 'dashboard', detail: 'Repas jour, abonnés actifs, alertes' },
      { label: 'Vente POS au comptoir', page: 'pos', detail: 'Vente directe, ticket, monnaie rendue' },
      { label: 'Menus récréation (lecture)', page: 'menus', detail: 'Annoncer les plats, la vente se fait à la caisse' },
      { label: 'Consulter l’historique', page: 'history', detail: 'Commandes et passages du jour' },
    ],
    forbidden: ['Gérer les menus cantine (personnel)', 'Gérer les abonnements (personnel / Direction)', 'Valider les repas (personnel)', 'Gérer les utilisateurs (personnel / Direction)'],
    kpis: ['Repas servis (jour)', 'Encaissé du jour', 'Alertes'],
  },
  admin: {
    role: 'admin',
    title: 'Directeur Général',
    icon: Crown,
    mission: 'Pilotage et suivi : tableau de bord, finance, abonnés, utilisateurs, paramètres.',
    color: 'from-orange-600 to-orange-500',
    tasks: DIRECTION_TASKS,
    forbidden: [],
    kpis: ['CA tickets & abos', 'Clients actifs', 'Repas du jour'],
  },
  caissier: {
    role: 'caissier',
    title: 'Personnel de service',
    icon: UtensilsCrossed,
    mission: 'Cantine terrain : menus, validation QR, utilisateurs et établissement.',
    color: 'from-green-700 to-emerald-600',
    tasks: SERVICE_TASKS,
    forbidden: ['Encaisser / Caisse POS', 'Voir chiffre d’affaires'],
    kpis: ['Servis aujourd’hui', 'Refusés aujourd’hui', 'Dernier passage'],
  },
  manager: {
    role: 'manager',
    title: 'Directeur Général',
    icon: Crown,
    mission: 'Pilotage et suivi : tableau de bord, finance, abonnés, utilisateurs, paramètres.',
    color: 'from-orange-600 to-orange-500',
    tasks: DIRECTION_TASKS,
    forbidden: [],
    kpis: ['CA tickets & abos', 'Clients actifs', 'Repas du jour'],
  },
};

export function getRoleDef(role?: UserRole): RoleDefinition {
  if (!role) return ROLE_DEFINITIONS.client;
  return ROLE_DEFINITIONS[role] ?? ROLE_DEFINITIONS.client;
}
