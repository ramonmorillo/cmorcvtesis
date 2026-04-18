-- Canonical questionnaire map to avoid fragile UI-label heuristics.
-- Keeps compatibility with legacy questionnaire_responses rows that rely on measurement_id.

create table if not exists public.questionnaire_measurement_map (
  questionnaire_code text primary key,
  measurement_id uuid not null unique references public.measurements(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint questionnaire_measurement_map_code_check
    check (questionnaire_code in ('IEXPAC', 'MORISKY_GREEN', 'EQ5D_5L'))
);

create trigger trg_questionnaire_measurement_map_updated_at
before update on public.questionnaire_measurement_map
for each row execute function public.set_updated_at();

alter table public.questionnaire_measurement_map enable row level security;
alter table public.questionnaire_measurement_map force row level security;

create policy questionnaire_measurement_map_select_scope
on public.questionnaire_measurement_map
for select to authenticated
using (true);

create policy questionnaire_measurement_map_insert_scope
on public.questionnaire_measurement_map
for insert to authenticated
with check (app_private.has_role(array['clinician', 'admin']));

create policy questionnaire_measurement_map_update_scope
on public.questionnaire_measurement_map
for update to authenticated
using (app_private.has_role(array['clinician', 'admin']))
with check (app_private.has_role(array['clinician', 'admin']));

create policy questionnaire_measurement_map_delete_scope
on public.questionnaire_measurement_map
for delete to authenticated
using (app_private.has_role(array['admin']));

with ranked_map as (
  select
    qr.questionnaire_type,
    qr.measurement_id,
    row_number() over (
      partition by qr.questionnaire_type
      order by count(*) desc, max(qr.updated_at) desc, qr.measurement_id
    ) as rn
  from public.questionnaire_responses qr
  where qr.measurement_id is not null
    and qr.questionnaire_type in ('iexpac', 'morisky', 'eq5d')
  group by qr.questionnaire_type, qr.measurement_id
), canonical_map as (
  select
    case questionnaire_type
      when 'iexpac' then 'IEXPAC'
      when 'morisky' then 'MORISKY_GREEN'
      when 'eq5d' then 'EQ5D_5L'
      else null
    end as questionnaire_code,
    measurement_id
  from ranked_map
  where rn = 1
)
insert into public.questionnaire_measurement_map (questionnaire_code, measurement_id)
select questionnaire_code, measurement_id
from canonical_map
where questionnaire_code is not null
on conflict (questionnaire_code) do update
set measurement_id = excluded.measurement_id,
    updated_at = timezone('utc', now());
