/**
 * CMO-RCV Scoring Engine
 *
 * Official CMO level cut-points (fixed, not configurable):
 *   Level 3 – seguimiento estándar:   total  0 – 26 pts
 *   Level 2 – seguimiento reforzado:  total 27 – 36 pts
 *   Level 1 – seguimiento intensivo:  total 37+    pts
 *
 * ─── Unit-test-style examples ────────────────────────────────────────────
 *
 * Example 1 – Low-risk patient → Level 3, score 0
 *   scoreCmo({
 *     score2: 3, systolicBp: 122, ldl: 88, hba1c: 5.6,
 *     bmi: 23, waistCm: 84, sex: 'male', smoker: false,
 *     physicalActivityLevel: 'high', dietScore: 9,
 *     adverseEventsCount: 0, highRiskMedication: false,
 *   })
 *   → { totalScore: 0, level: 3, triggeredVariables: [] }
 *
 * Example 2 – Mildly abnormal patient → Level 3, score 15
 *   scoreCmo({
 *     score2: 7, systolicBp: 135, ldl: 110, hba1c: 6.8,
 *     bmi: 28, waistCm: 96, sex: 'male', smoker: false,
 *     physicalActivityLevel: 'moderate', dietScore: 3,
 *     adverseEventsCount: 0, highRiskMedication: false,
 *   })
 *   → { totalScore: 15, level: 3,
 *       triggeredVariables: [
 *         { code: 'score2',         points: 3, ... },  // SCORE2 5–9%
 *         { code: 'systolic_bp',    points: 2, ... },  // PAS 130–139 mmHg
 *         { code: 'ldl',            points: 2, ... },  // LDL 100–115 mg/dL
 *         { code: 'hba1c',          points: 3, ... },  // HbA1c 6.5–7.9%
 *         { code: 'bmi',            points: 1, ... },  // IMC 25–29.9
 *         { code: 'waist',          points: 2, ... },  // Cintura 94–101 cm (M)
 *         { code: 'poor_diet',      points: 2, ... },  // Dieta ≤ 4 puntos
 *       ] }
 *
 * Example 3 – Moderately complex patient → Level 2, score 28
 *   scoreCmo({
 *     score2: 14, systolicBp: 148, ldl: 140, hba1c: 7.4,
 *     bmi: 31, waistCm: 98, sex: 'male', smoker: true,
 *     physicalActivityLevel: 'low', dietScore: 5,
 *     adverseEventsCount: 0, highRiskMedication: false,
 *   })
 *   → { totalScore: 28, level: 2,
 *       triggeredVariables: [
 *         { code: 'score2',              points: 7, ... },  // SCORE2 10–19%
 *         { code: 'systolic_bp',         points: 4, ... },  // PAS 140–159 mmHg
 *         { code: 'ldl',                 points: 3, ... },  // LDL 116–159 mg/dL
 *         { code: 'hba1c',               points: 3, ... },  // HbA1c 6.5–7.9%
 *         { code: 'bmi',                 points: 2, ... },  // IMC 30–34.9
 *         { code: 'waist',               points: 2, ... },  // Cintura 94–101 cm (M)
 *         { code: 'smoker',              points: 4, ... },  // Fumador activo
 *         { code: 'physical_inactivity', points: 3, ... },  // Actividad física baja
 *       ] }
 *
 * Example 4 – High-risk patient → Level 1, score 51
 *   scoreCmo({
 *     score2: 22, systolicBp: 168, ldl: 175, hba1c: 9.2,
 *     bmi: 37, waistCm: 108, sex: 'male', smoker: true,
 *     physicalActivityLevel: 'low', dietScore: 2,
 *     adverseEventsCount: 3, highRiskMedication: true,
 *   })
 *   → { totalScore: 51, level: 1,
 *       triggeredVariables: [
 *         { code: 'score2',              points: 10, ... },
 *         { code: 'systolic_bp',         points:  6, ... },
 *         { code: 'ldl',                 points:  5, ... },
 *         { code: 'hba1c',               points:  6, ... },
 *         { code: 'bmi',                 points:  4, ... },
 *         { code: 'waist',               points:  3, ... },
 *         { code: 'smoker',              points:  4, ... },
 *         { code: 'physical_inactivity', points:  3, ... },
 *         { code: 'poor_diet',           points:  2, ... },
 *         { code: 'adverse_events',      points:  4, ... },
 *         { code: 'high_risk_medication',points:  4, ... },
 *       ] }
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export type CmoLevel = 1 | 2 | 3;

/** Exhaustive list of scoreable variable codes. */
export type CmoVariableCode =
  | 'score2'
  | 'framingham'
  | 'systolic_bp'
  | 'ldl'
  | 'hba1c'
  | 'bmi'
  | 'waist'
  | 'smoker'
  | 'physical_inactivity'
  | 'poor_diet'
  | 'high_risk_medication'
  | 'adverse_events';

/** Input variables for CMO-RCV scoring. All fields are optional/nullable. */
export interface CmoScoringInput {
  /** SCORE2 cardiovascular risk (%; 0–100). */
  score2?: number | null;
  /** Framingham cardiovascular risk (%; 0–100). Used when score2 is absent. */
  framingham?: number | null;
  /** Systolic blood pressure (mmHg). */
  systolicBp?: number | null;
  /** LDL cholesterol (mg/dL). */
  ldl?: number | null;
  /** Glycated haemoglobin (%). */
  hba1c?: number | null;
  /** Body-mass index (kg/m²). */
  bmi?: number | null;
  /** Waist circumference (cm). Sex-specific thresholds applied when sex is provided. */
  waistCm?: number | null;
  /** Biological sex; used to select waist-circumference thresholds. */
  sex?: 'male' | 'female' | 'other' | null;
  /** Active smoker status. */
  smoker?: boolean | null;
  /** Physical activity level (string). Values containing 'low' trigger points. */
  physicalActivityLevel?: string | null;
  /** Diet quality score (0–10). Values ≤ 4 trigger points. */
  dietScore?: number | null;
  /** High-risk medication present. */
  highRiskMedication?: boolean | null;
  /** Number of adverse drug events registered. */
  adverseEventsCount?: number | null;
}

/** A single variable that contributed points to the total score. */
export interface CmoTriggeredVariable {
  code: CmoVariableCode;
  label: string;
  /** Raw value supplied in CmoScoringInput. */
  rawValue: number | boolean | string | null;
  /** Points awarded for this variable. Always > 0. */
  points: number;
  /** Human-readable explanation of why points were awarded (Spanish). */
  rationale: string;
}

export interface CmoScoringResult {
  totalScore: number;
  level: CmoLevel;
  /** Only variables that contributed ≥ 1 point are included. */
  triggeredVariables: CmoTriggeredVariable[];
}

// ─── Internal scoring catalog ─────────────────────────────────────────────────

interface ScoreOutcome {
  points: number;
  rationale: string;
}

interface VariableDefinition<TRaw extends number | boolean | string | null> {
  code: CmoVariableCode;
  label: string;
  score: (value: TRaw, input: CmoScoringInput) => ScoreOutcome | null;
}

/** Returns the first tier whose threshold the value meets, or null if none. */
function tieredScore(
  value: number,
  tiers: ReadonlyArray<{ min: number; points: number; rationale: string }>,
): ScoreOutcome | null {
  for (const tier of [...tiers].reverse()) {
    if (value >= tier.min) {
      return { points: tier.points, rationale: tier.rationale };
    }
  }
  return null;
}

const VARIABLE_CATALOG: ReadonlyArray<VariableDefinition<number | boolean | string | null>> = [
  {
    code: 'score2',
    label: 'SCORE2',
    score: (v) => {
      if (typeof v !== 'number') return null;
      return tieredScore(v, [
        { min: 5,  points: 3,  rationale: `SCORE2 5–9 % (${v} %)` },
        { min: 10, points: 7,  rationale: `SCORE2 10–19 % (${v} %)` },
        { min: 20, points: 10, rationale: `SCORE2 ≥ 20 % (${v} %)` },
      ]);
    },
  },
  {
    code: 'framingham',
    label: 'Framingham',
    score: (v) => {
      if (typeof v !== 'number') return null;
      return tieredScore(v, [
        { min: 10, points: 3,  rationale: `Framingham 10–19 % (${v} %)` },
        { min: 20, points: 7,  rationale: `Framingham 20–29 % (${v} %)` },
        { min: 30, points: 10, rationale: `Framingham ≥ 30 % (${v} %)` },
      ]);
    },
  },
  {
    code: 'systolic_bp',
    label: 'PAS',
    score: (v) => {
      if (typeof v !== 'number') return null;
      return tieredScore(v, [
        { min: 130, points: 2, rationale: `PAS 130–139 mmHg (${v} mmHg)` },
        { min: 140, points: 4, rationale: `PAS 140–159 mmHg (${v} mmHg)` },
        { min: 160, points: 6, rationale: `PAS ≥ 160 mmHg (${v} mmHg)` },
      ]);
    },
  },
  {
    code: 'ldl',
    label: 'LDL',
    score: (v) => {
      if (typeof v !== 'number') return null;
      return tieredScore(v, [
        { min: 100, points: 2, rationale: `LDL 100–115 mg/dL (${v} mg/dL)` },
        { min: 116, points: 3, rationale: `LDL 116–159 mg/dL (${v} mg/dL)` },
        { min: 160, points: 5, rationale: `LDL ≥ 160 mg/dL (${v} mg/dL)` },
      ]);
    },
  },
  {
    code: 'hba1c',
    label: 'HbA1c',
    score: (v) => {
      if (typeof v !== 'number') return null;
      return tieredScore(v, [
        { min: 6.5, points: 3, rationale: `HbA1c 6,5–7,9 % (${v} %)` },
        { min: 8.0, points: 6, rationale: `HbA1c ≥ 8 % (${v} %)` },
      ]);
    },
  },
  {
    code: 'bmi',
    label: 'IMC',
    score: (v) => {
      if (typeof v !== 'number') return null;
      return tieredScore(v, [
        { min: 25,   points: 1, rationale: `IMC 25–29,9 kg/m² (${v})` },
        { min: 30,   points: 2, rationale: `IMC 30–34,9 kg/m² (${v})` },
        { min: 35,   points: 4, rationale: `IMC ≥ 35 kg/m² (${v})` },
      ]);
    },
  },
  {
    code: 'waist',
    label: 'Cintura abdominal',
    score: (v, input) => {
      if (typeof v !== 'number') return null;
      // Female thresholds are lower per international consensus
      const isFemale = input.sex === 'female';
      const [tWarn, tHigh] = isFemale ? [80, 88] : [94, 102];
      return tieredScore(v, [
        { min: tWarn, points: 2, rationale: `Cintura ${tWarn}–${tHigh - 1} cm (${v} cm)` },
        { min: tHigh, points: 3, rationale: `Cintura ≥ ${tHigh} cm (${v} cm)` },
      ]);
    },
  },
  {
    code: 'smoker',
    label: 'Tabaquismo activo',
    score: (v) => {
      if (v !== true) return null;
      return { points: 4, rationale: 'Fumador activo' };
    },
  },
  {
    code: 'physical_inactivity',
    label: 'Inactividad física',
    score: (v) => {
      if (typeof v !== 'string') return null;
      const normalized = v.toLowerCase();
      if (!normalized.includes('low') && !normalized.includes('baja')) return null;
      return { points: 3, rationale: 'Actividad física baja' };
    },
  },
  {
    code: 'poor_diet',
    label: 'Dieta desfavorable',
    score: (v) => {
      if (typeof v !== 'number') return null;
      if (v > 4) return null;
      return { points: 2, rationale: `Puntuación de dieta ≤ 4 (${v}/10)` };
    },
  },
  {
    code: 'high_risk_medication',
    label: 'Medicación de alto riesgo',
    score: (v) => {
      if (v !== true) return null;
      return { points: 4, rationale: 'Medicación de alto riesgo presente' };
    },
  },
  {
    code: 'adverse_events',
    label: 'Eventos adversos',
    score: (v) => {
      if (typeof v !== 'number' || v < 1) return null;
      if (v === 1) return { points: 2, rationale: '1 evento adverso registrado' };
      return { points: 4, rationale: `${v} eventos adversos registrados (≥ 2)` };
    },
  },
];

// ─── Level assignment ─────────────────────────────────────────────────────────

const LEVEL_THRESHOLDS: ReadonlyArray<{ minScore: number; level: CmoLevel }> = [
  { minScore: 37, level: 1 },
  { minScore: 27, level: 2 },
  { minScore: 0,  level: 3 },
];

function assignLevel(totalScore: number): CmoLevel {
  for (const { minScore, level } of LEVEL_THRESHOLDS) {
    if (totalScore >= minScore) return level;
  }
  return 3;
}

// ─── Input value extractor ────────────────────────────────────────────────────

function extractRawValue(
  code: CmoVariableCode,
  input: CmoScoringInput,
): number | boolean | string | null {
  switch (code) {
    case 'score2':               return input.score2 ?? null;
    case 'framingham':           return input.framingham ?? null;
    case 'systolic_bp':          return input.systolicBp ?? null;
    case 'ldl':                  return input.ldl ?? null;
    case 'hba1c':                return input.hba1c ?? null;
    case 'bmi':                  return input.bmi ?? null;
    case 'waist':                return input.waistCm ?? null;
    case 'smoker':               return input.smoker ?? null;
    case 'physical_inactivity':  return input.physicalActivityLevel ?? null;
    case 'poor_diet':            return input.dietScore ?? null;
    case 'high_risk_medication': return input.highRiskMedication ?? null;
    case 'adverse_events':       return input.adverseEventsCount ?? null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes the CMO-RCV score and assigns a care level for a patient.
 *
 * Pure function — no I/O, no side effects.
 */
export function scoreCmo(input: CmoScoringInput): CmoScoringResult {
  const triggeredVariables: CmoTriggeredVariable[] = [];

  for (const definition of VARIABLE_CATALOG) {
    const rawValue = extractRawValue(definition.code, input);
    const outcome = definition.score(rawValue, input);
    if (outcome !== null && outcome.points > 0) {
      triggeredVariables.push({
        code: definition.code,
        label: definition.label,
        rawValue,
        points: outcome.points,
        rationale: outcome.rationale,
      });
    }
  }

  const totalScore = triggeredVariables.reduce((sum, v) => sum + v.points, 0);

  return {
    totalScore,
    level: assignLevel(totalScore),
    triggeredVariables,
  };
}
