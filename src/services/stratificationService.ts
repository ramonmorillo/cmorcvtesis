import { supabase } from '../lib/supabase';
import type { ClinicalAssessment } from './assessmentService';

type Threshold = { warning: number; high: number; pointsWarning: number; pointsHigh: number };

type StratificationConfig = {
  version: string;
  thresholds: {
    score2: Threshold;
    framingham: Threshold;
    systolicBp: Threshold;
    ldl: Threshold;
    hba1c: Threshold;
    bmi: Threshold;
    waist: Threshold;
  };
  conditions: {
    smokerPoints: number;
    inactivityPoints: number;
    poorDietPoints: number;
    highRiskMedicationPoints: number;
    adverseEventsHighPoints: number;
  };
  priorityCuts: {
    priority1Min: number;
    priority2Min: number;
  };
  interventionsByPriority: Record<'1' | '2' | '3', string[]>;
};

export type StratificationResult = {
  totalScore: number;
  priorityLevel: 1 | 2 | 3;
  contributions: Array<{ key: string; value: number; reason: string }>;
  recommendedInterventions: string[];
};

const DEFAULT_CONFIG: StratificationConfig = {
  version: 'v1-initial',
  thresholds: {
    score2: { warning: 5, high: 10, pointsWarning: 2, pointsHigh: 4 },
    framingham: { warning: 10, high: 20, pointsWarning: 2, pointsHigh: 4 },
    systolicBp: { warning: 140, high: 160, pointsWarning: 2, pointsHigh: 4 },
    ldl: { warning: 116, high: 160, pointsWarning: 2, pointsHigh: 4 },
    hba1c: { warning: 6.5, high: 8, pointsWarning: 2, pointsHigh: 4 },
    bmi: { warning: 30, high: 35, pointsWarning: 1, pointsHigh: 2 },
    waist: { warning: 94, high: 102, pointsWarning: 1, pointsHigh: 2 },
  },
  conditions: {
    smokerPoints: 2,
    inactivityPoints: 2,
    poorDietPoints: 2,
    highRiskMedicationPoints: 3,
    adverseEventsHighPoints: 3,
  },
  priorityCuts: {
    priority1Min: 14,
    priority2Min: 7,
  },
  interventionsByPriority: {
    '1': [
      'Teleasistencia estructurada semanal',
      'Coordinación rápida con médico de familia/especialista',
      'Reconciliación farmacoterapéutica intensiva',
      'Educación terapéutica reforzada y plan de adherencia',
      'Seguimiento proactivo por eventos adversos y seguridad',
    ],
    '2': [
      'Seguimiento farmacoterapéutico quincenal/mensual',
      'Intervención educativa personalizada',
      'Coordinación con atención primaria según incidencias',
      'Refuerzo de estilo de vida y objetivos clínicos',
    ],
    '3': [
      'Educación sanitaria básica en riesgo cardiovascular',
      'Refuerzo de adherencia y automonitorización',
      'Seguimiento programado rutinario en farmacia comunitaria',
    ],
  },
};

function pointsFromThreshold(value: number | null, threshold: Threshold, label: string) {
  if (value === null) {
    return { points: 0, reason: `${label}: sin dato` };
  }
  if (value >= threshold.high) {
    return { points: threshold.pointsHigh, reason: `${label} alto (${value})` };
  }
  if (value >= threshold.warning) {
    return { points: threshold.pointsWarning, reason: `${label} intermedio (${value})` };
  }
  return { points: 0, reason: `${label} controlado (${value})` };
}

function safeConfig(raw: unknown): StratificationConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_CONFIG;
  }
  return { ...DEFAULT_CONFIG, ...(raw as Partial<StratificationConfig>) };
}

export async function getActiveCmoConfig() {
  if (!supabase) {
    return { data: DEFAULT_CONFIG, source: 'local-fallback' as const, errorMessage: 'Supabase no está configurado.' };
  }

  const { data, error } = await supabase
    .from('cmo_config')
    .select('id,version_name,is_active,config_json')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: DEFAULT_CONFIG, source: 'local-fallback' as const, errorMessage: error.message };
  }

  if (data?.config_json) {
    return { data: safeConfig(data.config_json), source: 'database' as const, errorMessage: null };
  }

  const { error: insertError } = await supabase.from('cmo_config').insert({
    version_name: DEFAULT_CONFIG.version,
    is_active: true,
    config_json: DEFAULT_CONFIG,
    notes: 'Configuración inicial autogenerada para motor de estratificación basal.',
  });

  if (insertError) {
    return { data: DEFAULT_CONFIG, source: 'local-fallback' as const, errorMessage: insertError.message };
  }

  return { data: DEFAULT_CONFIG, source: 'seeded' as const, errorMessage: null };
}

export function calculateStratification(
  assessment: Partial<ClinicalAssessment>,
  config: StratificationConfig,
): StratificationResult {
  const contributions: Array<{ key: string; value: number; reason: string }> = [];

  const metrics: Array<[keyof StratificationConfig['thresholds'], number | null, string]> = [
    ['score2', assessment.score2_value ?? null, 'SCORE2'],
    ['framingham', assessment.framingham_value ?? null, 'Framingham'],
    ['systolicBp', assessment.systolic_bp ?? null, 'PAS'],
    ['ldl', assessment.ldl_mg_dl ?? null, 'LDL'],
    ['hba1c', assessment.hba1c_pct ?? null, 'HbA1c'],
    ['bmi', assessment.bmi ?? null, 'IMC'],
    ['waist', assessment.waist_cm ?? null, 'Cintura'],
  ];

  for (const [key, value, label] of metrics) {
    const result = pointsFromThreshold(value, config.thresholds[key], label);
    contributions.push({ key, value: result.points, reason: result.reason });
  }

  if ((assessment.smoker_status ?? '').toLowerCase() === 'si') {
    contributions.push({ key: 'smoker', value: config.conditions.smokerPoints, reason: 'Paciente fumador' });
  }
  if ((assessment.physical_activity_level ?? '').toLowerCase().includes('baja')) {
    contributions.push({ key: 'physical_activity', value: config.conditions.inactivityPoints, reason: 'Actividad física baja' });
  }
  if ((assessment.diet_score ?? 999) <= 4) {
    contributions.push({ key: 'diet', value: config.conditions.poorDietPoints, reason: 'Dieta desfavorable' });
  }
  if (assessment.high_risk_medication_present) {
    contributions.push({
      key: 'high_risk_medication',
      value: config.conditions.highRiskMedicationPoints,
      reason: 'Medicación de alto riesgo presente',
    });
  }
  if ((assessment.adverse_events_count ?? 0) >= 2) {
    contributions.push({
      key: 'adverse_events',
      value: config.conditions.adverseEventsHighPoints,
      reason: 'Múltiples eventos adversos',
    });
  }

  const totalScore = contributions.reduce((sum, item) => sum + item.value, 0);

  const priorityLevel: 1 | 2 | 3 =
    totalScore >= config.priorityCuts.priority1Min
      ? 1
      : totalScore >= config.priorityCuts.priority2Min
        ? 2
        : 3;

  return {
    totalScore,
    priorityLevel,
    contributions,
    recommendedInterventions: config.interventionsByPriority[String(priorityLevel) as '1' | '2' | '3'] ?? [],
  };
}
