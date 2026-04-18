# Modelo oficial de estratificación CMO-RCV

`clinical_assessments` es la única fuente de verdad para persistencia de la estratificación basal.

## Mapeo de campos (Frontend -> BD)

| Campo frontend (`BaselineStratificationPage`) | Columna BD (`clinical_assessments`) | Tipo esperado | Valores permitidos |
|---|---|---|---|
| `education_level` | `education_level` | `text \| null` | `low`, `medium`, `high`, `unknown`, `null` |
| `pregnancy_postpartum` | `pregnancy_postpartum` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `biological_sex` | `biological_sex` | `text \| null` | `female`, `male`, `other`, `unknown`, `null` |
| `race_ethnicity_risk` | `race_ethnicity_risk` | `text \| null` | `asian_non_chinese`, `afro_caribbean`, `afro_descendant_or_chinese`, `other`, `unknown`, `null` |
| `hypertension_present` | `hypertension_present` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `cv_pathology_present` | `cv_pathology_present` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `comorbidities_present` | `comorbidities_present` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `recent_cvd_12m` | `recent_cvd_12m` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `hospital_er_use_12m` | `hospital_er_use_12m` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `smoker_status` | `smoker_status` | `text \| null` | `never`, `former_recent`, `current`, `unknown`, `null` |
| `physical_activity_pattern` | `physical_activity_pattern` | `text \| null` | `sedentary`, `intense`, `normal`, `unknown`, `null` |
| `social_support_absent` | `social_support_absent` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `psychosocial_stress` | `psychosocial_stress` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `chronic_med_count` | `chronic_med_count` | `integer \| null` | `>= 0` o `null` |
| `high_risk_medication_present_status` | `high_risk_medication_present` | `boolean \| null` | `true`, `false`, `null` |
| `recent_regimen_change` | `recent_regimen_change` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `regimen_complexity_present` | `regimen_complexity_present` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `adherence_problem` | `adherence_problem` | `text \| null` (triestado) | `yes`, `no`, `unknown`, `null` |
| `systolic_bp` | `systolic_bp` | `numeric \| null` | número o `null` |
| `diastolic_bp` | `diastolic_bp` | `numeric \| null` | número o `null` |
| `heart_rate` | `heart_rate` | `numeric \| null` | número o `null` |
| `weight_kg` | `weight_kg` | `numeric \| null` | número o `null` |
| `height_cm` | `height_cm` | `numeric \| null` | número o `null` |
| `bmi` | `bmi` | `numeric \| null` | número o `null` |
| `waist_cm` | `waist_cm` | `numeric \| null` | número o `null` |
| `ldl_mg_dl` | `ldl_mg_dl` | `numeric \| null` | número o `null` |
| `hdl_mg_dl` | `hdl_mg_dl` | `numeric \| null` | número o `null` |
| `non_hdl_mg_dl` | `non_hdl_mg_dl` | `numeric \| null` | número o `null` |
| `fasting_glucose_mg_dl` | `fasting_glucose_mg_dl` | `numeric \| null` | número o `null` |
| `hba1c_pct` | `hba1c_pct` | `numeric \| null` | número o `null` |
| `score2_value` | `score2_value` | `numeric \| null` | número o `null` |
| `framingham_value` | `framingham_value` | `numeric \| null` | número o `null` |
| `diet_score` | `diet_score` | `numeric \| null` | número o `null` |
| `safety_incidents` | `safety_incidents` | `text \| null` | texto o `null` |
| `adverse_events_count` | `adverse_events_count` | `integer \| null` | `>= 0` o `null` |
| (calculado) | `cv_risk_level` | `text \| null` | `'1'`, `'2'`, `'3'`, `null` |

## Campos legacy detectados

- `physical_activity_level` (reemplazado por `physical_activity_pattern`).
- `alcohol_use` (fuera del set oficial de estratificación CMO-RCV).

## Recomendación de deprecación segura

1. Mantener columnas legacy en BD temporalmente para no perder histórico.
2. Dejar de escribirlas desde frontend/API (aplicado en este cambio).
3. Crear migración posterior con backfill + vista de compatibilidad si algún consumidor externo todavía depende de ellas.
4. Eliminar columnas legacy solo cuando no existan lecturas activas.
