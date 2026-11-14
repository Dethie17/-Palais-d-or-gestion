import { startPayment } from '@/lib/payments';
import type { StartPaymentInput, StartPaymentResult } from './types';

const TRANSACTION_INCONNUE = /n['’]est pas la v/;

/**
 * Laisse le temps à la réservation et au paiement d'être visibles dans
 * Supabase avant de renvoyer au parent un refus de propriété transitoire.
 */
export async function startPaymentWhenVisible(
  input: StartPaymentInput,
  initiate: (payment: StartPaymentInput) => Promise<StartPaymentResult> = startPayment,
): Promise<StartPaymentResult> {
  for (let attempt = 0; ; attempt += 1) {
    let result: StartPaymentResult;
    try {
      result = await initiate(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (attempt >= 4 || !TRANSACTION_INCONNUE.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
      continue;
    }

    if (result.ok || !TRANSACTION_INCONNUE.test(result.error ?? '')) return result;
    if (attempt >= 4) return result;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}
