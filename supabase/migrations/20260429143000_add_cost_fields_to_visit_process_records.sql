alter table public.visit_process_records
  add column if not exists equipment_cost numeric,
  add column if not exists additional_material_cost numeric,
  add column if not exists other_costs numeric;
