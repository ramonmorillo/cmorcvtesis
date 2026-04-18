-- Expand baseline stratification payload to the full clinical specification.
-- Methodological rule: non-recorded data must not score; UI/API send explicit
-- categorical values and scoring engine only adds points on explicit matches.

alter table public.clinical_assessments
  add column if not exists age_years integer,
  add column if not exists education_level text,
  add column if not exists pregnancy_postpartum text,
  add column if not exists biological_sex text,
  add column if not exists race_ethnicity_risk text,
  add column if not exists hypertension_present text,
  add column if not exists cv_pathology_present text,
  add column if not exists comorbidities_present text,
  add column if not exists recent_cvd_12m text,
  add column if not exists hospital_er_use_12m text,
  add column if not exists physical_activity_pattern text,
  add column if not exists social_support_absent text,
  add column if not exists psychosocial_stress text,
  add column if not exists chronic_med_count integer,
  add column if not exists recent_regimen_change text,
  add column if not exists regimen_complexity_present text,
  add column if not exists adherence_problem text;

alter table public.clinical_assessments
  drop constraint if exists clinical_assessments_smoker_check;

alter table public.clinical_assessments
  add constraint clinical_assessments_smoker_check
  check (smoker_status is null or smoker_status in ('never', 'former_recent', 'current', 'unknown'));

alter table public.clinical_assessments
  add constraint clinical_assessments_education_level_check
  check (education_level is null or education_level in ('low', 'medium', 'high', 'unknown')),
  add constraint clinical_assessments_pregnancy_postpartum_check
  check (pregnancy_postpartum is null or pregnancy_postpartum in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_biological_sex_check
  check (biological_sex is null or biological_sex in ('female', 'male', 'other', 'unknown')),
  add constraint clinical_assessments_race_ethnicity_risk_check
  check (race_ethnicity_risk is null or race_ethnicity_risk in ('asian_non_chinese', 'afro_caribbean', 'afro_descendant_or_chinese', 'other', 'unknown')),
  add constraint clinical_assessments_hypertension_present_check
  check (hypertension_present is null or hypertension_present in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_cv_pathology_present_check
  check (cv_pathology_present is null or cv_pathology_present in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_comorbidities_present_check
  check (comorbidities_present is null or comorbidities_present in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_recent_cvd_12m_check
  check (recent_cvd_12m is null or recent_cvd_12m in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_hospital_er_use_12m_check
  check (hospital_er_use_12m is null or hospital_er_use_12m in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_physical_activity_pattern_check
  check (physical_activity_pattern is null or physical_activity_pattern in ('sedentary', 'intense', 'normal', 'unknown')),
  add constraint clinical_assessments_social_support_absent_check
  check (social_support_absent is null or social_support_absent in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_psychosocial_stress_check
  check (psychosocial_stress is null or psychosocial_stress in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_recent_regimen_change_check
  check (recent_regimen_change is null or recent_regimen_change in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_regimen_complexity_present_check
  check (regimen_complexity_present is null or regimen_complexity_present in ('yes', 'no', 'unknown')),
  add constraint clinical_assessments_adherence_problem_check
  check (adherence_problem is null or adherence_problem in ('yes', 'no', 'unknown'));
