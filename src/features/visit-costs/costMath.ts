// Lógica pura de partidas de coste (sin Supabase), para poder probarla aisladamente.
//
// Precio de catálogo  = cost_catalog_items.unit_price (referencia vigente).
// Precio aplicado     = visit_cost_items.unit_price_applied (el que vale para esa partida).
// Coste total partida = cantidad × precio aplicado, solo si ambos son válidos.
// Un importe desconocido NUNCA se representa como 0.

export type CostPricingMode = 'fixed' | 'variable' | 'pending';
export type CostPriceSource = 'catalog' | 'manual' | 'pending';

export type CostCatalogItem = {
  id: string;
  code: string;
  label: string;
  pricing_mode: CostPricingMode;
  unit_price: number | null;
  notes: string | null;
  is_active: boolean;
};

export type VisitCostItem = {
  id: string;
  patient_id: string;
  visit_id: string;
  catalog_item_id: string;
  concept_label_snapshot: string;
  quantity: number;
  unit_price_applied: number | null;
  price_source: CostPriceSource;
  price_applied_at: string | null;
  notes: string | null;
  created_at: string;
};

/** Estado económico de una partida. */
export type CostStatus = 'known' | 'zero' | 'pending';

/** Acepta "6,90", "6.90", "1.234,5"; devuelve null si no es un número finito ≥ 0. */
export function parseNonNegativeDecimal(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Cantidad × precio, solo si ambos son válidos; si no, null (no 0). */
export function computeLineTotal(quantity: number | null, unitPrice: number | null): number | null {
  if (quantity === null || unitPrice === null || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;
  if (quantity <= 0 || unitPrice < 0) return null;
  return roundMoney(quantity * unitPrice);
}

export function getCostStatus(item: Pick<VisitCostItem, 'price_source' | 'unit_price_applied'>): CostStatus {
  if (item.price_source === 'pending' || item.unit_price_applied === null) return 'pending';
  return item.unit_price_applied === 0 ? 'zero' : 'known';
}

/** Precio inicial de una nueva partida según el concepto elegido. */
export function resolveInitialPrice(
  catalogItem: Pick<CostCatalogItem, 'pricing_mode' | 'unit_price'>,
  manualUnitPrice: number | null,
): { unit_price_applied: number | null; price_source: CostPriceSource } {
  if (catalogItem.pricing_mode === 'fixed' && catalogItem.unit_price !== null) {
    return { unit_price_applied: catalogItem.unit_price, price_source: 'catalog' };
  }
  if (catalogItem.pricing_mode === 'variable' && manualUnitPrice !== null) {
    return { unit_price_applied: manualUnitPrice, price_source: 'manual' };
  }
  return { unit_price_applied: null, price_source: 'pending' };
}

export type CostSummary = {
  /** Suma de partidas con cantidad y precio aplicado válidos. */
  quantifiedTotal: number;
  pendingCount: number;
  totalCount: number;
};

export function summarizeCostItems(items: Array<Pick<VisitCostItem, 'quantity' | 'unit_price_applied' | 'price_source'>>): CostSummary {
  let quantifiedTotal = 0;
  let pendingCount = 0;
  for (const item of items) {
    const total = item.price_source === 'pending' ? null : computeLineTotal(item.quantity, item.unit_price_applied);
    if (total === null) {
      pendingCount += 1;
    } else {
      quantifiedTotal += total;
    }
  }
  return { quantifiedTotal: roundMoney(quantifiedTotal), pendingCount, totalCount: items.length };
}

const EURO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

export function formatEuro(value: number | null): string {
  return value === null ? '—' : EURO.format(value);
}

export function catalogPriceLabel(item: Pick<CostCatalogItem, 'pricing_mode' | 'unit_price'>): string {
  if (item.pricing_mode === 'fixed' && item.unit_price !== null) return `${formatEuro(item.unit_price)} / unidad`;
  if (item.pricing_mode === 'variable') return 'Precio variable (introducir en cada registro)';
  return 'Pendiente de valoración económica';
}
