-- Fix medication_catalog RLS to allow authenticated inserts from supported sources
-- while keeping policy scope minimal and explicit.

alter table if exists public.medication_catalog enable row level security;

-- Replace legacy policies with explicit authenticated-targeted rules.
drop policy if exists "medication_catalog_select_authenticated" on public.medication_catalog;
drop policy if exists "medication_catalog_insert_authenticated" on public.medication_catalog;
drop policy if exists "medication_catalog_update_authenticated" on public.medication_catalog;

drop policy if exists "medication_catalog_select_scope" on public.medication_catalog;
drop policy if exists "medication_catalog_insert_scope" on public.medication_catalog;
drop policy if exists "medication_catalog_update_scope" on public.medication_catalog;

create policy "medication_catalog_select_authenticated"
on public.medication_catalog
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "medication_catalog_insert_authenticated"
on public.medication_catalog
for insert
to authenticated
with check (
  auth.role() = 'authenticated'
  and source in ('internal', 'external_cima', 'external_other')
  and length(btrim(display_name)) > 0
);

create policy "medication_catalog_update_authenticated"
on public.medication_catalog
for update
to authenticated
using (auth.role() = 'authenticated')
with check (
  auth.role() = 'authenticated'
  and source in ('internal', 'external_cima', 'external_other')
  and length(btrim(display_name)) > 0
);
