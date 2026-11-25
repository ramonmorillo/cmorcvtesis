import { describe, expect, it } from 'vitest';

import {
  PLAN_PRESETS,
  describeElapsedDays,
  groupOpenItemsByOrigin,
  indexOpenItemsByPatient,
  suggestPlanItems,
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

describe('sugerencias a partir de lo ya medido', () => {
  const done = (label: string, kind: 'parameter' | 'test' | 'action', completed_at: string, catalog_code: string | null = null) => ({
    label, kind, catalog_code, status: 'done' as const, completed_at,
  });
  const pending = (label: string, kind: 'parameter' | 'test' | 'action' = 'parameter') => ({
    label, kind, catalog_code: null, status: 'pending' as const, completed_at: null,
  });

  it('propone repetir los parámetros y pruebas ya realizados, del más reciente al más antiguo', () => {
    const result = suggestPlanItems([
      done('Glucemia en ayunas', 'parameter', '2026-05-01T10:00:00Z', 'fasting_glucose'),
      done('MAPA', 'test', '2026-08-01T10:00:00Z', 'abpm'),
    ]);
    expect(result.map((r) => r.label)).toEqual(['MAPA', 'Glucemia en ayunas']);
    expect(result[0]).toMatchObject({ kind: 'test', catalog_code: 'abpm', lastDoneAt: '2026-08-01T10:00:00Z' });
  });

  it('no sugiere lo que ya está pendiente, sin distinguir mayúsculas ni espacios', () => {
    const result = suggestPlanItems([done('MAPA', 'test', '2026-08-01T10:00:00Z'), pending('  mapa ', 'test')]);
    expect(result).toEqual([]);
  });

  it('agrupa por etiqueta y se queda con la realización más reciente', () => {
    const result = suggestPlanItems([
      done('Glucemia en ayunas', 'parameter', '2026-02-01T00:00:00Z'),
      done('Glucemia en ayunas', 'parameter', '2026-08-01T00:00:00Z'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].lastDoneAt).toBe('2026-08-01T00:00:00Z');
  });

  it('no sugiere actuaciones, preguntas ni derivaciones, ni objetivos descartados', () => {
    const result = suggestPlanItems([
      done('Evaluar adherencia', 'action', '2026-08-01T00:00:00Z'),
      { label: 'Pesar', kind: 'parameter' as const, catalog_code: null, status: 'dropped' as const, completed_at: null },
    ]);
    expect(result).toEqual([]);
  });

  it('respeta el límite de sugerencias', () => {
    const items = Array.from({ length: 10 }, (_, i) => done(`Prueba ${i}`, 'test', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
    expect(suggestPlanItems(items, 3)).toHaveLength(3);
  });
});

describe('objetivos abiertos por paciente', () => {
  it('indexa solo los pendientes, por paciente y en orden de creación', () => {
    const index = indexOpenItemsByPatient([
      { id: 'a', patient_id: 'p1', status: 'pending', created_at: '2026-01-02T00:00:00Z' },
      { id: 'b', patient_id: 'p1', status: 'done', created_at: '2026-01-01T00:00:00Z' },
      { id: 'c', patient_id: 'p1', status: 'pending', created_at: '2026-01-01T00:00:00Z' },
      { id: 'd', patient_id: 'p2', status: 'dropped', created_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(index.get('p1')?.map((i) => i.id)).toEqual(['c', 'a']);
    expect(index.has('p2')).toBe(false);
  });
});
