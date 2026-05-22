-- Harden medication_catalog insert/update policy for manual and legacy non-CIMA sources.

alter table if exists public.medication_catalog enable row level security;

drop policy if exists "medication_catalog_insert_authenticated" on public.medication_catalog;
create policy "medication_catalog_insert_authenticated"
on public.medication_catalog
for insert
to authenticated
with check (
  auth.uid() is not null
  and source in ('internal', 'manual', 'manual_non_cima', 'external_cima', 'external_other')
  and length(btrim(display_name)) > 0
);

drop policy if exists "medication_catalog_update_authenticated" on public.medication_catalog;
create policy "medication_catalog_update_authenticated"
on public.medication_catalog
for update
to authenticated
using (auth.uid() is not null)
with check (
  auth.uid() is not null
  and source in ('internal', 'manual', 'manual_non_cima', 'external_cima', 'external_other')
  and length(btrim(display_name)) > 0
);
