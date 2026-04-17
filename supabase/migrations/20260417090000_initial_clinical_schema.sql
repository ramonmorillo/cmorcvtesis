-- CMO-RCV thesis app: production-grade clinical schema
-- PostgreSQL / Supabase migration

create extension if not exists pgcrypto;

create schema if not exists app_private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function app_private.patient_is_owner(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and p.created_by = auth.uid()
  );
$$;

create or replace function app_private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
  v_visit_id uuid;
  v_new jsonb;
  v_old jsonb;
begin
  v_new = case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_old = case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;

  if tg_table_name = 'patients' then
    v_patient_id = coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  else
    v_patient_id = coalesce((v_new ->> 'patient_id')::uuid, (v_old ->> 'patient_id')::uuid);
  end if;

  if tg_table_name = 'visits' then
    v_visit_id = coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  else
    v_visit_id = coalesce((v_new ->> 'visit_id')::uuid, (v_old ->> 'visit_id')::uuid);
  end if;

  insert into public.audit_log (
    actor_id,
    patient_id,
    visit_id,
    table_name,
    row_id,
    action,
    old_data,
    new_data
  )
  values (
    auth.uid(),
    v_patient_id,
    v_visit_id,
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then v_old else null end,
    case when tg_op in ('UPDATE', 'INSERT') then v_new else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'clinician' check (role in ('clinician', 'admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  medical_record_number text,
  initials text,
  birth_date date,
  sex text check (sex in ('female', 'male', 'other')),
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint patients_medical_record_number_unique unique (medical_record_number)
);

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  consent_type text not null,
  status text not null check (status in ('granted', 'revoked', 'pending')),
  granted_at timestamptz,
  revoked_at timestamptz,
  document_url text,
  obtained_by uuid not null references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_date date not null,
  visit_type text not null default 'follow_up',
  reason text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  intervention_type text not null,
  description text not null,
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  scheduled_for timestamptz,
  completed_at timestamptz,
  delivered_by uuid not null references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
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

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_patients_created_by on public.patients(created_by);
create index if not exists idx_patients_birth_date on public.patients(birth_date);
create index if not exists idx_consents_patient_id on public.consents(patient_id);
create index if not exists idx_consents_obtained_by on public.consents(obtained_by);
create index if not exists idx_visits_patient_id_date on public.visits(patient_id, visit_date desc);
create index if not exists idx_visits_created_by on public.visits(created_by);
create index if not exists idx_measurements_recorded_by on public.measurements(recorded_by);
create index if not exists idx_cmo_scores_priority on public.cmo_scores(priority);
create index if not exists idx_cmo_scores_calculated_by on public.cmo_scores(calculated_by);
create index if not exists idx_interventions_visit_id on public.interventions(visit_id);
create index if not exists idx_interventions_status on public.interventions(status);
create index if not exists idx_questionnaire_visit_id on public.questionnaire_responses(visit_id);
create index if not exists idx_questionnaire_code on public.questionnaire_responses(questionnaire_code);
create index if not exists idx_questionnaire_answered_at on public.questionnaire_responses(answered_at desc);
create index if not exists idx_audit_log_actor_id on public.audit_log(actor_id);
create index if not exists idx_audit_log_patient_id on public.audit_log(patient_id);
create index if not exists idx_audit_log_visit_id on public.audit_log(visit_id);
create index if not exists idx_audit_log_table_row on public.audit_log(table_name, row_id);
create index if not exists idx_audit_log_at on public.audit_log(at desc);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_patients_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

create trigger trg_consents_updated_at
before update on public.consents
for each row execute function public.set_updated_at();

create trigger trg_visits_updated_at
before update on public.visits
for each row execute function public.set_updated_at();

create trigger trg_measurements_updated_at
before update on public.measurements
for each row execute function public.set_updated_at();

create trigger trg_cmo_scores_updated_at
before update on public.cmo_scores
for each row execute function public.set_updated_at();

create trigger trg_interventions_updated_at
before update on public.interventions
for each row execute function public.set_updated_at();

create trigger trg_questionnaire_responses_updated_at
before update on public.questionnaire_responses
for each row execute function public.set_updated_at();

create trigger trg_patients_audit_log
after insert or update or delete on public.patients
for each row execute function app_private.write_audit_log();

create trigger trg_consents_audit_log
after insert or update or delete on public.consents
for each row execute function app_private.write_audit_log();

create trigger trg_visits_audit_log
after insert or update or delete on public.visits
for each row execute function app_private.write_audit_log();

create trigger trg_measurements_audit_log
after insert or update or delete on public.measurements
for each row execute function app_private.write_audit_log();

create trigger trg_cmo_scores_audit_log
after insert or update or delete on public.cmo_scores
for each row execute function app_private.write_audit_log();

create trigger trg_interventions_audit_log
after insert or update or delete on public.interventions
for each row execute function app_private.write_audit_log();

create trigger trg_questionnaire_responses_audit_log
after insert or update or delete on public.questionnaire_responses
for each row execute function app_private.write_audit_log();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.consents enable row level security;
alter table public.visits enable row level security;
alter table public.measurements enable row level security;
alter table public.cmo_scores enable row level security;
alter table public.interventions enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "patients_select_own"
on public.patients
for select
using (created_by = auth.uid());

create policy "patients_insert_own"
on public.patients
for insert
with check (created_by = auth.uid());

create policy "patients_update_own"
on public.patients
for update
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "patients_delete_own"
on public.patients
for delete
using (created_by = auth.uid());

create policy "consents_select_own_patient"
on public.consents
for select
using (app_private.patient_is_owner(patient_id));

create policy "consents_insert_own_patient"
on public.consents
for insert
with check (
  app_private.patient_is_owner(patient_id)
  and obtained_by = auth.uid()
);

create policy "consents_update_own_patient"
on public.consents
for update
using (app_private.patient_is_owner(patient_id))
with check (app_private.patient_is_owner(patient_id));

create policy "consents_delete_own_patient"
on public.consents
for delete
using (app_private.patient_is_owner(patient_id));

create policy "visits_select_own_patient"
on public.visits
for select
using (app_private.patient_is_owner(patient_id));

create policy "visits_insert_own_patient"
on public.visits
for insert
with check (
  app_private.patient_is_owner(patient_id)
  and created_by = auth.uid()
);

create policy "visits_update_own_patient"
on public.visits
for update
using (app_private.patient_is_owner(patient_id))
with check (app_private.patient_is_owner(patient_id));

create policy "visits_delete_own_patient"
on public.visits
for delete
using (app_private.patient_is_owner(patient_id));

create policy "measurements_select_own_visit"
on public.measurements
for select
using (
  exists (
    select 1
    from public.visits v
    where v.id = measurements.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "measurements_insert_own_visit"
on public.measurements
for insert
with check (
  recorded_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    where v.id = measurements.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "measurements_update_own_visit"
on public.measurements
for update
using (
  exists (
    select 1
    from public.visits v
    where v.id = measurements.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
)
with check (
  exists (
    select 1
    from public.visits v
    where v.id = measurements.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "measurements_delete_own_visit"
on public.measurements
for delete
using (
  exists (
    select 1
    from public.visits v
    where v.id = measurements.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "cmo_scores_select_own_visit"
on public.cmo_scores
for select
using (
  exists (
    select 1
    from public.visits v
    where v.id = cmo_scores.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "cmo_scores_insert_own_visit"
on public.cmo_scores
for insert
with check (
  calculated_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    where v.id = cmo_scores.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "cmo_scores_update_own_visit"
on public.cmo_scores
for update
using (
  exists (
    select 1
    from public.visits v
    where v.id = cmo_scores.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
)
with check (
  exists (
    select 1
    from public.visits v
    where v.id = cmo_scores.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "cmo_scores_delete_own_visit"
on public.cmo_scores
for delete
using (
  exists (
    select 1
    from public.visits v
    where v.id = cmo_scores.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "interventions_select_own_visit"
on public.interventions
for select
using (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "interventions_insert_own_visit"
on public.interventions
for insert
with check (
  delivered_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "interventions_update_own_visit"
on public.interventions
for update
using (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
)
with check (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "interventions_delete_own_visit"
on public.interventions
for delete
using (
  exists (
    select 1
    from public.visits v
    where v.id = interventions.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "questionnaire_select_own_visit"
on public.questionnaire_responses
for select
using (
  exists (
    select 1
    from public.visits v
    where v.id = questionnaire_responses.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "questionnaire_insert_own_visit"
on public.questionnaire_responses
for insert
with check (
  answered_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    where v.id = questionnaire_responses.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "questionnaire_update_own_visit"
on public.questionnaire_responses
for update
using (
  exists (
    select 1
    from public.visits v
    where v.id = questionnaire_responses.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
)
with check (
  exists (
    select 1
    from public.visits v
    where v.id = questionnaire_responses.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "questionnaire_delete_own_visit"
on public.questionnaire_responses
for delete
using (
  exists (
    select 1
    from public.visits v
    where v.id = questionnaire_responses.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "audit_log_select_scope"
on public.audit_log
for select
using (
  actor_id = auth.uid()
  or (patient_id is not null and app_private.patient_is_owner(patient_id))
  or (
    visit_id is not null
    and exists (
      select 1
      from public.visits v
      where v.id = audit_log.visit_id
        and app_private.patient_is_owner(v.patient_id)
    )
  )
);

create policy "audit_log_insert_self"
on public.audit_log
for insert
with check (actor_id = auth.uid());

revoke all on function app_private.patient_is_owner(uuid) from public;
grant execute on function app_private.patient_is_owner(uuid) to authenticated;
revoke all on function app_private.write_audit_log() from public;
