-- Plan de visita: objetivos y pendientes que acompañan al paciente de visita en visita.
-- PROPUESTA ADITIVA: solo crea una tabla nueva. No modifica ni elimina tablas, columnas ni datos.
--
-- Modelo:
--   * Un objetivo pertenece al PACIENTE, no a una visita. Nace en origin_visit_id (opcional) y
--     permanece 'pending' hasta cerrarse. No se copia de visita en visita: el número de visitas que
--     lleva arrastrado se calcula a partir de las visitas realizadas posteriores.
--   * 'done'    -> completed_at obligatorio (completed_visit_id y outcome_note opcionales).
--   * 'dropped' -> dropped_reason obligatorio: nada se descarta sin dejar constancia.
--   * catalog_code enlaza de forma blanda con cost_catalog_items.code; sin FK a propósito para no
--     acoplar esta tabla a la migración de costes.
--   * Son datos operativos de organización de la consulta, no variables de resultado de la tesis.
--   * No contiene identificadores: label y notas son texto libre, usar solo códigos de estudio.
--
-- RLS: mismo patrón que cost_catalog_items / visit_cost_items (usuarios autenticados).

create table if not exists public.visit_plan_items (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  origin_visit_id uuid references public.visits(id) on delete set null,
  kind text not null check (kind in ('parameter', 'test', 'action', 'question', 'referral')),
  label text not null check (char_length(btrim(label)) between 1 and 200),
  catalog_code text,
  status text not null default 'pending' check (status in ('pending', 'done', 'dropped')),
  completed_visit_id uuid references public.visits(id) on delete set null,
  completed_at timestamptz,
  outcome_note text,
  dropped_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint visit_plan_items_status_consistency check (
    (status = 'pending' and completed_at is null and dropped_reason is null)
    or (status = 'done' and completed_at is not null and dropped_reason is null)
    or (status = 'dropped' and char_length(btrim(coalesce(dropped_reason, ''))) > 0 and completed_at is null)
  )
);

create index if not exists idx_visit_plan_items_patient_id on public.visit_plan_items(patient_id);
create index if not exists idx_visit_plan_items_origin_visit_id on public.visit_plan_items(origin_visit_id);
create index if not exists idx_visit_plan_items_completed_visit_id on public.visit_plan_items(completed_visit_id);
create index if not exists idx_visit_plan_items_pending on public.visit_plan_items(patient_id) where status = 'pending';

create trigger set_visit_plan_items_updated_at
before update on public.visit_plan_items
for each row execute function public.set_updated_at();

alter table public.visit_plan_items enable row level security;

create policy visit_plan_items_select_authenticated
on public.visit_plan_items for select
using (auth.role() = 'authenticated');

create policy visit_plan_items_insert_authenticated
on public.visit_plan_items for insert
with check (auth.role() = 'authenticated');

create policy visit_plan_items_update_authenticated
on public.visit_plan_items for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy visit_plan_items_delete_authenticated
on public.visit_plan_items for delete
using (auth.role() = 'authenticated');
