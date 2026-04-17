-- Ensure official intervention catalog fields exist and seed official entries.
-- Additive-only, production-safe migration.

create table if not exists public.intervention_catalog (
  id uuid primary key default gen_random_uuid(),
  code text,
  level smallint,
  domain text,
  label text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.intervention_catalog
  add column if not exists code text,
  add column if not exists level smallint,
  add column if not exists domain text,
  add column if not exists label text,
  add column if not exists active boolean not null default true;

-- Legacy columns retained for compatibility with existing application queries.
alter table public.intervention_catalog
  add column if not exists intervention_code text,
  add column if not exists intervention_name text,
  add column if not exists taxonomy_level smallint,
  add column if not exists taxonomy_domain text,
  add column if not exists is_active boolean;

-- Backfill requested field names from legacy taxonomy columns when present.
update public.intervention_catalog
set
  code = coalesce(code, intervention_code),
  level = coalesce(level, taxonomy_level),
  domain = coalesce(domain, taxonomy_domain),
  label = coalesce(label, intervention_name),
  active = coalesce(active, is_active)
where (
  code is distinct from coalesce(code, intervention_code)
  or level is distinct from coalesce(level, taxonomy_level)
  or domain is distinct from coalesce(domain, taxonomy_domain)
  or label is distinct from coalesce(label, intervention_name)
  or active is distinct from coalesce(active, is_active)
);

create unique index if not exists intervention_catalog_code_key
  on public.intervention_catalog(code);

create index if not exists idx_intervention_catalog_level_domain_v2
  on public.intervention_catalog(level, domain);

create index if not exists idx_intervention_catalog_active_v2
  on public.intervention_catalog(active)
  where active = true;

with official_interventions(code, level, domain, label, description, active) as (
  values
    ('L1-TEL-01', 1, 'monitoring', 'Teleasistencia estructurada semanal', 'Seguimiento clínico-farmacoterapéutico semanal para pacientes de alta prioridad.', true),
    ('L1-COO-01', 1, 'coordination', 'Coordinación rápida con médico de familia/especialista', 'Escalado y coordinación asistencial preferente ante descompensación o riesgo alto.', true),
    ('L1-MED-01', 1, 'medication', 'Reconciliación farmacoterapéutica intensiva', 'Revisión intensiva de tratamiento para detectar discrepancias, duplicidades y riesgos.', true),
    ('L1-EDU-01', 1, 'education', 'Educación terapéutica reforzada y plan de adherencia', 'Intervención educativa intensiva con plan personalizado de adherencia.', true),
    ('L1-SAF-01', 1, 'safety', 'Seguimiento proactivo por eventos adversos y seguridad', 'Vigilancia activa de eventos adversos y medidas tempranas de seguridad terapéutica.', true),

    ('L2-MON-01', 2, 'monitoring', 'Seguimiento farmacoterapéutico quincenal/mensual', 'Seguimiento estructurado periódico para ajuste y continuidad terapéutica.', true),
    ('L2-EDU-01', 2, 'education', 'Intervención educativa personalizada', 'Educación orientada a necesidades específicas del paciente y su contexto clínico.', true),
    ('L2-COO-01', 2, 'coordination', 'Coordinación con atención primaria según incidencias', 'Comunicación y coordinación con AP en función de incidencias detectadas.', true),
    ('L2-LIF-01', 2, 'lifestyle', 'Refuerzo de estilo de vida y objetivos clínicos', 'Apoyo conductual para mejorar hábitos y cumplimiento de objetivos de riesgo CV.', true),

    ('L3-EDU-01', 3, 'education', 'Educación sanitaria básica en riesgo cardiovascular', 'Educación básica sobre factores de riesgo cardiovascular y autocuidado.', true),
    ('L3-ADH-01', 3, 'adherence', 'Refuerzo de adherencia y automonitorización', 'Refuerzo de adherencia terapéutica y seguimiento autónomo por el paciente.', true),
    ('L3-MON-01', 3, 'monitoring', 'Seguimiento programado rutinario en farmacia comunitaria', 'Seguimiento rutinario programado para mantenimiento de objetivos clínicos.', true)
)
insert into public.intervention_catalog (code, level, domain, label, description, active)
select code, level, domain, label, description, active
from official_interventions
on conflict (code) do update
set
  level = excluded.level,
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  active = excluded.active,
  updated_at = timezone('utc', now());

-- Keep legacy taxonomy fields synchronized when present for backward compatibility.
update public.intervention_catalog
set
  intervention_code = coalesce(intervention_code, code),
  intervention_name = coalesce(intervention_name, label),
  taxonomy_level = coalesce(taxonomy_level, level),
  taxonomy_domain = coalesce(taxonomy_domain, domain),
  is_active = coalesce(is_active, active)
where (
  intervention_code is distinct from coalesce(intervention_code, code)
  or intervention_name is distinct from coalesce(intervention_name, label)
  or taxonomy_level is distinct from coalesce(taxonomy_level, level)
  or taxonomy_domain is distinct from coalesce(taxonomy_domain, domain)
  or is_active is distinct from coalesce(is_active, active)
);
