import { describe, expect, it } from 'vitest';

import { calculateLongitudinalDashboardMetrics, type DashboardVisit } from '../src/services/dashboardAnalytics';

function visit(
  id: string,
  patientId: string,
  type: string,
  date: string | null,
  score?: number | string | null,
  priority?: number | string | null,
  status: string | null = 'completed',
): DashboardVisit {
  return {
    id,
    patient_id: patientId,
    visit_type: type,
    visit_date: date,
    visit_status: status,
    created_at: `${date ?? '2026-01-01'}T12:00:00Z`,
    cmo_scores: score === undefined && priority === undefined ? [] : [{ score: score ?? null, priority: priority ?? null }],
  };
}

describe('calculateLongitudinalDashboardMetrics', () => {
  it('calcula mejora 1→3 y toma los scores basal y de la última fecha clínica', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['A'], [
      visit('a-baseline', 'A', 'baseline', '2026-01-10', 40, 1),
      visit('a-3m', 'A', 'month_3', '2026-04-10', 32, 2),
      visit('a-6m', 'A', 'month_6', '2026-07-10', 24, 3),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 1, worsened: 0, stable: 0, averageBaselineScore: 40, averageLatestScore: 24 });
  });

  it('calcula empeoramiento 3→2 sin mezclar el historial de otro paciente', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['B'], [
      visit('b-baseline', 'B', 'baseline', '2026-01-10', 20, 3),
      visit('a-later', 'A', 'month_6', '2026-08-20', 5, 3),
      visit('b-3m', 'B', 'month_3', '2026-04-10', 30, 2),
    ], '2026-09-24');

    expect(metrics).toMatchObject({ improved: 0, worsened: 1, stable: 0, averageBaselineScore: 20, averageLatestScore: 30 });
  });

  it('mantiene estable el nivel y determina la última visita por fecha, no por tipo ni creación del score', () => {
    const rows = [
      visit('c-baseline', 'C', 'baseline', '2026-01-10', 32, 2),
      visit('c-extra', 'C', 'extra', '2026-05-20', 28, 2),
      visit('c-6m', 'C', 'month_6', '2026-07-20', 31, 2),
    ];
    rows[1].created_at = '2026-09-24T12:00:00Z';

    const metrics = calculateLongitudinalDashboardMetrics(['C'], rows, '2026-09-24');
    expect(metrics).toMatchObject({ improved: 0, worsened: 0, stable: 1, averageBaselineScore: 32, averageLatestScore: 31 });
  });

  it('usa una extraordinaria reciente para seguimiento y aplica estrictamente más de 90 días', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['recent', 'exactly90', 'old', 'unknown'], [
      visit('d-baseline', 'recent', 'baseline', '2026-01-10', 20, 2),
      visit('d-3m', 'recent', 'month_3', '2026-04-10', 20, 2),
      visit('d-extra', 'recent', 'extra', '2026-09-01', 20, 2),
      visit('e-latest', 'exactly90', 'month_3', '2026-06-26', 20, 2),
      visit('f-latest', 'old', 'month_3', '2026-06-25', 20, 2),
      visit('g-scheduled', 'unknown', 'baseline', null),
    ], '2026-09-24');

    expect(metrics.patientsWithoutFollowup90d).toBe(1);
  });

  it('excluye null y valores no numéricos sin ceros artificiales ni NaN', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['partial', 'complete'], [
      visit('p-baseline', 'partial', 'baseline', '2026-01-01', null, 2),
      visit('p-latest', 'partial', 'month_3', '2026-03-01', 'invalid', null),
      visit('q-baseline', 'complete', 'baseline', '2026-01-02', '10', '1'),
      visit('q-latest', 'complete', 'month_3', '2026-03-02', '20', '2'),
    ], '2026-04-01');

    expect(metrics.averageBaselineScore).toBe(10);
    expect(metrics.averageLatestScore).toBe(20);
    expect(Number.isNaN(metrics.averageLatestScore)).toBe(false);
  });

  it('elige una sola basal por paciente y no retrocede si la última visita carece de score', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['duplicate'], [
      visit('first-baseline', 'duplicate', 'baseline', '2026-01-01', 40, 1),
      visit('duplicate-baseline', 'duplicate', 'baseline', '2026-02-01', 10, 3),
      visit('latest-without-score', 'duplicate', 'month_3', '2026-04-01'),
    ], '2026-04-02');

    expect(metrics.averageBaselineScore).toBe(40);
    expect(metrics.averageLatestScore).toBe(0);
    expect(metrics.improved + metrics.worsened + metrics.stable).toBe(0);
  });

  it('excluye visitas canceladas aunque tengan una fecha posterior', () => {
    const metrics = calculateLongitudinalDashboardMetrics(['cancelled'], [
      visit('valid', 'cancelled', 'baseline', '2026-01-01', 40, 1),
      visit('cancelled-later', 'cancelled', 'extra', '2026-09-20', 10, 3, 'cancelled'),
    ], '2026-09-24');

    expect(metrics.averageLatestScore).toBe(40);
    expect(metrics.patientsWithoutFollowup90d).toBe(1);
  });
});
