import { PageName } from '@/types/menu';
import { UserRole } from '@/context/AuthContext';

// Matrice officielle des accès O RESTO (§2 du cahier des charges).
// Chaque profil a un périmètre différent : le garde dans App.tsx s'en sert,
// la Sidebar n'affiche que les pages autorisées.
// Référentiel des profils : src/lib/roleTasks.ts
// Personnel de service : terrain cantine — accueil, gestion menu (composition
// + publication semaine), validation repas, abonnés & encaissements,
// QR élèves, utilisateurs, établissement (paramètres), historique.
// Gérant de cantine : PAS d'accueil — tableau de bord, caisse POS (+ paiement,
// reçu, commandes), menus récréation (lecture), historique.
// Règle de caisse : SEUL le Gérant de cantine tient la Caisse (POS) au quotidien.
const DG_PAGES: PageName[] = [
  'dashboard', 'finance', 'subscriptions',
  'users', 'settings', 'establishments', 'history', 'profile',
];
export const ROLE_PAGES: Record<UserRole, PageName[]> = {
  // Parent : UN seul parcours continu (Espace Parent) + profil.
  // Anciennes pages conservées en redirect invisible vers 'home'.
  client: ['home', 'menus', 'children', 'subscription', 'qrcode', 'history', 'profile', 'paymentsuccess', 'paymentfailure'],
  // Personnel : cantine terrain — menus, validation, abonnés, QR, utilisateurs, établissements, paramètres, historique, menu récréation
  personnel: ['home', 'menu', 'validation', 'subscriptions', 'qrgallery', 'users', 'establishments', 'settings', 'history', 'profile', 'menurecreation', 'dashboard', 'pos', 'payment', 'receipt', 'orders', 'finance', 'paymentsuccess', 'paymentfailure'],
  // Gérant : SANS accueil — tableau de bord, caisse POS, menu récréation, historique
  gestionnaire: ['dashboard', 'pos', 'payment', 'receipt', 'orders', 'menurecreation', 'history', 'profile', 'paymentsuccess', 'paymentfailure'],
  // DG : pilotage + suivi uniquement
  admin: [...DG_PAGES, 'paymentsuccess', 'paymentfailure'],
  // Compatibilité anciens comptes : caissier → superviseur, manager → DG
  caissier: ['home', 'menu', 'validation', 'subscriptions', 'qrgallery', 'users', 'establishments', 'settings', 'history', 'profile', 'dashboard', 'pos', 'payment', 'receipt', 'orders', 'finance', 'paymentsuccess', 'paymentfailure'],
  manager: [...DG_PAGES, 'paymentsuccess', 'paymentfailure'],
};

export function canAccess(role: UserRole | undefined, page: PageName): boolean {
  if (!role) return false;
  return (ROLE_PAGES[role] ?? []).includes(page);
}

export const ROLE_LABEL: Record<UserRole, string> = {
  client: 'Parent',
  personnel: 'Superviseur',
  gestionnaire: 'Gérant de cantine',
  admin: 'Directeur Général',
  caissier: 'Superviseur',
  manager: 'Directeur Général',
};

/** Libellés pro des modules pour les écrans "Périmètre d'accès". */
export const PAGE_LABEL: Record<PageName, string> = {
  home: 'Accueil',
  subscription: 'Abonnement',
  subscriptions: 'Abonnés & paiements',
  qrcode: 'Mon QR Code',
  qrgallery: 'QR Élèves',
  validation: 'Validation repas',
  users: 'Utilisateurs',
  settings: 'Paramètres',
  establishments: 'Établissements',
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
  menurecreation: 'Menu Récréation',
  paymentsuccess: 'Paiement réussi',
  paymentfailure: 'Paiement échoué',
};
