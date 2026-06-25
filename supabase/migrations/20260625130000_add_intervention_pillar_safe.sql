-- Add the CMO pillar column to interventions without deleting or rewriting rows.
alter table public.interventions
  add column if not exists intervention_pillar text;

-- Normalize only previously stored lowercase pillar values to the canonical labels.
update public.interventions
set intervention_pillar = case lower(trim(intervention_pillar))
  when 'capacidad' then 'Capacidad'
  when 'motivacion' then 'Motivación'
  when 'motivación' then 'Motivación'
  when 'oportunidad' then 'Oportunidad'
  else intervention_pillar
end
where intervention_pillar is not null
  and trim(intervention_pillar) <> '';

-- Replace the earlier lowercase-only constraint if it exists; this is non-destructive
-- and avoids blocking the canonical values used by the application.
alter table public.interventions
  drop constraint if exists interventions_pillar_check;

alter table public.interventions
  drop constraint if exists interventions_intervention_pillar_check;

alter table public.interventions
  add constraint interventions_intervention_pillar_check
  check (
    intervention_pillar is null
    or intervention_pillar in ('Capacidad', 'Motivación', 'Oportunidad')
  );
