-- Catálogo de costes por aparataje/procedimientos y partidas de coste por visita.
-- PROPUESTA ADITIVA: solo crea tablas nuevas y siembra el catálogo inicial.
-- No modifica ni elimina tablas, columnas ni datos existentes
-- (visit_process_records.equipment_cost se conserva intacto).
--
-- Regla histórica:
--   * cost_catalog_items.unit_price          = precio de catálogo (referencia vigente).
--   * visit_cost_items.unit_price_applied    = precio aplicado a la partida concreta.
--   Cambiar el precio de catálogo NO recalcula partidas ya valoradas. Las partidas
--   pendientes (price_source = 'pending', unit_price_applied null) solo se valoran
--   mediante una acción explícita, conservando la cantidad original y registrando
--   procedencia (price_source) y momento (price_applied_at).
--   El coste total no se almacena: se calcula como cantidad × precio aplicado.

create table if not exists public.cost_catalog_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  pricing_mode text not null check (pricing_mode in ('fixed', 'variable', 'pending')),
  unit_price numeric(10, 2) check (unit_price is null or unit_price >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- Un concepto de precio fijo debe tener precio; uno pendiente o variable no tiene precio de catálogo.
  constraint cost_catalog_items_price_mode_consistency check (
    (pricing_mode = 'fixed' and unit_price is not null)
    or (pricing_mode in ('variable', 'pending') and unit_price is null)
  )
);

create table if not exists public.visit_cost_items (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  catalog_item_id uuid not null references public.cost_catalog_items(id) on delete restrict,
  concept_label_snapshot text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price_applied numeric(10, 2) check (unit_price_applied is null or unit_price_applied >= 0),
  price_source text not null check (price_source in ('catalog', 'manual', 'pending')),
  price_applied_at timestamptz,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- 'pending' <=> sin precio aplicado; importe desconocido nunca se guarda como 0.
  constraint visit_cost_items_price_consistency check (
    (price_source = 'pending' and unit_price_applied is null and price_applied_at is null)
    or (price_source in ('catalog', 'manual') and unit_price_applied is not null and price_applied_at is not null)
  )
);

create index if not exists idx_visit_cost_items_visit_id on public.visit_cost_items(visit_id);
create index if not exists idx_visit_cost_items_patient_id on public.visit_cost_items(patient_id);
create index if not exists idx_visit_cost_items_pending on public.visit_cost_items(catalog_item_id) where price_source = 'pending';

create trigger set_cost_catalog_items_updated_at
before update on public.cost_catalog_items
for each row execute function public.set_updated_at();

create trigger set_visit_cost_items_updated_at
before update on public.visit_cost_items
for each row execute function public.set_updated_at();

-- RLS: mismo patrón que la tabla hermana visit_process_records en producción
-- (usuarios autenticados). No se modifica ninguna política existente.
alter table public.cost_catalog_items enable row level security;
alter table public.visit_cost_items enable row level security;

create policy cost_catalog_items_select_authenticated
on public.cost_catalog_items for select
using (auth.role() = 'authenticated');

-- Mantenimiento de precios desde un único punto. Sin INSERT/DELETE desde la app:
-- los conceptos nuevos se añaden por migración.
create policy cost_catalog_items_update_authenticated
on public.cost_catalog_items for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy visit_cost_items_select_authenticated
on public.visit_cost_items for select
using (auth.role() = 'authenticated');

create policy visit_cost_items_insert_authenticated
on public.visit_cost_items for insert
with check (auth.role() = 'authenticated');

create policy visit_cost_items_update_authenticated
on public.visit_cost_items for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy visit_cost_items_delete_authenticated
on public.visit_cost_items for delete
using (auth.role() = 'authenticated');

-- Catálogo inicial (fuente: control_costes_tesis.xlsx). No se inventan precios:
-- los conceptos sin precio quedan 'pending' (o 'variable') con unit_price null.
insert into public.cost_catalog_items (code, label, pricing_mode, unit_price, notes)
values
  ('hba1c_pl_discs', 'Discos HbA1c/PL', 'fixed', 6.90, '6,90 € por unidad'),
  ('photocopies', 'Fotocopias', 'variable', null, 'Introducir precio por copia y cantidad'),
  ('af_screening', 'Cribado de fibrilación auricular (FA)', 'pending', null, 'Pendiente de calcular coste por cribado'),
  ('abpm', 'MAPA', 'pending', null, 'Pendiente de calcular coste por prueba'),
  ('bp_measurement', 'Medición de tensión arterial', 'pending', null, 'Pendiente de calcular coste por medición'),
  ('fasting_glucose', 'Medición de glucosa en ayunas', 'pending', null, 'Pendiente de calcular coste por medición')
on conflict (code) do nothing;
