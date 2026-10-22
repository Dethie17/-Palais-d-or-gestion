import type { ORestoPaymentMethod } from '@/types/menu';

/**
 * Moyens de paiement de l'espace parent.
 *
 * L'espace parent ne propose QUE des moyens décaissables en ligne, validés
 * côté serveur par la passerelle SycaPay (`SN_PM_WAVE` et `SN_PM_OM`) :
 * Wave et Orange Money. Les espèces restent possibles au comptoir, mais
 * seulement pour le personnel (caisse / ISM), jamais proposés ni acceptés
 * depuis l'espace parent : un parent ne peut pas créer seul un paiement
 * « espèces » en attente, que le caissier confirmerait ensuite sans
 * encaissement réel.
 *
 * Source unique : les écrans parent (Abonnement, Espace parent) s'appuient
 * sur cette liste, et les gestionnaires la vérifient avant tout appel
 * fournisseur.
 */
export const PARENT_PAYMENT_METHODS = ['wave', 'mobile_money'] as const;

export type ParentPaymentMethod = (typeof PARENT_PAYMENT_METHODS)[number];

export const PARENT_METHOD_LABEL: Record<ParentPaymentMethod, string> = {
  wave: 'Wave',
  mobile_money: 'Orange Money',
};

/** Message affiché quand un moyen hors Wave / Orange Money est demandé. */
export const PARENT_METHOD_ERROR =
  'Moyen de paiement non autorisé dans l’espace parent. Seuls Wave et Orange Money sont acceptés.';

/** Le moyen est-il décaissable en ligne depuis l'espace parent ? */
export function isParentPaymentMethod(
  method: ORestoPaymentMethod,
): method is ParentPaymentMethod {
  return (PARENT_PAYMENT_METHODS as readonly string[]).includes(method);
}
