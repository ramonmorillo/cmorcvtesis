import { supabase } from '../../lib/supabase';
import type { CostCatalogItem, CostPriceSource, VisitCostItem } from './costMath';

type Result<T> = { data: T; errorMessage: string | null; unavailable?: boolean };

const CATALOG_SELECT = 'id,code,label,pricing_mode,unit_price,notes,is_active';
const ITEM_SELECT =
  'id,patient_id,visit_id,catalog_item_id,concept_label_snapshot,quantity,unit_price_applied,price_source,price_applied_at,notes,created_at';

export const COST_MODULE_UNAVAILABLE_MESSAGE =
  'El catálogo de costes aún no está disponible en la base de datos (migración pendiente de aplicar). Los costes del Bloque C siguen funcionando como hasta ahora.';

function errorText(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

/** Tabla inexistente (migración no aplicada): PostgREST PGRST205 / Postgres 42P01. */
function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';
  return code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(message);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCatalog(row: Record<string, unknown>): CostCatalogItem {
  return { ...(row as unknown as CostCatalogItem), unit_price: toNumberOrNull(row.unit_price) };
}

function normalizeItem(row: Record<string, unknown>): VisitCostItem {
  return {
    ...(row as unknown as VisitCostItem),
    quantity: toNumberOrNull(row.quantity) ?? 0,
    unit_price_applied: toNumberOrNull(row.unit_price_applied),
  };
}

export async function listCostCatalog(): Promise<Result<CostCatalogItem[]>> {
  if (!supabase) return { data: [], errorMessage: 'Supabase no está configurado.' };
  const { data, error } = await supabase.from('cost_catalog_items').select(CATALOG_SELECT).eq('is_active', true).order('label');
  if (error) {
    return isMissingTable(error)
      ? { data: [], errorMessage: null, unavailable: true }
      : { data: [], errorMessage: errorText(error, 'No fue posible cargar el catálogo de costes.') };
  }
  return { data: (data ?? []).map((row) => normalizeCatalog(row as Record<string, unknown>)), errorMessage: null };
}

export async function listVisitCostItems(visitId: string): Promise<Result<VisitCostItem[]>> {
  if (!supabase) return { data: [], errorMessage: 'Supabase no está configurado.' };
  const { data, error } = await supabase.from('visit_cost_items').select(ITEM_SELECT).eq('visit_id', visitId).order('created_at');
  if (error) {
    return isMissingTable(error)
      ? { data: [], errorMessage: null, unavailable: true }
      : { data: [], errorMessage: errorText(error, 'No fue posible cargar las partidas de coste.') };
  }
  return { data: (data ?? []).map((row) => normalizeItem(row as Record<string, unknown>)), errorMessage: null };
}

export type NewVisitCostItemInput = {
  patientId: string;
  visitId: string;
  catalogItem: CostCatalogItem;
  quantity: number;
  unitPriceApplied: number | null;
  priceSource: CostPriceSource;
  notes: string | null;
};

export async function createVisitCostItem(input: NewVisitCostItemInput): Promise<Result<VisitCostItem | null>> {
  if (!supabase) return { data: null, errorMessage: 'Supabase no está configurado.' };
  const pending = input.priceSource === 'pending';
  const { data, error } = await supabase
    .from('visit_cost_items')
    .insert({
      patient_id: input.patientId,
      visit_id: input.visitId,
      catalog_item_id: input.catalogItem.id,
      concept_label_snapshot: input.catalogItem.label,
      quantity: input.quantity,
      unit_price_applied: pending ? null : input.unitPriceApplied,
      price_source: input.priceSource,
      price_applied_at: pending ? null : new Date().toISOString(),
      notes: input.notes,
    })
    .select(ITEM_SELECT)
    .maybeSingle();
  if (error) return { data: null, errorMessage: errorText(error, 'No fue posible registrar la partida de coste.') };
  return { data: data ? normalizeItem(data as Record<string, unknown>) : null, errorMessage: null };
}

/** Borra una partida de ESTA visita (filtro doble por id y visita). */
export async function deleteVisitCostItem(itemId: string, visitId: string): Promise<Result<null>> {
  if (!supabase) return { data: null, errorMessage: 'Supabase no está configurado.' };
  const { error } = await supabase.from('visit_cost_items').delete().eq('id', itemId).eq('visit_id', visitId);
  return { data: null, errorMessage: error ? errorText(error, 'No fue posible eliminar la partida.') : null };
}

/**
 * Fija el precio de catálogo de un concepto (pasa a 'fixed'). NO toca partidas ya registradas.
 */
export async function updateCatalogUnitPrice(catalogItemId: string, unitPrice: number): Promise<Result<CostCatalogItem | null>> {
  if (!supabase) return { data: null, errorMessage: 'Supabase no está configurado.' };
  const { data, error } = await supabase
    .from('cost_catalog_items')
    .update({ pricing_mode: 'fixed', unit_price: unitPrice })
    .eq('id', catalogItemId)
    .select(CATALOG_SELECT)
    .maybeSingle();
  if (error) return { data: null, errorMessage: errorText(error, 'No fue posible actualizar el precio de catálogo.') };
  return { data: data ? normalizeCatalog(data as Record<string, unknown>) : null, errorMessage: null };
}

export async function countPendingItemsForCatalogItem(catalogItemId: string): Promise<Result<number>> {
  if (!supabase) return { data: 0, errorMessage: 'Supabase no está configurado.' };
  const { count, error } = await supabase
    .from('visit_cost_items')
    .select('id', { count: 'exact', head: true })
    .eq('catalog_item_id', catalogItemId)
    .eq('price_source', 'pending');
  return { data: count ?? 0, errorMessage: error ? errorText(error, 'No fue posible contar las partidas pendientes.') : null };
}

/**
 * Acción explícita: valora con el precio de catálogo VIGENTE las partidas aún pendientes de
 * este concepto (todas las visitas). Conserva cantidades; no toca partidas ya valoradas.
 */
export async function applyCatalogPriceToPendingItems(catalogItem: CostCatalogItem): Promise<Result<number>> {
  if (!supabase) return { data: 0, errorMessage: 'Supabase no está configurado.' };
  if (catalogItem.pricing_mode !== 'fixed' || catalogItem.unit_price === null) {
    return { data: 0, errorMessage: 'El concepto no tiene precio de catálogo definido.' };
  }
  const { data, error } = await supabase
    .from('visit_cost_items')
    .update({ unit_price_applied: catalogItem.unit_price, price_source: 'catalog', price_applied_at: new Date().toISOString() })
    .eq('catalog_item_id', catalogItem.id)
    .eq('price_source', 'pending')
    .select('id');
  if (error) return { data: 0, errorMessage: errorText(error, 'No fue posible aplicar el precio a las partidas pendientes.') };
  return { data: (data ?? []).length, errorMessage: null };
}
