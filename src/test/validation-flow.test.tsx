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

describe('Validation repas (repro espace Personnel)', () => {
  it('enfant abonné : QR servi, repas décrémenté, anti-double le même jour', () => {
    const { latest } = mountHarness();
    act(() => { latest().saveParentProfile('parent-val', 'Awa', 'Diallo', '771234567'); });
    let childId = '';
    let qr = '';
    act(() => {
      const c = latest().addChild('parent-val', 'Moussa', 'Diallo', 'CE2', 'primaire');
      childId = c.id;
      qr = c.qrToken;
    });
    expect(qr).toBeTruthy();
    const site = latest().establishments[0]?.id;
    expect(site).toBeTruthy();

    let subId = '';
    act(() => {
      const sub = latest().subscribe('parent-val', 'F2', childId);
      subId = sub.id;
    });
    act(() => { latest().collectCashPayment(subId); });
    const before = latest().subscriptions.find((s) => s.id === subId)?.mealsRemaining ?? 0;

    let r1 = { ok: false, message: '' };
    act(() => {
      const r = latest().validateMeal(qr, site as string);
      r1 = { ok: r.ok, message: r.message };
    });
    expect(`${r1.ok} ${r1.message}`).toBeTruthy();
    expect(r1.ok).toBe(true);
    expect(latest().subscriptions.find((s) => s.id === subId)?.mealsRemaining).toBe(before - 1);

    let r2 = { ok: true, message: '' };
    act(() => {
      const r = latest().validateMeal(qr, site as string);
      r2 = { ok: r.ok, message: r.message };
    });
    expect(r2.ok).toBe(false);
  });

  it('QR inconnu : rejet avec message', () => {
    const { latest } = mountHarness();
    const site = latest().establishments[0]?.id ?? 'ISM';
    let r = { ok: true, message: '' };
    act(() => {
      const res = latest().validateMeal('ORESTO-INCONNU', site);
      r = { ok: res.ok, message: res.message };
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/inconnu/i);
  });
});
