-- Thesis schema alignment migration
-- Reconciles the generic initial clinical schema with the CMO-RCV thesis
-- application model. Safe to apply on top of the initial schema; all
-- alterations use IF NOT EXISTS / IF EXISTS guards.

-- ── 1. patients: thesis-specific columns ─────────────────────────────────────
alter table public.patients
  add column if not exists study_code          text unique,
  add column if not exists pharmacy_site       text,
  add column if not exists investigator_name   text,
  add column if not exists inclusion_date      date,
  add column if not exists screening_date      date,
  add column if not exists age_at_inclusion    integer
    constraint patients_age_at_inclusion_check
    check (age_at_inclusion is null or (age_at_inclusion >= 18 and age_at_inclusion <= 120)),
  add column if not exists consent_signed      boolean not null default false;

create index if not exists idx_patients_study_code on public.patients(study_code);

-- ── 2. visits: thesis-specific columns, nullable visit_date ──────────────────
-- visit_date is required by the initial schema but the app schedules visits
-- before they occur (scheduled_date) and records the actual date later.
alter table public.visits
  alter column visit_date drop not null,
  add column if not exists visit_number          integer,
  add column if not exists scheduled_date        date,
  add column if not exists visit_status          text
    constraint visits_status_check
    check (visit_status is null or visit_status in (
      'programada', 'realizada', 'cancelada', 'no_presentada'
    )),
  add column if not exists extraordinary_reason  text;

create index if not exists idx_visits_scheduled_date
  on public.visits(scheduled_date)
  where scheduled_date is not null;

-- ── 3. clinical_assessments ───────────────────────────────────────────────────
-- Per-visit clinical parameter capture used for CMO-RCV scoring.
create table if not exists public.clinical_assessments (
  id                         uuid primary key default gen_random_uuid(),
  visit_id                   uuid not null unique references public.visits(id) on delete cascade,
  systolic_bp                numeric(6,2),
  diastolic_bp               numeric(6,2),
  heart_rate                 numeric(6,2),
  weight_kg                  numeric(6,2),
  height_cm                  numeric(6,2),
  bmi                        numeric(6,2),
  waist_cm                   numeric(6,2),
  ldl_mg_dl                  numeric(6,2),
  hdl_mg_dl                  numeric(6,2),
  non_hdl_mg_dl              numeric(6,2),
  fasting_glucose_mg_dl      numeric(6,2),
  hba1c_pct                  numeric(5,2),
  score2_value               numeric(5,2),
  framingham_value           numeric(5,2),
  cv_risk_level              text,
  smoker_status              text
    constraint clinical_assessments_smoker_check
    check (smoker_status is null or smoker_status in ('si', 'no')),
  alcohol_use                text,
  physical_activity_level    text,
  diet_score                 numeric(4,1),
  safety_incidents           text,
  adverse_events_count       integer,
  high_risk_medication_present boolean,
  created_at                 timestamptz not null default timezone('utc', now()),
  updated_at                 timestamptz not null default timezone('utc', now())
);

create index if not exists idx_clinical_assessments_visit_id
  on public.clinical_assessments(visit_id);

create trigger trg_clinical_assessments_updated_at
before update on public.clinical_assessments
for each row execute function public.set_updated_at();

alter table public.clinical_assessments enable row level security;

create policy "clinical_assessments_select_own_visit"
on public.clinical_assessments for select
using (
  exists (
    select 1 from public.visits v
    where v.id = clinical_assessments.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "clinical_assessments_insert_own_visit"
on public.clinical_assessments for insert
with check (
  exists (
    select 1 from public.visits v
    where v.id = clinical_assessments.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "clinical_assessments_update_own_visit"
on public.clinical_assessments for update
using (
  exists (
    select 1 from public.visits v
    where v.id = clinical_assessments.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
)
with check (
  exists (
    select 1 from public.visits v
    where v.id = clinical_assessments.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

-- ── 4. interventions: thesis-specific columns ─────────────────────────────────
-- The generic schema stores a description (required) and a delivered_by FK.
-- The thesis app tracks domain, priority, CMO linkage, and outcome instead.
alter table public.interventions
  alter column description drop not null,
  add column if not exists intervention_domain  text,
  add column if not exists priority_level       integer
    constraint interventions_priority_check
    check (priority_level is null or priority_level in (1, 2, 3)),
  add column if not exists delivered            boolean,
  add column if not exists linked_to_cmo_level  integer
    constraint interventions_cmo_level_check
    check (linked_to_cmo_level is null or linked_to_cmo_level in (1, 2, 3)),
  add column if not exists outcome              text;

-- The initial schema requires delivered_by NOT NULL with RLS auth.uid() check.
-- A before-insert trigger auto-fills it so the app does not need to pass it.
create or replace function public.set_delivered_by_to_current_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  new.delivered_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_interventions_set_delivered_by on public.interventions;
create trigger trg_interventions_set_delivered_by
before insert on public.interventions
for each row execute function public.set_delivered_by_to_current_user();

-- ── 5. patients: auto-fill created_by via trigger ────────────────────────────
-- The app's createPatient call does not pass created_by; a trigger populates it.
create or replace function public.set_created_by_to_current_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  new.created_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_patients_set_created_by on public.patients;
create trigger trg_patients_set_created_by
before insert on public.patients
for each row
when (new.created_by is null)
execute function public.set_created_by_to_current_user();
