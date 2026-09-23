import { PageName } from '@/types/menu';
import { UserRole } from '@/context/AuthContext';

// Matrice officielle des accès O RESTO (§2 du cahier des charges).
// Chaque profil a un périmètre différent : le garde dans App.tsx s'en sert,
// la Sidebar n'affiche que les pages autorisées.
// Référentiel des profils : src/lib/roleTasks.ts
// Règle de caisse : SEUL le Gérant de cantine tient la Caisse (POS).
// Le Directeur Général supervise (lecture des encaissements, rapports)
// mais ne voit pas les pages pos / payment / receipt / orders.
export const ROLE_PAGES: Record<UserRole, PageName[]> = {
  // Catalogue, tickets, QR, suivi conso
  client: ['home', 'menus', 'subscription', 'qrcode', 'history', 'profile'],
  // Contrôle QR + validation, catalogue + tickets en lecture, historique
  personnel: ['home', 'menus', 'tickets', 'validation', 'history', 'profile'],
  // Pilote sa cantine : stats, menus, cantines, validations, abonnés + tickets/formules + CAISSE POS (seul habilité)
  gestionnaire: ['home', 'dashboard', 'menu', 'menus', 'tickets', 'subscriptions', 'establishments', 'validation', 'users', 'history', 'pos', 'payment', 'receipt', 'orders', 'profile'],
  // DG : supervision globale SANS caisse (tickets/formules en lecture)
  admin: [
    'home', 'dashboard', 'menu', 'menus', 'tickets', 'subscriptions', 'establishments', 'validation',
    'users', 'settings', 'history', 'profile',
  ],
  // Compatibilité anciens comptes : caissier → personnel, manager → DG (sans caisse)
  caissier: ['home', 'menus', 'tickets', 'validation', 'history', 'profile'],
  manager: [
    'home', 'dashboard', 'menu', 'menus', 'tickets', 'subscriptions', 'establishments', 'validation',
    'users', 'settings', 'history', 'profile',
  ],
};

export function canAccess(role: UserRole | undefined, page: PageName): boolean {
  if (!role) return false;
  return (ROLE_PAGES[role] ?? []).includes(page);
}

export const ROLE_LABEL: Record<UserRole, string> = {
  client: 'Client',
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
  tickets: 'Tickets & formules',
  subscription: 'Abonnement',
  subscriptions: 'Abonnés & paiements',
  qrcode: 'Mon QR Code',
  validation: 'Validation repas',
  establishments: 'Établissements',
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
};
