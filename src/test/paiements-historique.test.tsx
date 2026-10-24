import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestoProvider } from '@/context/RestoContext';

// --- Mock Supabase : la base renvoie des réponses vides, la page doit
// s'afficher proprement (état vide + pagination « 0 ») sans réseau réel.
// --- Mock Supabase : la base renvoie des réponses vides, la page doit
// s'afficher proprement (état vide + pagination « 0 ») sans réseau réel.
const eqCalls: unknown[][] = [];
const notCalls: unknown[][] = [];
const layec = () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const api: Record<string, any> = {};
  api.select = vi.fn(() => api);
  api.eq = vi.fn((col: string, val: string) => {
    eqCalls.push([col, val]);
    return api;
  });
  api.not = vi.fn((col: string, op: string, val: unknown) => {
    notCalls.push([col, op, val]);
    return api;
  });
  api.order = vi.fn(() => api);
  api.range = vi.fn(() => Promise.resolve({ data: [], count: 0, error: null }));
  api.gte = vi.fn(() => api);
  api.lte = vi.fn(() => api);
  api.or = vi.fn(() => api);
  return api;
};
const fromMock = vi.fn((_t: string) => layec());

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => fromMock(t) },
  isSupabaseConfigured: true,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'daf', role: 'admin', firstName: 'DAF' },
    login: vi.fn(),
    loginParent: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    isAuthenticated: true,
    loading: false,
  }),
}));

import HistoriquePaiementsPage from '@/pages/HistoriquePaiementsPage';
import {
  moisLibelle,
  moisDeIsoDate,
  paiementsStatusLabel,
  contraintePaiements,
  formatDateJJMMAAAA,
} from '@/lib/paiementsHistorique';

describe('Historique des paiements — helpers', () => {
  it('forme le libellé du mois payé', () => {
    expect(moisLibelle('2026-10')).toBe('Octobre 2026');
    expect(moisLibelle('2026-01')).toBe('Janvier 2026');
    expect(moisLibelle(null)).toBe('—');
    expect(moisDeIsoDate('2026-10-05T18:30:00Z')).toBe('2026-10');
  });

  it('formate la date du paiement en JJ/MM/AAAA', () => {
    expect(formatDateJJMMAAAA('2026-10-05T18:30:00Z')).toBe('05/10/2026');
    expect(formatDateJJMMAAAA(null)).toBe('—');
  });

  it('étiquette les statuts en français', () => {
    expect(paiementsStatusLabel('paid')).toBe('Payé');
    expect(paiementsStatusLabel('pending')).toBe('En attente');
    expect(paiementsStatusLabel('unknown')).toBe('unknown');
  });

  it('construit la contrainte or (enfants, abonnements, parents)', () => {
    expect(contraintePaiements([], [], [])).toBeNull();
    expect(contraintePaiements(['c1'], [], ['771234567'])).toBe(
      'child_id.eq.c1,client_username.eq.771234567',
    );
  });
});

describe('Historique des paiements — page', () => {
  beforeEach(() => {
    fromMock.mockClear();
    eqCalls.length = 0;
    notCalls.length = 0;
  });

  it('affiche le titre, les filtres et l’état vide quand la base est vide', async () => {
    render(
      <RestoProvider>
        <HistoriquePaiementsPage />
      </RestoProvider>,
    );
    expect(screen.getByRole('heading', { name: /historique des paiements/i })).toBeInTheDocument();
    expect(screen.getByTestId('paiements-filters')).toBeInTheDocument();
    expect(screen.getByTestId('paiements-export-excel')).toBeInTheDocument();
    expect(screen.getByTestId('paiements-export-pdf')).toBeInTheDocument();

    await waitFor(() => expect(fromMock).toHaveBeenCalled());
    expect(fromMock).toHaveBeenCalledWith('oresto_payments');
    await waitFor(() => {
      expect(screen.getAllByText(/aucun résultat|aucun paiement pour ces critères/i).length).toBeGreaterThan(0);
    });
  });

  it('relance la requête quand les filtres sont appliqués', async () => {
    render(
      <RestoProvider>
        <HistoriquePaiementsPage />
      </RestoProvider>,
    );
    await waitFor(() => expect(fromMock).toHaveBeenCalled());
    const avant = fromMock.mock.calls.length;
    fireEvent.change(screen.getByTestId('paiements-recherche'), { target: { value: '77 123 45 67' } });
    fireEvent.click(screen.getByRole('button', { name: /appliquer les filtres/i }));
    await waitFor(() => expect(fromMock.mock.calls.length).toBeGreaterThan(avant));
  });

  it('ne demande à la base que les paiements validés (paid et encaissé)', async () => {
    const { fetchPaiementsPage } = await import('@/lib/paiementsHistorique');
    await fetchPaiementsPage({
      filtres: {},
      conn: { childIds: [], usernames: [] },
      constraint: null,
      page: 1,
    });
    expect(eqCalls).toContainEqual(['status', 'paid']);
    // Un paiement non validé côté serveur (settled_at vide) ne doit jamais
    // remonter : même règle que la comptabilité (v_paiements_valides).
    expect(notCalls).toContainEqual(['settled_at', 'is', null]);
  });
});
