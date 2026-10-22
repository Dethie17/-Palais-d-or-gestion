import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { RestoProvider, useResto } from '@/context/RestoContext';

type Api = ReturnType<typeof useResto>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const api = useResto();
  onReady(api);
  return null;
}

function mountHarness() {
  let api!: Api;
  render(
    <RestoProvider>
      <Harness onReady={(a) => { api = a; }} />
    </RestoProvider>,
  );
  return { latest: () => api };
}

function setupFamily(api: () => Api, username: string, balance: number) {
  act(() => { api().saveParentProfile(username, 'Awa', 'Diallo', '771234567'); });
  let childId = '';
  act(() => {
    const c = api().addChild(username, 'Moussa', 'Diallo', 'CE2', 'primaire');
    childId = c.id;
  });
  if (balance > 0) {
    act(() => { api().topUpChild(childId, balance, 'cash'); });
  }
  return childId;
}

const snack = { productId: 'P1', productName: 'Biscuit', price: 500, qty: 2 };

describe('Commande carte élève visible au service (espace superviseur)', () => {
  it('l’achat au kiosque laisse une commande « en attente » pour l’élève', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-kiosque', 5000);

    act(() => { latest().buyKiosk('parent-kiosque', childId, [snack]); });

    const order = latest().kioskOrders.find((o) => o.childId === childId);
    expect(order?.status).toBe('pending');
    expect(order?.total).toBe(1000);
    expect(order?.items).toEqual([{ productId: 'P1', name: 'Biscuit', price: 500, qty: 2 }]);
    // Le paiement est immédiat : la carte est débitée au moment de l'achat.
    expect(latest().walletOf(childId)).toBe(4000);
  });

  it('le scan du QR retrouve la commande de l’élève et la sert une seule fois', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-scan', 5000);
    act(() => { latest().buyKiosk('parent-scan', childId, [snack]); });

    const enfant = latest().children.find((c) => c.id === childId)!;
    let scan!: ReturnType<Api['resolveChildQr']>;
    act(() => { scan = latest().resolveChildQr(enfant.qrToken); });

    expect(scan.ok).toBe(true);
    expect(scan.child?.id).toBe(childId);

    const file = latest().kioskOrders.filter((o) => o.childId === scan.child!.id && o.status === 'pending');
    expect(file).toHaveLength(1);

    act(() => { latest().serveKioskOrder(file[0].id); });
    const servie = latest().kioskOrders.find((o) => o.id === file[0].id);
    expect(servie?.status).toBe('served');
    expect(servie?.servedAt).toBeTruthy();

    // Deuxième scan : plus rien à servir, la commande n'est pas rejouée.
    const reste = latest().kioskOrders.filter((o) => o.childId === childId && o.status === 'pending');
    expect(reste).toHaveLength(0);
  });

  it('la vente au comptoir sur la carte reste visible dans l’historique du jour', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-comptoir', 5000);

    let res = { ok: false, message: '' };
    act(() => {
      res = latest().sellToChildCard(childId, [snack], 'caissier');
    });

    // Sans abonnement actif, la carte prépayée suffit désormais.
    expect(res.ok).toBe(true);
    expect(latest().walletOf(childId)).toBe(4000);

    const vente = latest().kioskOrders.find((o) => o.childId === childId);
    // La vente au comptoir débite la carte tout de suite, mais la commande
    // reste « en attente » : l'élève la retire au scan du superviseur.
    expect(vente?.status).toBe('pending');
    expect(vente?.total).toBe(1000);

    act(() => { latest().serveKioskOrder(vente!.id); });
    expect(latest().kioskOrders.find((o) => o.id === vente!.id)?.status).toBe('served');
  });

  it('annuler une commande créditée la carte de l’élève', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-annulation', 5000);

    act(() => { latest().sellToChildCard(childId, [snack], 'caissier'); });
    expect(latest().walletOf(childId)).toBe(4000);

    const commande = latest().kioskOrders.find((o) => o.childId === childId)!;
    let res!: ReturnType<Api['cancelKioskOrder']>;
    act(() => { res = latest().cancelKioskOrder(commande.id); });

    expect(res.ok).toBe(true);
    expect(latest().walletOf(childId)).toBe(5000);
    expect(latest().kioskOrders.find((o) => o.id === commande.id)?.status).toBe('cancelled');

    // Remboursement tracé dans le portefeuille.
    const remboursement = latest().walletTxs.find(
      (t) => t.childId === childId && t.kind === 'refund',
    );
    expect(remboursement?.amount).toBe(1000);
    expect(remboursement?.method).toBe('card');

    // Une commande servie ne peut plus être annulée.
    act(() => { latest().serveKioskOrder(commande.id); });
    let refuse!: ReturnType<Api['cancelKioskOrder']>;
    act(() => { refuse = latest().cancelKioskOrder(commande.id); });
    expect(refuse.ok).toBe(false);
  });
});
