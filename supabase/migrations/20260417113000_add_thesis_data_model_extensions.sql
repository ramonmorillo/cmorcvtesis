-- Additive thesis-grade extensions for CMO-RCV data model.
-- This migration keeps existing tables intact and introduces only missing structures.

-- 1) Baseline snapshot header per patient.
create table if not exists public.patient_baseline_profile (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  instrument_version text not null,
  captured_at timestamptz not null default timezone('utc', now()),
  captured_by uuid not null references public.profiles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.patient_baseline_profile is
  'Header table for official baseline CMO-RCV stratification snapshots per patient.';

create index if not exists idx_patient_baseline_profile_patient_captured
  on public.patient_baseline_profile(patient_id, captured_at desc);

create index if not exists idx_patient_baseline_profile_captured_by
  on public.patient_baseline_profile(captured_by);

create trigger trg_patient_baseline_profile_updated_at
before update on public.patient_baseline_profile
for each row execute function public.set_updated_at();

-- 2) Visit-level questionnaire context/history container.
create table if not exists public.visit_clinical_context (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  questionnaire_code text not null,
  questionnaire_version text not null,
  questionnaire_instance smallint not null default 1 check (questionnaire_instance > 0),
  assessed_at timestamptz not null default timezone('utc', now()),
  assessed_by uuid not null references public.profiles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint visit_clinical_context_visit_questionnaire_instance_unique
    unique (visit_id, questionnaire_code, questionnaire_instance)
);

comment on table public.visit_clinical_context is
  'Visit-scoped clinical questionnaire context with instance counter to preserve per-visit history.';

create index if not exists idx_visit_clinical_context_visit_assessed
  on public.visit_clinical_context(visit_id, assessed_at desc);

create index if not exists idx_visit_clinical_context_assessed_by
  on public.visit_clinical_context(assessed_by);

create trigger trg_visit_clinical_context_updated_at
before update on public.visit_clinical_context
for each row execute function public.set_updated_at();

-- 3) Official CMO variable dictionary/catalog.
create table if not exists public.cmo_variable_catalog (
  id uuid primary key default gen_random_uuid(),
  variable_code text not null unique,
  variable_label text not null,
  instrument_section text not null,
  variable_scope text not null check (variable_scope in ('baseline', 'visit')),
  data_type text not null check (data_type in ('boolean', 'integer', 'numeric', 'text', 'categorical')),
  unit text,
  response_options jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.cmo_variable_catalog is
  'Canonical catalog of official CMO-RCV variables/items used for baseline and longitudinal scoring.';

create index if not exists idx_cmo_variable_catalog_scope_section
  on public.cmo_variable_catalog(variable_scope, instrument_section);

create index if not exists idx_cmo_variable_catalog_active
  on public.cmo_variable_catalog(is_active)
  where is_active = true;

create trigger trg_cmo_variable_catalog_updated_at
before update on public.cmo_variable_catalog
for each row execute function public.set_updated_at();

-- 4) Item-level score traceability table.
create table if not exists public.cmo_score_item_results (
  id uuid primary key default gen_random_uuid(),
  cmo_score_id uuid references public.cmo_scores(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete cascade,
  baseline_profile_id uuid references public.patient_baseline_profile(id) on delete cascade,
  clinical_context_id uuid references public.visit_clinical_context(id) on delete set null,
  variable_id uuid not null references public.cmo_variable_catalog(id) on delete restrict,
  source_question_code text,
  raw_value jsonb not null,
  normalized_value numeric(10,4),
  variable_weight numeric(10,4),
  item_score numeric(10,4),
  scored_at timestamptz not null default timezone('utc', now()),
  scored_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cmo_score_item_results_scope_check
    check (visit_id is not null or baseline_profile_id is not null)
);

comment on table public.cmo_score_item_results is
  'Per-variable scoring traceability with raw value, normalization, weight, and resulting item score.';

create index if not exists idx_cmo_score_item_results_visit
  on public.cmo_score_item_results(visit_id, scored_at desc)
  where visit_id is not null;

create index if not exists idx_cmo_score_item_results_baseline_profile
  on public.cmo_score_item_results(baseline_profile_id, scored_at desc)
  where baseline_profile_id is not null;

create index if not exists idx_cmo_score_item_results_variable
  on public.cmo_score_item_results(variable_id);

create index if not exists idx_cmo_score_item_results_cmo_score
  on public.cmo_score_item_results(cmo_score_id)
  where cmo_score_id is not null;

create trigger trg_cmo_score_item_results_updated_at
before update on public.cmo_score_item_results
for each row execute function public.set_updated_at();

-- 5) Official intervention taxonomy by level.
create table if not exists public.intervention_catalog (
  id uuid primary key default gen_random_uuid(),
  intervention_code text not null unique,
  intervention_name text not null,
  taxonomy_level smallint not null check (taxonomy_level between 1 and 4),
  taxonomy_domain text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.intervention_catalog is
  'Official intervention taxonomy (coded) grouped by intervention level for consistent planning/reporting.';

create index if not exists idx_intervention_catalog_level_domain
  on public.intervention_catalog(taxonomy_level, taxonomy_domain);

create index if not exists idx_intervention_catalog_active
  on public.intervention_catalog(is_active)
  where is_active = true;

create trigger trg_intervention_catalog_updated_at
before update on public.intervention_catalog
for each row execute function public.set_updated_at();

-- RLS alignment with existing authenticated-user model.
alter table public.patient_baseline_profile enable row level security;
alter table public.visit_clinical_context enable row level security;
alter table public.cmo_variable_catalog enable row level security;
alter table public.cmo_score_item_results enable row level security;
alter table public.intervention_catalog enable row level security;

alter table public.patient_baseline_profile force row level security;
alter table public.visit_clinical_context force row level security;
alter table public.cmo_variable_catalog force row level security;
alter table public.cmo_score_item_results force row level security;
alter table public.intervention_catalog force row level security;

-- patient_baseline_profile policies
create policy patient_baseline_profile_select_scope
on public.patient_baseline_profile
for select
to authenticated
using (app_private.can_read_patient(patient_id));

create policy patient_baseline_profile_insert_scope
on public.patient_baseline_profile
for insert
to authenticated
with check (
  app_private.can_write_patient(patient_id)
  and (
    app_private.has_any_role(array['admin'])
    or captured_by = auth.uid()
  )
);

create policy patient_baseline_profile_update_scope
on public.patient_baseline_profile
for update
to authenticated
using (app_private.can_write_patient(patient_id))
with check (
  app_private.can_write_patient(patient_id)
  and (
    app_private.has_any_role(array['admin'])
    or captured_by = auth.uid()
  )
);

create policy patient_baseline_profile_delete_scope
on public.patient_baseline_profile
for delete
to authenticated
using (app_private.can_write_patient(patient_id));

-- visit_clinical_context policies
create policy visit_clinical_context_select_scope
on public.visit_clinical_context
for select
to authenticated
using (
  exists (
    select 1
    from public.visits v
    where v.id = visit_clinical_context.visit_id
      and app_private.can_read_patient(v.patient_id)
  )
);

create policy visit_clinical_context_insert_scope
on public.visit_clinical_context
for insert
to authenticated
with check (
  exists (
    select 1
    from public.visits v
    where v.id = visit_clinical_context.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
  and (
    app_private.has_any_role(array['admin'])
    or assessed_by = auth.uid()
  )
);

create policy visit_clinical_context_update_scope
on public.visit_clinical_context
for update
to authenticated
using (
  exists (
    select 1
    from public.visits v
    where v.id = visit_clinical_context.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
)
with check (
  exists (
    select 1
    from public.visits v
    where v.id = visit_clinical_context.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
  and (
    app_private.has_any_role(array['admin'])
    or assessed_by = auth.uid()
  )
);

create policy visit_clinical_context_delete_scope
on public.visit_clinical_context
for delete
to authenticated
using (
  exists (
    select 1
    from public.visits v
    where v.id = visit_clinical_context.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
);

-- cmo_variable_catalog policies (shared dictionary)
create policy cmo_variable_catalog_select_authenticated
on public.cmo_variable_catalog
for select
to authenticated
using (true);

create policy cmo_variable_catalog_write_admin
on public.cmo_variable_catalog
for all
to authenticated
using (app_private.has_any_role(array['admin']))
with check (app_private.has_any_role(array['admin']));

-- cmo_score_item_results policies
create policy cmo_score_item_results_select_scope
on public.cmo_score_item_results
for select
to authenticated
using (
  (visit_id is not null and exists (
    select 1
    from public.visits v
    where v.id = cmo_score_item_results.visit_id
      and app_private.can_read_patient(v.patient_id)
  ))
  or
  (baseline_profile_id is not null and exists (
    select 1
    from public.patient_baseline_profile pbp
    where pbp.id = cmo_score_item_results.baseline_profile_id
      and app_private.can_read_patient(pbp.patient_id)
  ))
);

create policy cmo_score_item_results_insert_scope
on public.cmo_score_item_results
for insert
to authenticated
with check (
  (
    visit_id is not null
    and exists (
      select 1
      from public.visits v
      where v.id = cmo_score_item_results.visit_id
        and app_private.can_write_patient(v.patient_id)
    )
  )
  or
  (
    baseline_profile_id is not null
    and exists (
      select 1
      from public.patient_baseline_profile pbp
      where pbp.id = cmo_score_item_results.baseline_profile_id
        and app_private.can_write_patient(pbp.patient_id)
    )
  )
)
and (
  app_private.has_any_role(array['admin'])
  or scored_by = auth.uid()
);

create policy cmo_score_item_results_update_scope
on public.cmo_score_item_results
for update
to authenticated
using (
  (
    visit_id is not null
    and exists (
      select 1
      from public.visits v
      where v.id = cmo_score_item_results.visit_id
        and app_private.can_write_patient(v.patient_id)
    )
  )
  or
  (
    baseline_profile_id is not null
    and exists (
      select 1
      from public.patient_baseline_profile pbp
      where pbp.id = cmo_score_item_results.baseline_profile_id
        and app_private.can_write_patient(pbp.patient_id)
    )
  )
)
with check (
  (
    visit_id is not null
    and exists (
      select 1
      from public.visits v
      where v.id = cmo_score_item_results.visit_id
        and app_private.can_write_patient(v.patient_id)
    )
  )
  or
  (
    baseline_profile_id is not null
    and exists (
      select 1
      from public.patient_baseline_profile pbp
      where pbp.id = cmo_score_item_results.baseline_profile_id
        and app_private.can_write_patient(pbp.patient_id)
    )
  )
)
and (
  app_private.has_any_role(array['admin'])
  or scored_by = auth.uid()
);

create policy cmo_score_item_results_delete_scope
on public.cmo_score_item_results
for delete
to authenticated
using (
  (
    visit_id is not null
    and exists (
      select 1
      from public.visits v
      where v.id = cmo_score_item_results.visit_id
        and app_private.can_write_patient(v.patient_id)
    )
  )
  or
  (
    baseline_profile_id is not null
    and exists (
      select 1
      from public.patient_baseline_profile pbp
      where pbp.id = cmo_score_item_results.baseline_profile_id
        and app_private.can_write_patient(pbp.patient_id)
    )
  )
);

-- intervention_catalog policies (shared taxonomy)
create policy intervention_catalog_select_authenticated
on public.intervention_catalog
for select
to authenticated
using (true);

create policy intervention_catalog_write_admin
on public.intervention_catalog
for all
to authenticated
using (app_private.has_any_role(array['admin']))
with check (app_private.has_any_role(array['admin']));
