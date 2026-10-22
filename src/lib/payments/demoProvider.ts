/**
 * Fournisseur de démonstration : le parcours mobile historique, sans argent.
 *
 * Il garde exactement le comportement d'avant SycaPay — un code à 6 chiffres
 * affiché dans l'app, saisi par le client pour valider de bout en bout. Il
 * sert de repli quand la passerelle n'est pas configurée, ce qui permet à
 * l'application de démarrer et d'être testée sans compte marchand.
 *
 * Il ne simule PAS le contrat SycaPay : ici le client solde lui-même son
 * paiement, ce qui est précisément ce que la doc interdit en production.
 */

import { checkWaveCode, clearWaveCode, initiateWavePayment } from '@/lib/wave';
import type {
  PaymentProvider,
  PaymentStatus,
  StartPaymentInput,
  StartPaymentResult,
} from './types';

export const demoProvider: PaymentProvider = {
  id: 'demo',
  label: 'Démo',

  methods: ['wave', 'mobile_money'],

  // Toujours disponible : c'est lui qui permet de faire tourner l'app sans
  // compte marchand.
  isAvailable: () => true,

  async startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
    const wave = initiateWavePayment(input.amount, input.method as 'wave', input.reference);
    return {
      ok: true,
      challenge: { kind: 'prompt', phone: input.phone ?? '', label: wave.methodLabel },
      expiresAt: wave.expiresAt,
    };
  },

  async checkStatus(reference: string): Promise<PaymentStatus> {
    // En démo, il n'y a pas d'opérateur à interroger : le code saisi décide de
    // tout, et c'est le contexte qui pose le statut. Le rattrapage n'a donc
    // rien à Learn — il ne fait que constater qu'on ne sait pas encore.
    return { status: 'unknown', reference };
  },
};

/** Vérifie un code démo — le fournisseur réel ne fait jamais ça. */
export function checkDemoCode(reference: string, code: string): boolean {
  return checkWaveCode(reference, code);
}

/** Oublie le code démo d'une référence. */
export function clearDemoCode(reference: string): void {
  clearWaveCode(reference);
}