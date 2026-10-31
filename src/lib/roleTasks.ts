import { PageName } from '@/types/menu';
import { UserRole } from '@/context/AuthContext';
import {
  UserRound,
  UtensilsCrossed,
  Store,
  Briefcase,
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
 * - La caisse comptant (POS) est tenue par le Caissier seul (sans accueil :
 *   tableau de bord, vente POS, espace repas, historique).
 * - Les menus du jour sont composés et publiés par le Superviseur (Personnel de service),
 *   pour l'espace parent comme pour l'Espace Repas ; il gère aussi la validation repas,
 *   les utilisateurs et l'établissement.
 * - Abonnements, finance et pilotage global : Espace ISM (structure partenaire).
 * Utilisé par : Login, SpaceTopNav, Accueil, Profil, Accès réservé.
 */
const SERVICE_TASKS: RoleTask[] = [
  { label: 'Scanner QR caméra / saisie', page: 'validation', detail: 'Contrôle auto : actif, date, solde, anti-double 1/jour' },
  { label: 'Composer les menus du jour', page: 'menu', detail: 'Plats + prix par jour, publication de la semaine' },
  { label: 'Créer les tickets repas', page: 'menu', detail: 'Nom, prix, durée, repas — tous les champs' },
  { label: 'Encaisser abonnements & recharges', page: 'subscriptions', detail: 'Espèces au comptoir, confirmations' },
  { label: 'Voir passages du jour', page: 'validation', detail: 'Servis / refusés en temps réel' },
  { label: 'Gérer les utilisateurs', page: 'users', detail: 'Parents, enfants et comptes du site — suppression définitive d’un parent' },
  { label: 'Gérer les établissements', page: 'establishments', detail: 'Ajouter ou supprimer un site de service' },
  { label: 'Paramètres du site', page: 'settings', detail: 'Comptes, accès et mots de passe' },
  { label: 'Consulter historique service', page: 'history', detail: 'Tracer ce qui a été servi' },
];

const DIRECTION_TASKS: RoleTask[] = [
  { label: 'Tableau de bord + rapports PDF/Excel', page: 'dashboard', detail: 'CA connecté aux transactions, jour/semaine/mois' },
  { label: 'Finance & répartition', page: 'finance', detail: 'CA connecté aux transactions, répartition ISM / SycaPay / MIAMS' },
  { label: 'Abonnés & paiements (lecture)', page: 'subscriptions', detail: 'Abonnés payés, paiements encaissés, export Excel' },
  { label: 'Utilisateurs & accès', page: 'users', detail: 'Voir parents, enfants et périmètres — supprimer définitivement un parent' },
  { label: 'Import du fichier élèves', page: 'import-eleves', detail: 'Créer les accès parents par numéro de téléphone' },
  { label: 'Historique des commandes', page: 'history', detail: 'Tout ce qui a été vendu ou servi, par enfant' },
];

/** Référentiel du rôle de direction : Espace ISM (structure partenaire). */
const DIRECTION_DEF = {
  title: 'Espace ISM',
  icon: Briefcase,
  mission: 'Pilotage du site : tableau de bord, finance répartition, abonnés, utilisateurs, historique des commandes.',
  color: 'from-slate-600 to-slate-500',
  tasks: DIRECTION_TASKS,
  forbidden: [] as string[],
  kpis: ['CA connecté', 'Abonnés actifs', 'Répartition ISM / MIAMS'],
} satisfies Omit<RoleDefinition, 'role'>;

const SUPERVISOR_TASKS: RoleTask[] = [
  ...SERVICE_TASKS,
  { label: 'Tableau de bord', page: 'dashboard', detail: 'Repas servis, CA, abonnés actifs, alertes' },
  { label: 'Traiter les réclamations', page: 'reclamations', detail: 'Répondre aux parents, publier une annonce' },
  { label: 'Historique des paiements', page: 'paiements', detail: 'Encaissements parents ↔ école : date, heure, statut et export' },
  { label: 'Suivi financier', page: 'finance', detail: 'Ventes, abonnements, solde ISM' },
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
    title: 'Superviseur',
    icon: UtensilsCrossed,
    mission: 'Supervision de la cantine : menus, validation, réclamations, utilisateurs, statistiques et paramètres.',
    color: 'from-green-700 to-emerald-600',
    tasks: SUPERVISOR_TASKS,
    forbidden: [],
    kpis: ['Servis aujourd’hui', 'CA du jour', 'Abonnés actifs', 'Réclamations ouvertes'],
  },
  gestionnaire: {
    role: 'gestionnaire',
    title: 'Caissier',
    icon: Store,
    mission: 'Tenue du comptoir : vente au POS, scan du QR élève pour débiter sa carte prépayée, Espace Repas et historique des ventes.',
    color: 'from-slate-800 to-slate-900',
    tasks: [
      { label: 'Vente POS au comptoir', page: 'pos', detail: 'Vente directe, ticket, monnaie rendue' },
      { label: 'Scanner le QR de l’élève', page: 'pos', detail: 'Débiter la carte prépayée de l’élève, pas de Wave par l’enfant' },
      { label: 'Espace repas', page: 'menurecreation', detail: 'Annoncer les plats, la vente se fait à la caisse' },
      { label: 'Consulter l’historique', page: 'history', detail: 'Ventes du comptoir et débits cartes' },
    ],
    forbidden: [
      'Tableau de bord & pilotage',
      'Valider les repas (superviseur)',
      'Traiter les réclamations (superviseur)',
      'Gérer les menus cantine (superviseur)',
      'Gérer les abonnements (superviseur / Espace ISM)',
      'Gérer les utilisateurs (superviseur / Espace ISM)',
    ],
    kpis: ['Encaissé du jour', 'Ventes carte élève'],
  },
  admin: {
    role: 'admin',
    ...DIRECTION_DEF,
  },
};

export function getRoleDef(role?: UserRole): RoleDefinition {
  if (!role) return ROLE_DEFINITIONS.client;
  return ROLE_DEFINITIONS[role] ?? ROLE_DEFINITIONS.client;
}
