-- Proceso y factibilidad por visita (alineado con variables de tesis)

create table if not exists public.visit_process_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  session_total_minutes integer check (session_total_minutes is null or session_total_minutes >= 0),
  stratification_performed boolean,
  stratification_level text,
  stratification_completed_correctly boolean,
  pharmacist_intervention_recorded boolean,
  interventions_count integer check (interventions_count is null or interventions_count >= 0),
  recommendation_to_other_professional boolean,
  recommendation_status text check (recommendation_status in ('accepted', 'not_accepted', 'pending', 'not_applicable')),
  continues_in_program boolean,
  dropout_reason text,
  operational_incidents text,
  administrative_time_minutes integer check (administrative_time_minutes is null or administrative_time_minutes >= 0),
  professional_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_visit_process_records_patient_id on public.visit_process_records(patient_id);
create index if not exists idx_visit_process_records_visit_id on public.visit_process_records(visit_id);
create index if not exists idx_visit_process_records_program_status on public.visit_process_records(continues_in_program);

create trigger trg_visit_process_records_updated_at
before update on public.visit_process_records
for each row execute function public.set_updated_at();

create trigger trg_visit_process_records_audit_log
after insert or update or delete on public.visit_process_records
for each row execute function app_private.write_audit_log();

alter table public.visit_process_records enable row level security;
alter table public.visit_process_records force row level security;

create policy visit_process_records_select_scope
on public.visit_process_records
for select
to authenticated
using (app_private.can_read_patient(patient_id));

create policy visit_process_records_insert_scope
on public.visit_process_records
for insert
to authenticated
with check (
  app_private.can_write_patient(patient_id)
  and exists (
    select 1
    from public.visits v
    where v.id = visit_id
      and v.patient_id = patient_id
  )
  and (
    app_private.has_any_role(array['admin'])
    or professional_user_id = auth.uid()
    or professional_user_id is null
  )
);

create policy visit_process_records_update_scope
on public.visit_process_records
for update
to authenticated
using (app_private.can_write_patient(patient_id))
with check (
  app_private.can_write_patient(patient_id)
  and exists (
    select 1
    from public.visits v
    where v.id = visit_id
      and v.patient_id = patient_id
  )
  and (
    app_private.has_any_role(array['admin'])
    or professional_user_id = auth.uid()
    or professional_user_id is null
  )
);

create policy visit_process_records_delete_scope
on public.visit_process_records
for delete
to authenticated
using (app_private.can_write_patient(patient_id));
