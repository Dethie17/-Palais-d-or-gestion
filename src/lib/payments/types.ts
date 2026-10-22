/**
 * Contrats de la couche paiement.
 *
 * L'application ne parle plus à Wave directement : elle parle à un
 * PaymentProvider. Aujourd'hui c'est DemoProvider (le parcours à code à 6
 * chiffres) ; en production c'est SycaPayProvider. Les deux exposent la même
 * forme, ce qui permet de garder les écrans et les tests existants intacts.
 *
 * Le vocabulaire est celui de SycaPay : une initiation ACCEPTE une demande,
 * elle ne solde rien (docs §6, « Parcours de paiement »). Seul le webhook —
 * ou le rattrapage statusV2 — conclut.
 */

import type { ORestoPaymentMethod } from '@/types/menu';

/** Moyens gérés par un fournisseur de paiement (hors espèces et solde carte). */
export type ProviderMethod = Extract<ORestoPaymentMethod, 'wave' | 'mobile_money' | 'card'>;

/**
 * Ce que le client doit faire pour payer. Trois formes couvrent le
 * catalogue, et c'est le service qui décide laquelle on reçoit.
 */
export type PaymentChallenge =
  /** Un lien : on redirige le client dessus (Wave, Orange Money CI). */
  | { kind: 'redirect'; url: string; label: string }
  /** Un QR + des liens profonds : écran d'ordinateur vs téléphone (Orange Money SN). */
  | { kind: 'qr'; qrCode: string; deepLinks: { app: string; url: string }[]; expiresAt?: string }
  /** Rien à afficher : l'opérateur pousse l'invite sur le téléphone (YAS, MTN, Moov). */
  | { kind: 'prompt'; phone: string; label: string }
  /** Une page hébergée par le prestataire : le client y saisit sa carte. */
  | { kind: 'hosted'; url: string; label: string };

/** Demande d'initiation, ce que connaît l'application d'une commande. */
export interface StartPaymentInput {
  /** Votre référence : elle devient l'idPartenaire chez SycaPay. */
  reference: string;
  amount: number;
  method: ProviderMethod;
  /** Numéro du payeur, format local (77… sans indicatif pays). */
  phone?: string;
  /** Nom du payeur (pré-remplissage de la page carte). */
  payerName?: string;
}

/** Résultat d'une initiation : acceptée, avec ce qu'il faut afficher. */
export interface StartPaymentResult {
  ok: boolean;
  challenge?: PaymentChallenge;
  /** Référence opérateur de la transaction, pour le rapprochement. */
  transactionId?: string | null;
  /** Fin de la fenêtre de validité, si l'opérateur la donne. */
  expiresAt?: string | null;
  error?: string;
  errorCode?: string | null;
  /** L'appel peut être renvoyé tel quel : rien n'a été engagé. */
  retryable?: boolean;
  /** La référence est déjà utilisée : ne jamais réessayer. */
  alreadyUsed?: boolean;
}

/** Issue d'une transaction, telle que la restitution du prestataire la rend. */
export interface PaymentStatus {
  status: 'paid' | 'failed' | 'cancelled' | 'pending' | 'unknown';
  reference: string;
  /** 'already' : le webhook avait déjà soldé — c'est le résultat attendu. */
  outcome?: string;
  addedMeals?: number | null;
  transactionId?: string | null;
  errorCode?: string | null;
  error?: string | null;
  /** Un abandon n'est pas un refus : on peut le proposer à nouveau. */
  expired?: boolean;
  retryable?: boolean;
}

/**
 * Un fournisseur de paiement.
 *
 * startPayment ACCEPTE une demande, il ne la solde pas : l'activation d'un
 * abonnement ou le crédit d'une carte ne dépend que du webhook.
 * checkStatus est le rattrapage, et il rend le même verdict que le webhook.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  /** Moyens pris en charge par ce fournisseur. */
  readonly methods: ProviderMethod[];
  /** Vrai si le fournisseur est utilisable dans cet environnement. */
  isAvailable(): boolean;
  startPayment(input: StartPaymentInput): Promise<StartPaymentResult>;
  /** Création d'une session carte hébergée. */
  startCardCheckout?(input: StartPaymentInput): Promise<StartPaymentResult>;
  checkStatus(reference: string): Promise<PaymentStatus>;
}