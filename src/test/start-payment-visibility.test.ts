import { describe, expect, it, vi } from 'vitest';
import { startPaymentWhenVisible } from '@/lib/payments/startPaymentWhenVisible';
import type { StartPaymentInput } from '@/lib/payments/types';

const input: StartPaymentInput = {
  reference: 'PAY-VISIBILITY',
  amount: 27000,
  method: 'mobile_money',
  phone: '771234567',
};

describe('Attente de visibilité de la commande avant initiation', () => {
  it('réessaie le refus transitoire retourné par SycaPay puis ouvre le paiement', async () => {
    const initiate = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'Cette transaction n’est pas la vôtre.' })
      .mockResolvedValueOnce({ ok: true, challenge: { kind: 'prompt', phone: '771234567', label: 'Max it (Orange Money)' } });

    await expect(startPaymentWhenVisible(input, initiate)).resolves.toMatchObject({ ok: true });
    expect(initiate).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue pas un refus métier non transitoire', async () => {
    const initiate = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Numéro mobile invalide.',
    });

    await expect(startPaymentWhenVisible(input, initiate)).resolves.toMatchObject({
      ok: false,
      error: 'Numéro mobile invalide.',
    });
    expect(initiate).toHaveBeenCalledTimes(1);
  });
});
