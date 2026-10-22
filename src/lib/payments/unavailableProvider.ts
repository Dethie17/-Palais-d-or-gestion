/**
 * Passerelle injoignable, en production.
 *
 * Ce n'est PAS un fournisseur de demonstration : il ne produit aucun defi,
 * donc aucun code a saisir et rien a valider cote client. Il existe pour
 * qu'une panne se dise au lieu de se deguiser en parcours jouable.
 *
 * La regle qu'il porte : en production, un paiement ne se solde jamais
 * localement. Seul le webhook SycaPay (ou son rattrapage statusV2) conclut.
 */

import type {
  PaymentProvider,
  StartPaymentInput,
  StartPaymentResult,
  PaymentStatus,
} from './types';

const MESSAGE =
  "Paiement momentanement indisponible. Aucun montant n'a ete debite - reessayez dans quelques instants.";

export const unavailableProvider: PaymentProvider = {
  id: 'unavailable',
  label: 'Indisponible',

  // Aucun moyen : l'appelant doit refuser avant d'ouvrir un ecran.
  methods: [],

  isAvailable: () => false,

  async startPayment(_input: StartPaymentInput): Promise<StartPaymentResult> {
    // Pas de defi : sans defi, l'ecran n'a rien a faire valider au client.
    return { ok: false, error: MESSAGE };
  },

  async checkStatus(reference: string): Promise<PaymentStatus> {
    return { status: 'unknown', reference };
  },
};

export const UNAVAILABLE_MESSAGE = MESSAGE;
