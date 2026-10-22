/**
 * Registre des fournisseurs de paiement.
 *
 * Un seul point de bascule dans toute l'application : le mode démo quand la
 * passerelle SycaPay n'est pas joignable, SycaPay sinon. Les écrans ne savent
 * pas lequel est actif — ils demandent une session, ils obtiennent un défi à
 * afficher, et le règlement ne dépend jamais d'eux.
 */

import type { ORestoPaymentMethod } from '@/types/menu';
import { demoProvider } from './demoProvider';
import { unavailableProvider } from './unavailableProvider';
import { fetchHealth, resetHealth, sycaPayProvider } from './sycaPay';
import type {
  PaymentChallenge,
  PaymentProvider,
  PaymentStatus,
  ProviderMethod,
  StartPaymentInput,
  StartPaymentResult,
} from './types';

export * from './types';
export { checkDemoCode, clearDemoCode } from './demoProvider';
export { appBaseUrl, returnUrl } from './sycaPay';

/** Vrai si le moyen est géré par un fournisseur (ni espèces, ni solde carte). */
export function isProviderMethod(method: ORestoPaymentMethod): method is ProviderMethod {
  return method === 'wave' || method === 'mobile_money' || method === 'card';
}

/** Vrai sur un téléphone / tablette — condition pour ouvrir une appli via deep link. */
export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/**
 * Adresse vers laquelle déposer le client immédiatement, selon le défi renvoyé.
 *
 * - lien de paiement (Wave) ou page carte → l'URL telle quelle ;
 * - QR d'un opérateur mobile (Orange Money / Max it) → le deep link de son
 *   application, sur téléphone uniquement (sur ordinateur le QR se scanne).
 *
 * `null` quand il n'y a rien à ouvrir (invite poussée sur le téléphone, ou QR
 * sur ordinateur) : l'appelant affiche alors l'écran de paiement classique.
 */
export function appLaunchUrl(
  challenge: PaymentChallenge | undefined | null,
  touch: boolean = isTouchDevice(),
): string | null {
  if (!challenge) return null;
  if (challenge.kind === 'redirect' || challenge.kind === 'hosted') return challenge.url || null;
  if (challenge.kind === 'qr' && touch) return challenge.deepLinks[0]?.url ?? null;
  return null;
}

/**
 * Repli quand la passerelle ne répond pas : la démonstration en
 * développement, un refus explicite en production. Un build de production
 * ne doit jamais proposer un parcours où le client valide lui-même.
 */
function fallbackProvider(): PaymentProvider {
  return import.meta.env.PROD ? unavailableProvider : demoProvider;
}

let active: PaymentProvider = fallbackProvider();
let probeDone = false;

/** Le fournisseur actuellement retenu. */
export function provider(): PaymentProvider {
  return active;
}

/** Force un fournisseur (tests, bascule manuelle). */
export function setProvider(next: PaymentProvider) {
  active = next;
}

/**
 * Détecte la passerelle une fois par session.
 * Sans réponse (déploiement sans /api, hors ligne, `vite dev` seul), on reste
 * en démo : l'application démarre et les parcours restent démontrables.
 */
export async function initProvider(force = false): Promise<PaymentProvider> {
  if (probeDone && !force) return active;
  const health = await fetchHealth(force);
  active = health.mode === 'sycapay' && health.ok ? sycaPayProvider : fallbackProvider();
  probeDone = true;
  return active;
}

export function resetProvider() {
  active = fallbackProvider();
  probeDone = false;
  resetHealth();
}

/**
 * Demande une session de paiement au fournisseur actif.
 *
 * Ne solde rien : l'activation d'un abonnement ou le crédit d'une carte ne
 * dépend que du webhook SycaPay (ou de son rattrapage statusV2).
 */
export async function startPayment(
  input: StartPaymentInput,
): Promise<StartPaymentResult> {
  const current = provider();
  if (input.method === 'card' && current.startCardCheckout) {
    return current.startCardCheckout(input);
  }
  return current.startPayment(input);
}

/** Interroge l'issue d'une transaction (rattrapage d'une notification perdue). */
export async function checkPaymentStatus(reference: string): Promise<PaymentStatus> {
  return provider().checkStatus(reference);
}

/** Vrai si ce fournisseur a besoin d'un code saisi par le client (démo). */
export function usesClientCode(current: PaymentProvider = provider()): boolean {
  return current.id === 'demo';
}

/**
 * Consignes affichées sous le défi, adaptées à sa forme.
 * Le montant est celui de la commande : l'écran ne doit jamais laisser croire
 * qu'il a initiative autre chose que ce que l'application a demandé.
 */
export function stepsFor(challenge: PaymentChallenge | undefined, amount: number): string[] {
  const montant = new Intl.NumberFormat('fr-FR').format(amount);
  switch (challenge?.kind) {
    case 'redirect':
      return [
        `Vous êtes envoyé vers la page de paiement ${challenge.label}.`,
        `Vérifiez le montant : ${montant} FCFA.`,
        'Validez la demande avec votre code secret.',
        'Votre carte s’active dès que la confirmation nous revient.',
      ];
    case 'qr':
      return [
        'Sur un ordinateur : scannez le QR avec votre téléphone.',
        'Sur mobile : ouvrez directement l’application Orange.',
        `Vérifiez le montant : ${montant} FCFA.`,
        'Validez la demande avec votre code secret.',
      ];
    case 'hosted':
      return [
        'Saisissez votre carte sur la page de paiement sécurisée.',
        `Vérifiez le montant : ${montant} FCFA.`,
        'Votre carte s’active dès que la confirmation nous revient.',
      ];
    default:
      return [
        'Validez la demande sur votre téléphone.',
        `Vérifiez le montant : ${montant} FCFA.`,
        'Votre carte s’active dès que la confirmation nous revient.',
      ];
  }
}