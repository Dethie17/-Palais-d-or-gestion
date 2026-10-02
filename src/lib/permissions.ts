import { PageName } from '@/types/menu';
import { UserRole } from '@/context/AuthContext';

// Matrice officielle des accès O RESTO (§2 du cahier des charges).
// Chaque profil a un périmètre différent : le garde dans App.tsx s'en sert,
// la Sidebar n'affiche que les pages autorisées.
// Référentiel des profils : src/lib/roleTasks.ts
// Directeur Général : pilotage + suivi (tableau de bord, finance,
// abonnés & paiements en lecture seule, utilisateurs, paramètres).
// Hors périmètre DG : caisse POS, validation, QR, abonnement parent,
// mes enfants, tickets & formules, gestion menu (terrain : gérant/personnel).
// Règle de caisse : SEUL le Gérant de cantine tient la Caisse (POS) au quotidien.
const DG_PAGES: PageName[] = [
  'home', 'dashboard', 'finance', 'subscriptions',
  'users', 'settings', 'history', 'profile',
];
export const ROLE_PAGES: Record<UserRole, PageName[]> = {
  // Parent : UN seul parcours continu (Espace Parent) + profil.
  // Anciennes pages conservées en redirect invisible vers 'home'.
  client: ['home', 'menus', 'children', 'subscription', 'qrcode', 'history', 'profile'],
  // Personnel : contrôle QR + validation, composition des menus, tickets (création + vente), encaissements, galerie QR, historique
  personnel: ['home', 'menu', 'validation', 'subscriptions', 'qrgallery', 'history', 'profile'],
  // Gérant : caisse POS + tableau de bord + historique (menus, abonnés, validation : DG/personnel)
  gestionnaire: ['home', 'dashboard', 'history', 'pos', 'payment', 'receipt', 'orders', 'profile'],
  // DG : pilotage + suivi uniquement
  admin: DG_PAGES,
  // Compatibilité anciens comptes : caissier → personnel, manager → DG
  caissier: ['home', 'menu', 'validation', 'subscriptions', 'qrgallery', 'history', 'profile'],
  manager: DG_PAGES,
};

export function canAccess(role: UserRole | undefined, page: PageName): boolean {
  if (!role) return false;
  return (ROLE_PAGES[role] ?? []).includes(page);
}

export const ROLE_LABEL: Record<UserRole, string> = {
  client: 'Parent',
  personnel: 'Personnel de service',
  gestionnaire: 'Gérant de cantine',
  admin: 'Directeur Général',
  caissier: 'Personnel de service',
  manager: 'Directeur Général',
};

/** Libellés pro des modules pour les écrans "Périmètre d'accès". */
export const PAGE_LABEL: Record<PageName, string> = {
  home: 'Accueil',
  menus: 'Menus',
  subscription: 'Abonnement',
  subscriptions: 'Abonnés & paiements',
  qrcode: 'Mon QR Code',
  qrgallery: 'QR Élèves',
  validation: 'Validation repas',
  users: 'Utilisateurs',
  settings: 'Paramètres',
  history: 'Historique',
  dashboard: 'Tableau de bord',
  menu: 'Gestion Menu',
  pos: 'Caisse (POS)',
  payment: 'Encaissement',
  receipt: 'Reçu',
  orders: 'Commandes',
  profile: 'Profil',
  children: 'Mes enfants',
  finance: 'Finance',
};
