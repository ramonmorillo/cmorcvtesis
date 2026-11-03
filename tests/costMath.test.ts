import { describe, expect, it } from 'vitest';

import {
  catalogPriceLabel,
  computeLineTotal,
  formatEuro,
  getCostStatus,
  parseNonNegativeDecimal,
  resolveInitialPrice,
  summarizeCostItems,
  type CostCatalogItem,
} from '../src/features/visit-costs/costMath';

const item = (code: string, label: string, mode: CostCatalogItem['pricing_mode'], price: number | null): CostCatalogItem => ({
  id: code, code, label, pricing_mode: mode, unit_price: price, notes: null, is_active: true,
});
const HBA1C = item('hba1c_pl_discs', 'Discos HbA1c/PL', 'fixed', 6.9);
const MAPA = item('abpm', 'MAPA', 'pending', null);
const COPIAS = item('photocopies', 'Fotocopias', 'variable', null);

describe('catálogo de costes por aparataje', () => {
  it('Discos HbA1c/PL recupera 6,90 € de catálogo; cantidad 2 = 13,80 €', () => {
    const price = resolveInitialPrice(HBA1C, null);
    expect(price).toEqual({ unit_price_applied: 6.9, price_source: 'catalog' });
    expect(computeLineTotal(2, price.unit_price_applied)).toBe(13.8);
    expect(formatEuro(13.8).replace(/\s/g, ' ')).toBe('13,80 €');
  });

  it('MAPA queda pendiente: sin precio, sin total y nunca como 0 €', () => {
    const price = resolveInitialPrice(MAPA, null);
    expect(price).toEqual({ unit_price_applied: null, price_source: 'pending' });
    expect(computeLineTotal(1, price.unit_price_applied)).toBeNull();
    expect(getCostStatus(price)).toBe('pending');
    expect(catalogPriceLabel(MAPA)).toBe('Pendiente de valoración económica');
  });

  it('concepto variable: usa el precio introducido; sin él queda pendiente', () => {
    expect(resolveInitialPrice(COPIAS, 0.05)).toEqual({ unit_price_applied: 0.05, price_source: 'manual' });
    expect(resolveInitialPrice(COPIAS, null).price_source).toBe('pending');
    expect(computeLineTotal(30, 0.05)).toBe(1.5);
  });

  it('distingue coste realmente 0 € de coste pendiente', () => {
    expect(getCostStatus({ price_source: 'manual', unit_price_applied: 0 })).toBe('zero');
    expect(getCostStatus({ price_source: 'pending', unit_price_applied: null })).toBe('pending');
    expect(getCostStatus({ price_source: 'catalog', unit_price_applied: 6.9 })).toBe('known');
  });

  it('valida cantidades no negativas y formatos decimales', () => {
    expect(parseNonNegativeDecimal('6,90')).toBe(6.9);
    expect(parseNonNegativeDecimal('6.90')).toBe(6.9);
    expect(parseNonNegativeDecimal('1.234,5')).toBe(1234.5);
    expect(parseNonNegativeDecimal('-2')).toBeNull();
    expect(parseNonNegativeDecimal('abc')).toBeNull();
    expect(parseNonNegativeDecimal('')).toBeNull();
    expect(computeLineTotal(0, 6.9)).toBeNull();
    expect(computeLineTotal(-1, 6.9)).toBeNull();
    expect(computeLineTotal(3, 0.1)).toBe(0.3); // sin error de coma flotante
  });

  it('resumen: total cuantificado solo con partidas valoradas; cuenta pendientes y total', () => {
    const summary = summarizeCostItems([
      { quantity: 2, unit_price_applied: 6.9, price_source: 'catalog' },
      { quantity: 1, unit_price_applied: null, price_source: 'pending' },
      { quantity: 4, unit_price_applied: 0, price_source: 'manual' },
    ]);
    expect(summary).toEqual({ quantifiedTotal: 13.8, pendingCount: 1, totalCount: 3 });
  });

  it('un precio de catálogo nuevo no altera el precio aplicado de una partida ya valorada', () => {
    const recorded = { quantity: 2, ...resolveInitialPrice(HBA1C, null) };
    const updatedCatalog = { ...HBA1C, unit_price: 7.5 };
    expect(resolveInitialPrice(updatedCatalog, null).unit_price_applied).toBe(7.5); // nuevas selecciones
    expect(computeLineTotal(recorded.quantity, recorded.unit_price_applied)).toBe(13.8); // histórico intacto
  });
});
