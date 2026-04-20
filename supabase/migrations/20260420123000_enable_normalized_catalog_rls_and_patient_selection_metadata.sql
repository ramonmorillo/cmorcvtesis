-- Align normalized medication catalog access + patient medication selection metadata.

alter table if exists public.patient_medications
  add column if not exists catalog_concept_id uuid references public.med_catalog_concepts(id) on delete set null,
  add column if not exists catalog_product_id uuid references public.med_catalog_products(id) on delete set null,
  add column if not exists selection_source text,
  add column if not exists selected_label_snapshot text,
  add column if not exists selected_source_payload jsonb;

alter table if exists public.patient_medications
  drop constraint if exists patient_medications_selection_source_check;

alter table if exists public.patient_medications
  add constraint patient_medications_selection_source_check
  check (selection_source is null or selection_source in ('internal', 'external_cima', 'external_other', 'manual'));

create index if not exists idx_patient_medications_catalog_concept
  on public.patient_medications(catalog_concept_id)
  where catalog_concept_id is not null;

create index if not exists idx_patient_medications_catalog_product
  on public.patient_medications(catalog_product_id)
  where catalog_product_id is not null;

create index if not exists idx_patient_medications_selection_source
  on public.patient_medications(selection_source)
  where selection_source is not null;

-- Enable RLS on normalized catalog tables (if available in current environment).
alter table if exists public.med_catalog_ingredients enable row level security;
alter table if exists public.med_catalog_concepts enable row level security;
alter table if exists public.med_catalog_concept_ingredients enable row level security;
alter table if exists public.med_catalog_products enable row level security;
alter table if exists public.med_catalog_aliases enable row level security;

-- Read for authenticated users.
do $$
begin
  if exists (select 1 from pg_class where relname = 'med_catalog_ingredients' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_ingredients' and policyname = 'med_catalog_ingredients_select_authenticated'
     ) then
    create policy med_catalog_ingredients_select_authenticated
      on public.med_catalog_ingredients
      for select
      to authenticated
      using (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_concepts' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_concepts' and policyname = 'med_catalog_concepts_select_authenticated'
     ) then
    create policy med_catalog_concepts_select_authenticated
      on public.med_catalog_concepts
      for select
      to authenticated
      using (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_products' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_products' and policyname = 'med_catalog_products_select_authenticated'
     ) then
    create policy med_catalog_products_select_authenticated
      on public.med_catalog_products
      for select
      to authenticated
      using (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_concept_ingredients' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_concept_ingredients' and policyname = 'med_catalog_concept_ingredients_select_authenticated'
     ) then
    create policy med_catalog_concept_ingredients_select_authenticated
      on public.med_catalog_concept_ingredients
      for select
      to authenticated
      using (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_aliases' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_aliases' and policyname = 'med_catalog_aliases_select_authenticated'
     ) then
    create policy med_catalog_aliases_select_authenticated
      on public.med_catalog_aliases
      for select
      to authenticated
      using (auth.uid() is not null);
  end if;
end
$$;

-- Write for authenticated users to support normalization upsert path.
do $$
begin
  if exists (select 1 from pg_class where relname = 'med_catalog_ingredients' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_ingredients' and policyname = 'med_catalog_ingredients_write_authenticated'
     ) then
    create policy med_catalog_ingredients_write_authenticated
      on public.med_catalog_ingredients
      for all
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_concepts' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_concepts' and policyname = 'med_catalog_concepts_write_authenticated'
     ) then
    create policy med_catalog_concepts_write_authenticated
      on public.med_catalog_concepts
      for all
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_products' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_products' and policyname = 'med_catalog_products_write_authenticated'
     ) then
    create policy med_catalog_products_write_authenticated
      on public.med_catalog_products
      for all
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_concept_ingredients' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_concept_ingredients' and policyname = 'med_catalog_concept_ingredients_write_authenticated'
     ) then
    create policy med_catalog_concept_ingredients_write_authenticated
      on public.med_catalog_concept_ingredients
      for all
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null);
  end if;

  if exists (select 1 from pg_class where relname = 'med_catalog_aliases' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'med_catalog_aliases' and policyname = 'med_catalog_aliases_write_authenticated'
     ) then
    create policy med_catalog_aliases_write_authenticated
      on public.med_catalog_aliases
      for all
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null);
  end if;
end
$$;
