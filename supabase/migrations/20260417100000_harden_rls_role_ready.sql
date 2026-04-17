-- Harden Supabase access controls: enforce authenticated-only access,
-- align every table with strict RLS, and make role checks ready for
-- admin / pharmacist / investigator policy separation.

-- 1) Role helpers (single source of truth for policy predicates)
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

-- Keep backward compatibility for existing policy/function callers.
create or replace function app_private.patient_is_owner(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.can_read_patient(p_patient_id);
$$;

-- 2) Prepare role model for future separation.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('clinician', 'admin', 'pharmacist', 'investigator'));

-- 3) Enforce RLS for all app tables.
alter table public.profiles force row level security;
alter table public.patients force row level security;
alter table public.consents force row level security;
alter table public.visits force row level security;
alter table public.measurements force row level security;
alter table public.cmo_scores force row level security;
alter table public.interventions force row level security;
alter table public.questionnaire_responses force row level security;
alter table public.audit_log force row level security;

-- 4) Remove legacy permissive policies to avoid policy conflicts.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

drop policy if exists "patients_select_own" on public.patients;
drop policy if exists "patients_insert_own" on public.patients;
drop policy if exists "patients_update_own" on public.patients;
drop policy if exists "patients_delete_own" on public.patients;

drop policy if exists "consents_select_own_patient" on public.consents;
drop policy if exists "consents_insert_own_patient" on public.consents;
drop policy if exists "consents_update_own_patient" on public.consents;
drop policy if exists "consents_delete_own_patient" on public.consents;

drop policy if exists "visits_select_own_patient" on public.visits;
drop policy if exists "visits_insert_own_patient" on public.visits;
drop policy if exists "visits_update_own_patient" on public.visits;
drop policy if exists "visits_delete_own_patient" on public.visits;

drop policy if exists "measurements_select_own_visit" on public.measurements;
drop policy if exists "measurements_insert_own_visit" on public.measurements;
drop policy if exists "measurements_update_own_visit" on public.measurements;
drop policy if exists "measurements_delete_own_visit" on public.measurements;

drop policy if exists "cmo_scores_select_own_visit" on public.cmo_scores;
drop policy if exists "cmo_scores_insert_own_visit" on public.cmo_scores;
drop policy if exists "cmo_scores_update_own_visit" on public.cmo_scores;
drop policy if exists "cmo_scores_delete_own_visit" on public.cmo_scores;

drop policy if exists "interventions_select_own_visit" on public.interventions;
drop policy if exists "interventions_insert_own_visit" on public.interventions;
drop policy if exists "interventions_update_own_visit" on public.interventions;
drop policy if exists "interventions_delete_own_visit" on public.interventions;

drop policy if exists "questionnaire_select_own_visit" on public.questionnaire_responses;
drop policy if exists "questionnaire_insert_own_visit" on public.questionnaire_responses;
drop policy if exists "questionnaire_update_own_visit" on public.questionnaire_responses;
drop policy if exists "questionnaire_delete_own_visit" on public.questionnaire_responses;

drop policy if exists "audit_log_select_scope" on public.audit_log;
drop policy if exists "audit_log_insert_self" on public.audit_log;

-- 5) Recreate strict authenticated-only policies.
-- Profiles
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or app_private.has_any_role(array['admin'])
);

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and role in ('clinician', 'pharmacist', 'investigator')
);

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

-- Patients
create policy patients_select_scope
on public.patients
for select
to authenticated
using (app_private.can_read_patient(id));

create policy patients_insert_scope
on public.patients
for insert
to authenticated
with check (
  app_private.has_any_role(array['admin'])
  or created_by = auth.uid()
);

create policy patients_update_scope
on public.patients
for update
to authenticated
using (app_private.can_write_patient(id))
with check (
  app_private.can_write_patient(id)
  and (
    app_private.has_any_role(array['admin'])
    or created_by = auth.uid()
  )
);

create policy patients_delete_scope
on public.patients
for delete
to authenticated
using (app_private.can_write_patient(id));

-- Consents
create policy consents_select_scope
on public.consents
for select
to authenticated
using (app_private.can_read_patient(patient_id));

create policy consents_insert_scope
on public.consents
for insert
to authenticated
with check (
  app_private.can_write_patient(patient_id)
  and (
    app_private.has_any_role(array['admin'])
    or obtained_by = auth.uid()
  )
);

create policy consents_update_scope
on public.consents
for update
to authenticated
using (app_private.can_write_patient(patient_id))
with check (
  app_private.can_write_patient(patient_id)
  and (
    app_private.has_any_role(array['admin'])
    or obtained_by = auth.uid()
  )
);

create policy consents_delete_scope
on public.consents
for delete
to authenticated
using (app_private.can_write_patient(patient_id));

-- Visits
create policy visits_select_scope
on public.visits
for select
to authenticated
using (app_private.can_read_patient(patient_id));

create policy visits_insert_scope
on public.visits
for insert
to authenticated
with check (
  app_private.can_write_patient(patient_id)
  and (
    app_private.has_any_role(array['admin'])
    or created_by = auth.uid()
  )
);

create policy visits_update_scope
on public.visits
for update
to authenticated
using (app_private.can_write_patient(patient_id))
with check (
  app_private.can_write_patient(patient_id)
  and (
    app_private.has_any_role(array['admin'])
    or created_by = auth.uid()
  )
);

create policy visits_delete_scope
on public.visits
for delete
to authenticated
using (app_private.can_write_patient(patient_id));

-- Measurements
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

-- CMO scores
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

-- Interventions
create policy interventions_select_scope
on public.interventions
for select
to authenticated
using (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.can_read_patient(v.patient_id)
  )
);

create policy interventions_insert_scope
on public.interventions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
  and (
    app_private.has_any_role(array['admin'])
    or delivered_by = auth.uid()
  )
);

create policy interventions_update_scope
on public.interventions
for update
to authenticated
using (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
)
with check (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
  and (
    app_private.has_any_role(array['admin'])
    or delivered_by = auth.uid()
  )
);

create policy interventions_delete_scope
on public.interventions
for delete
to authenticated
using (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.can_write_patient(v.patient_id)
  )
);

-- Questionnaire responses
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

-- Audit log: readable inside scope, not writable by clients.
create policy audit_log_select_scope
on public.audit_log
for select
to authenticated
using (
  app_private.has_any_role(array['admin'])
  or actor_id = auth.uid()
  or (patient_id is not null and app_private.can_read_patient(patient_id))
  or (
    visit_id is not null
    and exists (
      select 1
      from public.visits v
      where v.id = audit_log.visit_id
        and app_private.can_read_patient(v.patient_id)
    )
  )
);

-- 6) Explicitly block anonymous role from data access paths.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines in schema public from anon;

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
