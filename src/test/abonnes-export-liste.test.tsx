import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'superviseur', role: 'personnel', firstName: 'Superviseur' } }),
}));

vi.mock('@/context/RestoContext', () => ({
  useResto: () => ({
    subscriptions: [
      {
        id: 'S1',
        clientUsername: 'parent1',
        formulaId: 'F1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'active',
        mealsRemaining: 12,
        qrToken: 'qr',
        childId: 'C1',
      },
      {
        id: 'S2',
        clientUsername: 'parent2',
        formulaId: 'F1',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        status: 'expired',
        mealsRemaining: 0,
        qrToken: 'qr',
        childId: 'C2',
      },
    ],
    formulas: [
      {
        id: 'F1',
        name: 'Abonnement Mensuel',
        description: '',
        price: 27000,
        durationDays: 30,
        mealsIncluded: 20,
        kind: 'subscription',
      },
    ],
    payments: [
      {
        id: 'P1',
        subscriptionId: 'S1',
        clientUsername: 'parent1',
        amount: 27000,
        method: 'wave',
        status: 'paid',
        reference: 'REF1',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'P2',
        subscriptionId: 'S2',
        clientUsername: 'parent2',
        amount: 27000,
        method: 'wave',
        status: 'paid',
        reference: 'REF2',
        createdAt: '2025-01-01T10:00:00.000Z',
      },
    ],
    children: [
      {
        id: 'C1',
        parentUsername: 'parent1',
        firstName: 'Moussa',
        lastName: 'Diallo',
        className: 'CE2',
        cycle: 'primaire',
        qrToken: 'qr',
      },
      {
        id: 'C2',
        parentUsername: 'parent2',
        firstName: 'Aminata',
        lastName: 'Ba',
        className: 'CP',
        cycle: 'primaire',
        qrToken: 'qr',
      },
    ],
    parentProfiles: [
      { parentUsername: 'parent1', firstName: 'Awa', lastName: 'Diallo', phone: '771234567' },
      { parentUsername: 'parent2', firstName: 'Fatou', lastName: 'Ba', phone: '771234568' },
    ],
    walletTxs: [],
    collectCashPayment: vi.fn(),
    confirmManualPayment: vi.fn(),
    confirmWalletTopUp: vi.fn(),
    cancelSubscription: vi.fn(),
  }),
}));

vi.mock('@/lib/financeApi', () => ({
  fetchValidatedFinance: vi.fn(async () => null),
}));

vi.mock('write-excel-file', () => ({
  default: vi.fn(async () => new Blob(['xlsx'])),
}));

import writeXlsxFile from 'write-excel-file';
import SubscriptionsAdminPage from '@/pages/SubscriptionsAdminPage';

/**
 * Espace Superviseur — « Abonnés & paiements » : le bouton télécharge
 * uniquement les enfants dont l'abonnement est actif, avec nom, prénom
 * et classe (trois colonnes).
 */
describe('Abonnés & paiements — export des enfants abonnés', () => {
  const writeMock = vi.mocked(writeXlsxFile);
  let downloaded = '';

  beforeEach(() => {
    writeMock.mockClear();
    downloaded = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:abonnes'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('n’exporte que les enfants abonnés actifs avec nom, prénom et classe', async () => {
    render(<SubscriptionsAdminPage />);

    const bouton = screen.getByTestId('abonnes-export-excel');
    expect(bouton).toBeEnabled();
    expect(bouton).toHaveTextContent('Télécharger les enfants abonnés (1)');

    fireEvent.click(bouton);

    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(1));
    expect(downloaded).toBe('enfants-abonnes.xlsx');

    const rows = (writeMock.mock.calls[0][0] as unknown as { value: unknown }[][]).map((row) =>
      row.map((cell) => cell.value),
    );
    expect(rows[3]).toEqual(['Nom', 'Prénom', 'Classe']);
    expect(rows.slice(4)).toEqual([['Diallo', 'Moussa', 'CE2']]);
  });
});
