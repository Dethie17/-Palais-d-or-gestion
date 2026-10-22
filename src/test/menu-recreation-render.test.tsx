import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RestoProvider } from '@/context/RestoContext';
import MenuRecreationPage from '@/pages/MenuRecreationPage';

const WEEK_KEY = 'o-resto-weeklymenus-v3';

function seedPublishedWeek() {
  localStorage.setItem(WEEK_KEY, JSON.stringify([
    { day: 'Lundi', name: 'Menu Lundi', description: 'Plat du jour', items: [{ name: 'Riz', price: 800 }, { name: 'Jus', price: 500 }] },
    { day: 'Mardi', name: 'Menu Mardi', description: '', items: [{ name: 'Pâtes', price: 900 }] },
    { day: 'Mercredi', name: 'Menu Mercredi', description: '', items: [{ name: 'Thiéboudienne', price: 1200 }] },
    { day: 'Jeudi', name: 'Menu Jeudi', description: '', items: [{ name: 'Yassa', price: 1000 }] },
    { day: 'Vendredi', name: 'Menu Vendredi', description: '', items: [{ name: 'Mafé', price: 1100 }] },
  ]));
}

function renderPage() {
  return render(
    <RestoProvider>
      <MenuRecreationPage />
    </RestoProvider>,
  );
}

describe('Espace Repas (caisse) — vitrine des menus publiés', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('affiche le titre « Espace Repas » et des photos de menu', async () => {
    seedPublishedWeek();
    const { container } = renderPage();
    await screen.findByText(/Espace Repas — Vente non-abonnés/);
    expect(container.querySelectorAll('img[src*="images.unsplash.com"]').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Choisir ce menu/).length).toBeGreaterThan(0);
  });

  it('affiche un bel état vide quand aucun menu n’est publié', async () => {
    localStorage.setItem(WEEK_KEY, JSON.stringify([
      { day: 'Lundi', name: '', description: '', items: [] },
      { day: 'Mardi', name: '', description: '', items: [] },
      { day: 'Mercredi', name: '', description: '', items: [] },
      { day: 'Jeudi', name: '', description: '', items: [] },
      { day: 'Vendredi', name: '', description: '', items: [] },
    ]));
    renderPage();
    await screen.findByText(/Aucun menu publié/);
    expect(screen.getByText(/Le superviseur compose et publie les menus/)).toBeTruthy();
  });
});
