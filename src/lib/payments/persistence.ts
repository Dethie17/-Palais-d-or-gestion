export type PersistOutcome =
  | { ok: true }
  | { ok: false; code?: string | null; message?: string | null };

export function persistenceErrorMessage(outcome: Extract<PersistOutcome, { ok: false }>): string {
  const code = outcome.code ?? '';
  const message = outcome.message ?? '';
  if (code === '23505') {
    return 'Ce mois est déjà réservé en attente. Rechargez la page, puis libérez la réservation ou choisissez un autre mois.';
  }
  if (code === '42501' || code === 'PGRST301' || /jwt|session|expir|auth/i.test(message)) {
    return 'Votre session a expiré. Reconnectez-vous, puis relancez le paiement.';
  }
  return "La commande n'a pas pu être enregistrée. Vérifiez votre connexion puis réessayez.";
}
