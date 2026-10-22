import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { RestoProvider, useResto } from '@/context/RestoContext';

type Api = ReturnType<typeof useResto>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const api = useResto();
  onReady(api);
  return null;
}

/** Monte un provider isolé et retourne un accès à l'API la plus fraîche. */
function mountHarness() {
  let api!: Api;
  render(
    <RestoProvider>
      <Harness onReady={(a) => { api = a; }} />
    </RestoProvider>,
  );
  return { latest: () => api };
}

const F2_PRICE = 27000;
const T1_PRICE = 1900;

/**
 * L'identité d'un parent EST son numéro de téléphone : chaque famille de
 * test a donc son propre numéro (sinon c'est la même personne, et son
 * second enfant « Moussa Diallo / CE2 » serait un doublon).
 */
function setupFamily(api: () => Api, phone: string, balance: number) {
  act(() => { api().saveParentProfile(phone, 'Awa', 'Diallo', phone); });
  let childId = '';
  act(() => {
    const c = api().addChild(phone, 'Moussa', 'Diallo', 'CE2', 'primaire');
    childId = c.id;
  });
  if (balance > 0) {
    act(() => { api().topUpChild(childId, balance, 'cash'); });
  }
  return childId;
}

describe('Règle carte : tickets uniquement, jamais les abonnements', () => {
  it('ticket payé avec la carte : débit immédiat + repas crédités', () => {
    const { latest } = mountHarness();
    const phone = '771234567';
    const childId = setupFamily(latest, phone, 5000);
    expect(latest().walletOf(childId)).toBe(5000);

    let addedMeals = 0;
    act(() => {
      ({ addedMeals } = latest().buyTicket(phone, 'T1', 'balance', childId));
    });
    expect(addedMeals).toBeGreaterThan(0);
    expect(latest().walletOf(childId)).toBe(5000 - T1_PRICE);

    const payment = latest().payments.find((p) => p.formulaId === 'T1' && p.method === 'balance');
    expect(payment?.status).toBe('paid');
    expect(payment?.amount).toBe(T1_PRICE);
  });

  it('abonnement payé avec la carte : refusé (Wave / espèces uniquement)', () => {
    const { latest } = mountHarness();
    const phone = '771234567';
    const childId = setupFamily(latest, phone, 30000);

    let subId = '';
    act(() => {
      const sub = latest().subscribe(phone, 'F2', childId);
      subId = sub.id;
    });
    expect(() => {
      act(() => { latest().buyTicket(phone, 'F2', 'balance', childId); });
    }).toThrow(/carte impossible/i);

    expect(() => {
      act(() => { latest().paySubscription(subId, 'balance'); });
    }).toThrow(/carte impossible/i);

    // Rien débité : le solde reste intact, la réservation reste en attente.
    expect(latest().walletOf(childId)).toBe(30000);
    expect(latest().subscriptions.find((s) => s.id === subId)?.status).toBe('pending');
  });

  it('refuse le ticket si solde insuffisant : rien débité, rien crédité', () => {
    const { latest } = mountHarness();
    const phone = '771234567';
    const childId = setupFamily(latest, phone, 500);

    expect(() => {
      act(() => { latest().buyTicket(phone, 'T1', 'balance', childId); });
    }).toThrow(/insuffisant/i);
    expect(latest().walletOf(childId)).toBe(500);
  });

  it('flux externe inchangé : subscribe + paySubscription même handler (cash → pending)', () => {
    const { latest } = mountHarness();
    const phone = '771234567';
    const childId = setupFamily(latest, phone, 0);

    let paymentId = '';
    act(() => {
      const sub = latest().subscribe(phone, 'F2', childId);
      const { payment } = latest().paySubscription(sub.id, 'cash', sub);
      paymentId = payment.id;
    });

    const payment = latest().payments.find((p) => p.id === paymentId);
    expect(payment?.status).toBe('pending');
    expect(payment?.method).toBe('cash');
    expect(F2_PRICE).toBe(27000);
  });
});
