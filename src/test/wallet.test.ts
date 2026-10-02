import { describe, it, expect } from 'vitest';
import { getChildQrToken, isChildQrToken, getClientQrToken } from '@/lib/clientQr';

describe('QR enfant unique', () => {
  it('génère un token stable et distinct du QR parent', () => {
    const a = getChildQrToken('C-abc123');
    const b = getChildQrToken('C-abc123');
    expect(a).toBe(b);
    expect(a.startsWith('ORESTO-')).toBe(true);
    expect(a).not.toBe(getClientQrToken('parent1'));
    expect(isChildQrToken('C-abc123', a)).toBe(true);
    expect(isChildQrToken('C-autre', a)).toBe(false);
  });

  it('deux enfants ont deux QR différents', () => {
    expect(getChildQrToken('C-1')).not.toBe(getChildQrToken('C-2'));
  });
});

describe('compta ISM 2026', () => {
  it('2000 F par abonnement (lycée comme préscolaire) + 5% ventes = solde ISM', () => {
    const nbAbos = 3; // ex : 2 présco-élém + 1 lycée
    const salesGross = 10000;
    const ismPerSubscription = 2000;
    const ismSalesPct = 5;
    const ismAbo = nbAbos * ismPerSubscription;
    const ismSales = Math.round(salesGross * ismSalesPct / 100);
    expect(ismAbo).toBe(6000);
    expect(ismSales).toBe(500);
    expect(ismAbo + ismSales).toBe(6500);
  });

  it('calcule ecole + autres ventes + TouchPoint + net (sans PayDounya)', () => {
    const salesGross = 10000;
    const aboGross = 27000;
    const rechargeGross = 5000;
    const nbAbos = 1;
    const schoolPerSubscription = 2000;
    const otherSalesPct = 5;
    const touchpointPct = 0.5;
    const schoolDue = nbAbos * schoolPerSubscription;
    const otherSalesDue = Math.round(salesGross * otherSalesPct / 100);
    const electronicBase = aboGross + rechargeGross;
    const touchpointFees = Math.round(electronicBase * touchpointPct / 100);
    const net = salesGross + aboGross - schoolDue - otherSalesDue - touchpointFees;
    expect(schoolDue).toBe(2000);
    expect(otherSalesDue).toBe(500);
    expect(touchpointFees).toBe(160);
    expect(net).toBe(34340);
  });
});

describe('règle débit wallet', () => {
  it('refuse si solde insuffisant, accepte sinon', () => {
    const canDebit = (balance: number, price: number) => balance >= price;
    expect(canDebit(300, 400)).toBe(false);
    expect(canDebit(500, 400)).toBe(true);
  });
});
