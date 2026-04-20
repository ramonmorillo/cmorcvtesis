-- Longitudinal medication module (decoupled)

create table if not exists public.medication_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'internal',
  source_code text,
  display_name text not null,
  active_ingredient text,
  strength text,
  form text,
  route text,
  atc_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_catalog_id uuid not null references public.medication_catalog(id) on delete restrict,
  dose_text text,
  frequency_text text,
  route_text text,
  indication text,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.visit_medication_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  patient_medication_id uuid not null references public.patient_medications(id) on delete cascade,
  event_type text not null check (event_type in ('added', 'modified', 'stopped', 'confirmed_no_change')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_medication_catalog_display_name
  on public.medication_catalog(display_name);
create index if not exists idx_medication_catalog_active_ingredient
  on public.medication_catalog(active_ingredient);

create index if not exists idx_patient_medications_patient_active
  on public.patient_medications(patient_id, is_active);
create index if not exists idx_patient_medications_catalog
  on public.patient_medications(medication_catalog_id);
create index if not exists idx_patient_medications_start_date
  on public.patient_medications(start_date desc);

create index if not exists idx_visit_medication_events_visit
  on public.visit_medication_events(visit_id, created_at desc);
create index if not exists idx_visit_medication_events_patient_medication
  on public.visit_medication_events(patient_medication_id, created_at desc);
create index if not exists idx_visit_medication_events_type
  on public.visit_medication_events(event_type);

create trigger trg_medication_catalog_updated_at
before update on public.medication_catalog
for each row execute function public.set_updated_at();

create trigger trg_patient_medications_updated_at
before update on public.patient_medications
for each row execute function public.set_updated_at();

alter table public.medication_catalog enable row level security;
alter table public.patient_medications enable row level security;
alter table public.visit_medication_events enable row level security;

create policy "medication_catalog_select_authenticated"
on public.medication_catalog
for select
using (auth.uid() is not null);

create policy "medication_catalog_insert_authenticated"
on public.medication_catalog
for insert
with check (auth.uid() is not null);

create policy "medication_catalog_update_authenticated"
on public.medication_catalog
for update
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "patient_medications_select_own_patient"
on public.patient_medications
for select
using (app_private.patient_is_owner(patient_id));

create policy "patient_medications_insert_own_patient"
on public.patient_medications
for insert
with check (app_private.patient_is_owner(patient_id));

create policy "patient_medications_update_own_patient"
on public.patient_medications
for update
using (app_private.patient_is_owner(patient_id))
with check (app_private.patient_is_owner(patient_id));

create policy "patient_medications_delete_own_patient"
on public.patient_medications
for delete
using (app_private.patient_is_owner(patient_id));

create policy "visit_medication_events_select_own_visit"
on public.visit_medication_events
for select
using (
  exists (
    select 1
    from public.visits v
    where v.id = visit_medication_events.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "visit_medication_events_insert_own_visit"
on public.visit_medication_events
for insert
with check (
  exists (
    select 1
    from public.visits v
    join public.patient_medications pm on pm.id = visit_medication_events.patient_medication_id
    where v.id = visit_medication_events.visit_id
      and pm.patient_id = v.patient_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "visit_medication_events_update_own_visit"
on public.visit_medication_events
for update
using (
  exists (
    select 1
    from public.visits v
    join public.patient_medications pm on pm.id = visit_medication_events.patient_medication_id
    where v.id = visit_medication_events.visit_id
      and pm.patient_id = v.patient_id
      and app_private.patient_is_owner(v.patient_id)
  )
)
with check (
  exists (
    select 1
    from public.visits v
    join public.patient_medications pm on pm.id = visit_medication_events.patient_medication_id
    where v.id = visit_medication_events.visit_id
      and pm.patient_id = v.patient_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

create policy "visit_medication_events_delete_own_visit"
on public.visit_medication_events
for delete
using (
  exists (
    select 1
    from public.visits v
    where v.id = visit_medication_events.visit_id
      and app_private.patient_is_owner(v.patient_id)
  )
);

-- Optional seed when catalog is empty.
insert into public.medication_catalog (source, display_name, active_ingredient, strength)
select seed.source, seed.display_name, seed.active_ingredient, seed.strength
from (
  values
    ('internal', 'Atorvastatina 40 mg', 'Atorvastatina', '40 mg'),
    ('internal', 'Enalapril 20 mg', 'Enalapril', '20 mg'),
    ('internal', 'Metformina 850 mg', 'Metformina', '850 mg'),
    ('internal', 'AAS 100 mg', 'Ácido acetilsalicílico', '100 mg'),
    ('internal', 'Bisoprolol 2.5 mg', 'Bisoprolol', '2.5 mg')
) as seed(source, display_name, active_ingredient, strength)
where not exists (select 1 from public.medication_catalog)
on conflict do nothing;
