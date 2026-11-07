-- Authorized document-import transaction. Existing clinical tables and RLS are unchanged.
-- Uses the original patient_is_owner helper already required by medication RLS.
-- No dependency on the optional can_read_patient/can_write_patient migration.
-- Stores only a receipt and a hash of the confirmed, structured medication fields.
begin;

-- Compatibility for deployed databases whose medication policies do not use a helper.
-- Preserve any existing helper and all clinical policies; never assign ownership.
create schema if not exists app_private;
grant usage on schema app_private to authenticated;

do $compat$
begin
  if to_regprocedure('app_private.patient_is_owner(uuid)') is null then
    execute $definition$
      create function app_private.patient_is_owner(p_patient_id uuid)
      returns boolean
      language sql
      stable
      security invoker
      set search_path = ''
      as $body$
        select auth.uid() is not null
          and exists (
            select 1
            from public.patients p
            where p.id = p_patient_id
              and p.created_by::text = auth.uid()::text
          );
      $body$;
    $definition$;
    execute 'revoke all on function app_private.patient_is_owner(uuid) from public, anon';
    execute 'grant execute on function app_private.patient_is_owner(uuid) to authenticated';
  end if;
end;
$compat$;

create table if not exists public.medication_import_receipts (
  operation_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  request_hash text not null,
  medication_ids uuid[] not null,
  created_at timestamptz not null default now()
);
alter table public.medication_import_receipts enable row level security;
drop policy if exists medication_import_receipts_select on public.medication_import_receipts;
create policy medication_import_receipts_select on public.medication_import_receipts
  for select to authenticated using (actor_id = auth.uid() and app_private.patient_is_owner(patient_id));
drop policy if exists medication_import_receipts_insert on public.medication_import_receipts;
create policy medication_import_receipts_insert on public.medication_import_receipts
  for insert to authenticated with check (
    actor_id = auth.uid() and app_private.patient_is_owner(patient_id)
    and exists (select 1 from public.visits v where v.id = visit_id and v.patient_id = medication_import_receipts.patient_id)
  );
revoke all on public.medication_import_receipts from anon, public, authenticated;
grant select, insert on public.medication_import_receipts to authenticated;

create or replace function public.import_visit_medication_document(
  p_operation_id uuid, p_patient_id uuid, p_visit_id uuid, p_rows jsonb
) returns uuid[]
language plpgsql security invoker set search_path = '' as $$
declare
  v_visit public.visits%rowtype;
  v_receipt public.medication_import_receipts%rowtype;
  v_row jsonb;
  v_catalog public.medication_catalog%rowtype;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_catalogs uuid[] := '{}';
  v_hash text;
begin
  if auth.uid() is null or not app_private.patient_is_owner(p_patient_id) then
    raise exception 'Importación no autorizada' using errcode = '42501';
  end if;
  if p_operation_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception 'Lote inválido' using errcode = '22023';
  end if;
  -- Serialize imports for this patient (also waits for FK-based concurrent inserts).
  perform id from public.patients where id = p_patient_id for update;
  if not found then raise exception 'Paciente no disponible' using errcode = '42501'; end if;
  select * into v_visit from public.visits where id = p_visit_id and patient_id = p_patient_id;
  if not found then raise exception 'Visita no disponible para este paciente' using errcode = '42501'; end if;
  v_hash := md5(jsonb_build_object('patient',p_patient_id,'visit',p_visit_id,'rows',p_rows)::text);
  select * into v_receipt from public.medication_import_receipts where operation_id = p_operation_id;
  if found then
    if v_receipt.actor_id <> auth.uid() or v_receipt.request_hash <> v_hash then
      raise exception 'La clave de operación ya corresponde a otro lote' using errcode = '22023';
    end if;
    return v_receipt.medication_ids;
  end if;
  -- Match visitService chronological date, visit number, type, creation ordering.
  -- Fully tied visits with medication are conservatively treated as historical.
  if exists (
    with normalized as (
      select v.*, case v.visit_type::text
        when 'baseline' then 1 when 'month_3' then 2 when 'month3' then 2 when 'follow_up' then 2
        when 'month_6' then 3 when 'month6' then 3 when 'month_9' then 4 when 'month9' then 4
        when 'month_12' then 5 when 'month12' then 5 else null end as default_number,
        case when v.visit_type::text in ('extra','extraordinary') then 99 else null end as extra_order
      from public.visits v where v.patient_id = p_patient_id
    ), ordered as (
      select n.id, row(coalesce(n.visit_date,n.scheduled_date,'infinity'::date),
        coalesce(n.visit_number,n.default_number,9007199254740991::bigint),
        coalesce(n.default_number,n.extra_order,9007199254740991::bigint),n.created_at) as sort_key
      from normalized n
    )
    select 1 from ordered later join public.visit_medication_events e on e.visit_id = later.id
    where later.id <> p_visit_id and later.sort_key >= (select current.sort_key from ordered current where current.id = p_visit_id)
  ) then raise exception 'Visita histórica: no se puede importar medicación' using errcode = '22023'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' or exists (
      select 1 from jsonb_object_keys(v_row) k where k not in ('medication_catalog_id','dose_text','frequency_text','route_text')
    ) or not (v_row ? 'medication_catalog_id') then
      raise exception 'Campos de importación inválidos' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_each(v_row) field where jsonb_typeof(field.value) <> 'string' or length(field.value #>> '{}') > 240) then
      raise exception 'Valores de importación inválidos' using errcode = '22023';
    end if;
    select * into v_catalog from public.medication_catalog where id = (v_row->>'medication_catalog_id')::uuid;
    if not found then raise exception 'Medicamento de catálogo no disponible' using errcode = '22023'; end if;
    if v_catalog.id = any(v_catalogs) or exists (
      select 1 from public.patient_medications pm join public.medication_catalog c on c.id = pm.medication_catalog_id
      where pm.patient_id = p_patient_id and (
        c.id = v_catalog.id
        or lower(trim(c.display_name)) = lower(trim(v_catalog.display_name))
        or (nullif(trim(c.active_ingredient),'') is not null
          and lower(trim(c.active_ingredient)) = lower(trim(v_catalog.active_ingredient)))
      )
    ) then raise exception 'Posible duplicado: revisa la medicación registrada' using errcode = '23505'; end if;
    v_catalogs := array_append(v_catalogs,v_catalog.id);
    insert into public.patient_medications (patient_id,medication_catalog_id,dose_text,frequency_text,route_text,is_active)
      values (p_patient_id,v_catalog.id,nullif(trim(v_row->>'dose_text'),''),nullif(trim(v_row->>'frequency_text'),''),nullif(trim(v_row->>'route_text'),''),true)
      returning id into v_id;
    insert into public.visit_medication_events (visit_id,patient_medication_id,event_type,old_value,new_value)
      values (p_visit_id,v_id,'added',null,jsonb_build_object(
        'medication_catalog_id',v_catalog.id,'dose_text',nullif(trim(v_row->>'dose_text'),''),
        'frequency_text',nullif(trim(v_row->>'frequency_text'),''),'route_text',nullif(trim(v_row->>'route_text'),''),
        'is_active',true,'indication',null,'start_date',null,'end_date',null,'notes',null));
    v_ids := array_append(v_ids,v_id);
  end loop;
  insert into public.medication_import_receipts (operation_id,actor_id,patient_id,visit_id,request_hash,medication_ids)
    values (p_operation_id,auth.uid(),p_patient_id,p_visit_id,v_hash,v_ids);
  return v_ids;
end;
$$;
revoke all on function public.import_visit_medication_document(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.import_visit_medication_document(uuid,uuid,uuid,jsonb) to authenticated;

commit;
