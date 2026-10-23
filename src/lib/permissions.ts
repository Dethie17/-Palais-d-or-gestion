import { PageName } from '@/types/menu';
import { UserRole } from '@/context/AuthContext';

// Matrice officielle des accès O RESTO — 4 espaces, 4 périmètres.
//   Parent    → un parcours continu (Accès Abonné) + profil
//   Superviseur → terrain cantine : menus, validation, réclamations, QR, utilisateurs…
//   Caissier  → comptoir : vente POS (scan QR carte élève), espace repas, historique
//   Espace ISM → pilotage : tableau de bord, finance, abonnés, utilisateurs, historique
// Règle de caisse : le Caissier tient seul la caisse (POS, encaissement,
// reçu, espace repas) ; le scan du QR élève au POS débite la carte
// prépayée de l'élève au lieu d'un paiement Wave par l'enfant.
// Le Superviseur n'a plus accès à la caisse. Menus, Paramètres et Établissements
// appartiennent au Superviseur (pas à l'Espace ISM).
// Référentiel des profils : src/lib/roleTasks.ts
const ISM_PAGES: PageName[] = [
  'dashboard', 'finance', 'subscriptions',
  'users', 'history', 'profile',
  'import-eleves',
  // Historique des paiements (parents ↔ école), paginé depuis la base.
  'paiements',
  // Les QR Cartes Student ne sont pas exposés à l'Espace ISM :
  // émission et impression restent côté Superviseur (terrain).
];
export const ROLE_PAGES: Record<UserRole, PageName[]> = {
  // Parent : UN seul parcours continu (Accès Abonné) + profil.
  client: ['home', 'menus', 'children', 'subscription', 'qrcode', 'history', 'profile', 'paymentsuccess', 'paymentfailure', 'reclamations'],
  // Superviseur cantine : tout le terrain (menus, paramètres, établissements),
  // y compris les réclamations. La caisse (POS, encaissement, espace repas)
  // est réservée au Caissier.
  personnel: ['home', 'menu', 'validation', 'subscriptions', 'qrgallery', 'users', 'establishments', 'settings', 'history', 'profile', 'dashboard', 'paymentsuccess', 'paymentfailure', 'reclamations'],
  // Caissier : POS (avec scan QR élève), espace repas et historique.
  // Les pages payment/receipt/orders sont le tunnel technique de la vente.
  gestionnaire: ['pos', 'menurecreation', 'history', 'payment', 'receipt', 'orders', 'profile', 'paymentsuccess', 'paymentfailure'],
  // Espace ISM : pilotage + suivi uniquement (sans menus/paramètres/établissements)
  admin: [...ISM_PAGES, 'paymentsuccess', 'paymentfailure'],
};

export function canAccess(role: UserRole | undefined, page: PageName): boolean {
  if (!role) return false;
  return (ROLE_PAGES[role] ?? []).includes(page);
}

export const ROLE_LABEL: Record<UserRole, string> = {
  client: 'Parent',
  personnel: 'Superviseur',
  gestionnaire: 'Caissier',
  admin: 'Espace ISM',
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
  history: 'Historique des commandes',
  dashboard: 'Tableau de bord',
  menu: 'Gestion Menu',
  menus: 'Menus',
  pos: 'Caisse (POS)',
  payment: 'Encaissement',
  receipt: 'Reçu',
  orders: 'Commandes',
  profile: 'Profil',
  children: 'Mes enfants',
  finance: 'Finance',
  menurecreation: 'Espace Repas',
  paymentsuccess: 'Paiement réussi',
  paymentfailure: 'Paiement échoué',
  reclamations: 'Réclamations',
  'import-eleves': 'Import',
  paiements: 'Historique des paiements',
};
