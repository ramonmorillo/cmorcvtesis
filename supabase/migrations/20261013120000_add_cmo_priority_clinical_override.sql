-- Ajuste clínico del nivel de prioridad CMO tras la estratificación.
-- priority conserva su significado operativo: nivel FINAL que usan ficha, dashboard y exportación.
-- calculated_priority guarda el nivel que asignó el modelo (trazabilidad del algoritmo) y
-- priority_override_reason la justificación cuando el farmacéutico lo modifica.
alter table public.cmo_scores
  add column if not exists calculated_priority smallint,
  add column if not exists priority_override_reason text;

-- Registros previos: sin ajuste manual, el nivel calculado coincide con el guardado.
update public.cmo_scores
set calculated_priority = priority
where calculated_priority is null and priority in (1, 2, 3);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmo_scores_calculated_priority_check'
  ) then
    alter table public.cmo_scores
      add constraint cmo_scores_calculated_priority_check
      check (calculated_priority is null or calculated_priority in (1, 2, 3));
  end if;
end $$;

comment on column public.cmo_scores.calculated_priority is 'Nivel CMO asignado por el modelo de estratificación (1-3), antes de cualquier ajuste clínico.';
comment on column public.cmo_scores.priority_override_reason is 'Justificación del ajuste clínico cuando priority difiere de calculated_priority.';
