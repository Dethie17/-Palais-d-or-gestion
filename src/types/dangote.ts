export interface DangoteParametres {
  entite_id: string;
  nom_restaurant: string;
  devise: string;
  heure_ouverture: string;
  heure_fermeture: string;
  prix_standard: number;
  prix_premium: number;
  subvention_jour: number;
  valeur_ticket: number;
  tickets_par_talon: number;
  quota_repas_jour: number;
  quota_repas_mois: number;
  budget_alerte_seuil: number;
  auto_subvention: boolean;
  updated_at?: string;
}

export interface DangoteEmploye {
  id: string;
  entite_id: string;
  user_id: string | null;
  matricule: string;
  nom: string;
  prenom: string;
  service: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  date_embauche: string | null;
  date_fin: string | null;
  plafond_journalier: number | null;
  plafond_mensuel: number | null;
  notes: string | null;
  photo_url: string | null;
  qr_token: string;
  qr_rotated_at: string | null;
  actif: boolean;
  created_at: string;
  updated_at?: string;
}

export interface DangoteRepas {
  id: string;
  entite_id: string;
  employe_id: string;
  menu_id: string | null;
  plat_id: string | null;
  type_repas: 'standard' | 'premium';
  prix: number;
  subvention_appliquee: number;
  retenue_salaire: number;
  date_jour: string;
  est_premier_repas_du_jour: boolean;
  statut: 'valide' | 'annule';
  quantite: number;
  reference: string | null;
  source: string;
  superviseur_id: string | null;
  superviseur_username: string | null;
  annule_par: string | null;
  annule_le: string | null;
  motif_annulation: string | null;
  created_at: string;
  updated_at?: string;
}

export interface DangoteLedger {
  id: string;
  entite_id: string;
  type: 'achat' | 'depot' | 'consommation' | 'annulation' | 'remboursement' | 'ajustement' | 'facture';
  montant: number;
  solde_apres: number;
  reference: string | null;
  employe_id: string | null;
  repas_id: string | null;
  created_by: string | null;
  created_by_username: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DangoteCategorie {
  id: string;
  entite_id: string;
  nom: string;
  description: string | null;
  ordre: number;
  actif: boolean;
  created_at: string;
}

export interface DangotePlat {
  id: string;
  entite_id: string;
  categorie_id: string | null;
  nom: string;
  description: string | null;
  prix: number;
  cout: number | null;
  image_url: string | null;
  est_premium: boolean;
  disponible: boolean;
  stock_quantite: number | null;
  stock_alerte: number | null;
  created_at: string;
  updated_at?: string;
}

export interface DangoteMenu {
  id: string;
  entite_id: string;
  date_jour: string;
  type_repas: 'standard' | 'premium';
  titre: string;
  description: string | null;
  prix: number;
  actif: boolean;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
}

export interface DangoteMenuPlat {
  menu_id: string;
  plat_id: string;
  quantite: number;
}

export interface DangoteBudget {
  entite_id: string;
  solde: number;
  updated_at?: string;
}

export interface DangotePaiement {
  id: string;
  entite_id: string;
  reference: string;
  montant: number;
  methode: 'wave' | 'mobile_money' | 'card' | 'cash' | 'virement';
  statut: 'pending' | 'paid' | 'failed' | 'cancelled';
  beneficiaire_type: 'budget_entreprise' | 'employe';
  employe_id: string | null;
  provider: string | null;
  provider_tx: string | null;
  provider_status: string | null;
  provider_url: string | null;
  provider_qr: string | null;
  provider_deep_links: string | null;
  provider_expires_at: string | null;
  provider_error: string | null;
  provider_event_id: string | null;
  initie_par: string | null;
  initie_par_username: string | null;
  settled_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface DangoteFacture {
  id: string;
  entite_id: string;
  numero: string;
  periode_debut: string;
  periode_fin: string;
  montant_total: number;
  montant_subvention: number;
  montant_retenues: number;
  statut: 'brouillon' | 'emise' | 'payee' | 'annulee';
  created_by: string | null;
  created_at: string;
}

export interface DangoteAuditLog {
  id: string;
  entite_id: string;
  acteur_id: string | null;
  acteur_username: string | null;
  action: string;
  cible_type: string | null;
  cible_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface DangoteServiceStat {
  service: string;
  repas: number;
  retenues: number;
}

export interface DangoteDayStat {
  date_jour: string;
  repas: number;
  chiffre_affaires: number;
  retenues: number;
}

export interface DangoteStats {
  ok: boolean;
  debut: string;
  fin: string;
  solde: number;
  employes_actifs: number;
  repas: number;
  repas_standard: number;
  repas_premium: number;
  chiffre_affaires: number;
  subventions: number;
  retenues: number;
  participants: number;
  par_service: DangoteServiceStat[];
  par_jour: DangoteDayStat[];
  error?: string;
}

export interface DangoteDashboard {
  parametres: DangoteParametres | null;
  budget: DangoteBudget | null;
  employes: DangoteEmploye[];
  repas: DangoteRepas[];
  ledger: DangoteLedger[];
  menus: DangoteMenu[];
  menuPlats: DangoteMenuPlat[];
  categories: DangoteCategorie[];
  plats: DangotePlat[];
  paiements: DangotePaiement[];
  factures: DangoteFacture[];
  audit: DangoteAuditLog[];
  stats: DangoteStats | null;
  schemaReady: boolean;
  error: string | null;
}

export interface DangoteApiResponse {
  ok?: boolean;
  error?: string;
  outcome?: string;
  reference?: string;
  status?: string;
  montant?: number;
  solde?: number;
  solde_apres?: number;
  subvention?: number;
  retenue?: number;
  prix?: number;
  repas_id?: string;
  employe_id?: string;
  matricule?: string;
  nom?: string;
  prenom?: string;
  type_repas?: string;
  message?: string;
  plafond?: number;
  depense?: number;
  redirectUrl?: string | null;
  qrCode?: string | null;
  deepLinks?: Record<string, string> | null;
  checkoutUrl?: string | null;
  transactionId?: string | null;
  validFor?: { startDateTime?: string; endDateTime?: string } | null;
  providerStatus?: string | null;
  errorCode?: string | null;
  retryable?: boolean;
  expired?: boolean;
  [key: string]: unknown;
}
