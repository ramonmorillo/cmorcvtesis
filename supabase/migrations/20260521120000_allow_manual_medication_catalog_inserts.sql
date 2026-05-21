-- Allow authenticated users to create manual/internal catalog entries
-- used by the "medicación no incluida en CIMA" workflow.

alter table if exists public.medication_catalog enable row level security;

drop policy if exists "medication_catalog_insert_authenticated" on public.medication_catalog;
create policy "medication_catalog_insert_authenticated"
on public.medication_catalog
for insert
to authenticated
with check (
  auth.role() = 'authenticated'
  and source in ('internal', 'manual', 'external_cima', 'external_other')
  and length(btrim(display_name)) > 0
);
