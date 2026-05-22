-- Restrict medication_catalog writes to canonical sources used by medication flows.
alter table if exists public.medication_catalog enable row level security;

drop policy if exists "medication_catalog_select_authenticated" on public.medication_catalog;
create policy "medication_catalog_select_authenticated"
on public.medication_catalog
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "medication_catalog_insert_authenticated" on public.medication_catalog;
drop policy if exists "medication_catalog_insert_allowed_sources_authenticated" on public.medication_catalog;
create policy "medication_catalog_insert_allowed_sources_authenticated"
on public.medication_catalog
for insert
to authenticated
with check (
  auth.role() = 'authenticated'
  and source in ('external_cima', 'manual')
);

-- Upserts are not used in medication_catalog write paths; keep update closed by default.
drop policy if exists "medication_catalog_update_authenticated" on public.medication_catalog;
