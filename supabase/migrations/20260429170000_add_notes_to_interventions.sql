-- Ensure thesis intervention notes are persisted.
alter table public.interventions
  add column if not exists notes text;
