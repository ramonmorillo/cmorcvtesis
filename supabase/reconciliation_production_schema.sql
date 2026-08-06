-- Production reconciliation script for Supabase SQL Editor
-- Purpose: safely reconcile runtime objects expected by the current app,
-- when production currently has only patients, visits, interventions.
--
-- Idempotent design:
-- - Uses IF NOT EXISTS / CREATE OR REPLACE / guarded policy creation.
-- - Does not drop existing tables or data.
-- - Only adds/aligns required objects.

begin;

create extension if not exists pgcrypto;
create schema if not exists app_private;

-- ---------------------------------------------------------------------------
-- 1) Shared helpers required by triggers + RLS predicates
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Minimal profiles table needed by FK columns and current app profile upsert.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'clinician',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('clinician', 'admin', 'pharmacist', 'investigator'));

create or replace function app_private.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function app_private.has_any_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and coalesce(app_private.current_profile_role(), '') = any (p_roles);
$$;

create or replace function app_private.can_read_patient(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      app_private.has_any_role(array['admin'])
      or exists (
        select 1
        from public.patients p
        where p.id = p_patient_id
          and p.created_by = auth.uid()
      )
    );
$$;

create or replace function app_private.can_write_patient(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      app_private.has_any_role(array['admin'])
      or exists (
        select 1
        from public.patients p
        where p.id = p_patient_id
          and p.created_by = auth.uid()
      )
    );
$$;

create or replace function app_private.patient_is_owner(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.can_read_patient(p_patient_id);
$$;

-- ---------------------------------------------------------------------------
-- 2) Missing runtime tables
-- ---------------------------------------------------------------------------
create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  systolic_bp smallint,
  diastolic_bp smallint,
  heart_rate smallint,
  weight_kg numeric(5,2),
  height_cm numeric(5,2),
  bmi numeric(5,2),
  waist_cm numeric(5,2),
  ldl_mg_dl numeric(6,2),
  hba1c_pct numeric(4,2),
  smoker boolean,
  physically_inactive boolean,
  unhealthy_diet boolean,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cmo_scores (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  score numeric(6,2) not null,
  priority smallint not null check (priority in (1, 2, 3)),
  factors jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  calculated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  questionnaire_code text not null,
  question_code text not null,
  response_value jsonb not null,
  answered_at timestamptz not null default timezone('utc', now()),
  answered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- 3) Required indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_measurements_recorded_by on public.measurements(recorded_by);
create index if not exists idx_cmo_scores_priority on public.cmo_scores(priority);
create index if not exists idx_cmo_scores_calculated_by on public.cmo_scores(calculated_by);
create index if not exists idx_questionnaire_visit_id on public.questionnaire_responses(visit_id);
create index if not exists idx_questionnaire_code on public.questionnaire_responses(questionnaire_code);
create index if not exists idx_questionnaire_answered_at on public.questionnaire_responses(answered_at desc);

-- ---------------------------------------------------------------------------
-- 4) Updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_measurements_updated_at on public.measurements;
create trigger trg_measurements_updated_at
before update on public.measurements
for each row execute function public.set_updated_at();

drop trigger if exists trg_cmo_scores_updated_at on public.cmo_scores;
create trigger trg_cmo_scores_updated_at
before update on public.cmo_scores
for each row execute function public.set_updated_at();

drop trigger if exists trg_questionnaire_responses_updated_at on public.questionnaire_responses;
create trigger trg_questionnaire_responses_updated_at
before update on public.questionnaire_responses
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS hardening + policies needed by app runtime
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.measurements enable row level security;
alter table public.measurements force row level security;
alter table public.cmo_scores enable row level security;
alter table public.cmo_scores force row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.questionnaire_responses force row level security;

-- profiles policies
 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_self_or_admin'
   ) then
     create policy profiles_select_self_or_admin
     on public.profiles
     for select
     to authenticated
     using (
       id = auth.uid()
       or app_private.has_any_role(array['admin'])
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_self'
   ) then
     create policy profiles_insert_self
     on public.profiles
     for insert
     to authenticated
     with check (
       id = auth.uid()
       and role in ('clinician', 'pharmacist', 'investigator')
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_self_or_admin'
   ) then
     create policy profiles_update_self_or_admin
     on public.profiles
     for update
     to authenticated
     using (
       id = auth.uid()
       or app_private.has_any_role(array['admin'])
     )
     with check (
       (
         id = auth.uid()
         and role in ('clinician', 'pharmacist', 'investigator')
       )
       or app_private.has_any_role(array['admin'])
     );
   end if;
 end $$;

-- measurements policies
 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'measurements' and policyname = 'measurements_select_scope'
   ) then
     create policy measurements_select_scope
     on public.measurements
     for select
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = measurements.visit_id
           and app_private.can_read_patient(v.patient_id)
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'measurements' and policyname = 'measurements_insert_scope'
   ) then
     create policy measurements_insert_scope
     on public.measurements
     for insert
     to authenticated
     with check (
       exists (
         select 1
         from public.visits v
         where v.id = measurements.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
       and (
         app_private.has_any_role(array['admin'])
         or recorded_by = auth.uid()
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'measurements' and policyname = 'measurements_update_scope'
   ) then
     create policy measurements_update_scope
     on public.measurements
     for update
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = measurements.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
     )
     with check (
       exists (
         select 1
         from public.visits v
         where v.id = measurements.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
       and (
         app_private.has_any_role(array['admin'])
         or recorded_by = auth.uid()
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'measurements' and policyname = 'measurements_delete_scope'
   ) then
     create policy measurements_delete_scope
     on public.measurements
     for delete
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = measurements.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
     );
   end if;
 end $$;

-- cmo_scores policies
 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cmo_scores' and policyname = 'cmo_scores_select_scope'
   ) then
     create policy cmo_scores_select_scope
     on public.cmo_scores
     for select
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = cmo_scores.visit_id
           and app_private.can_read_patient(v.patient_id)
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cmo_scores' and policyname = 'cmo_scores_insert_scope'
   ) then
     create policy cmo_scores_insert_scope
     on public.cmo_scores
     for insert
     to authenticated
     with check (
       exists (
         select 1
         from public.visits v
         where v.id = cmo_scores.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
       and (
         app_private.has_any_role(array['admin'])
         or calculated_by = auth.uid()
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cmo_scores' and policyname = 'cmo_scores_update_scope'
   ) then
     create policy cmo_scores_update_scope
     on public.cmo_scores
     for update
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = cmo_scores.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
     )
     with check (
       exists (
         select 1
         from public.visits v
         where v.id = cmo_scores.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
       and (
         app_private.has_any_role(array['admin'])
         or calculated_by = auth.uid()
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cmo_scores' and policyname = 'cmo_scores_delete_scope'
   ) then
     create policy cmo_scores_delete_scope
     on public.cmo_scores
     for delete
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = cmo_scores.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
     );
   end if;
 end $$;

-- questionnaire responses policies
 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'questionnaire_responses' and policyname = 'questionnaire_select_scope'
   ) then
     create policy questionnaire_select_scope
     on public.questionnaire_responses
     for select
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = questionnaire_responses.visit_id
           and app_private.can_read_patient(v.patient_id)
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'questionnaire_responses' and policyname = 'questionnaire_insert_scope'
   ) then
     create policy questionnaire_insert_scope
     on public.questionnaire_responses
     for insert
     to authenticated
     with check (
       exists (
         select 1
         from public.visits v
         where v.id = questionnaire_responses.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
       and (
         app_private.has_any_role(array['admin'])
         or answered_by = auth.uid()
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'questionnaire_responses' and policyname = 'questionnaire_update_scope'
   ) then
     create policy questionnaire_update_scope
     on public.questionnaire_responses
     for update
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = questionnaire_responses.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
     )
     with check (
       exists (
         select 1
         from public.visits v
         where v.id = questionnaire_responses.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
       and (
         app_private.has_any_role(array['admin'])
         or answered_by = auth.uid()
       )
     );
   end if;
 end $$;

 do $$
 begin
   if not exists (
     select 1 from pg_policies
     where schemaname = 'public' and tablename = 'questionnaire_responses' and policyname = 'questionnaire_delete_scope'
   ) then
     create policy questionnaire_delete_scope
     on public.questionnaire_responses
     for delete
     to authenticated
     using (
       exists (
         select 1
         from public.visits v
         where v.id = questionnaire_responses.visit_id
           and app_private.can_write_patient(v.patient_id)
       )
     );
   end if;
 end $$;

-- grant helper execution explicitly to authenticated role
revoke all on function app_private.current_profile_role() from public;
revoke all on function app_private.has_any_role(text[]) from public;
revoke all on function app_private.can_read_patient(uuid) from public;
revoke all on function app_private.can_write_patient(uuid) from public;
revoke all on function app_private.patient_is_owner(uuid) from public;

grant execute on function app_private.current_profile_role() to authenticated;
grant execute on function app_private.has_any_role(text[]) to authenticated;
grant execute on function app_private.can_read_patient(uuid) to authenticated;
grant execute on function app_private.can_write_patient(uuid) to authenticated;
grant execute on function app_private.patient_is_owner(uuid) to authenticated;

commit;
