import { describe, expect, it } from 'vitest';

import {
  PLAN_PRESETS,
  describeElapsedDays,
  groupOpenItemsByOrigin,
  validateNewPlanItem,
} from '../src/features/visit-plan/planModel';

describe('validación de un objetivo nuevo', () => {
  it('rechaza etiqueta vacía o solo con espacios', () => {
    expect(validateNewPlanItem({ label: '   ', kind: 'action' }).ok).toBe(false);
  });

  it('recorta espacios y acepta una etiqueta válida', () => {
    const result = validateNewPlanItem({ label: '  Medir TA  ', kind: 'parameter' });
    expect(result).toEqual({ ok: true, value: { label: 'Medir TA', kind: 'parameter', catalog_code: null } });
  });

  it('rechaza etiquetas de más de 200 caracteres', () => {
    expect(validateNewPlanItem({ label: 'x'.repeat(201), kind: 'action' }).ok).toBe(false);
  });

  it('rechaza un tipo desconocido', () => {
    // @ts-expect-error tipo no válido a propósito
    expect(validateNewPlanItem({ label: 'Algo', kind: 'otro' }).ok).toBe(false);
  });

  it('conserva el código de catálogo cuando viene de un preset', () => {
    const mapa = PLAN_PRESETS.find((p) => p.label === 'MAPA');
    expect(mapa?.catalog_code).toBe('abpm');
    const result = validateNewPlanItem({ label: mapa!.label, kind: mapa!.kind, catalog_code: mapa!.catalog_code });
    expect(result.ok && result.value.catalog_code).toBe('abpm');
  });
});

describe('presets de objetivos', () => {
  it('no repite etiquetas', () => {
    const labels = PLAN_PRESETS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('los códigos de catálogo de costes coinciden con los sembrados en la migración de costes', () => {
    const allowed = new Set(['abpm', 'af_screening', 'bp_measurement', 'fasting_glucose', 'hba1c_pl_discs', 'photocopies']);
    for (const preset of PLAN_PRESETS) {
      if (preset.catalog_code) expect(allowed.has(preset.catalog_code)).toBe(true);
    }
  });
});

describe('tiempo transcurrido legible', () => {
  it.each([
    [null, 'Sin visitas realizadas'],
    [0, 'Hoy'],
    [1, 'Hace 1 día'],
    [12, 'Hace 12 días'],
    [45, 'Hace 6 semanas'],
    [121, 'Hace 4 meses'],
    [400, 'Hace 1 año y 1 mes'],
  ])('describeElapsedDays(%s) = %s', (days, text) => {
    expect(describeElapsedDays(days)).toBe(text);
  });
});

describe('agrupación de objetivos', () => {
  it('agrupa por visita de origen conservando el orden de creación', () => {
    const groups = groupOpenItemsByOrigin([
      { id: '1', origin_visit_id: 'v1', created_at: '2026-01-02T00:00:00Z' },
      { id: '2', origin_visit_id: null, created_at: '2026-01-01T00:00:00Z' },
      { id: '3', origin_visit_id: 'v1', created_at: '2026-01-03T00:00:00Z' },
    ]);
    expect(groups.get('v1')?.map((i) => i.id)).toEqual(['1', '3']);
    expect(groups.get(null)?.map((i) => i.id)).toEqual(['2']);
  });
});
