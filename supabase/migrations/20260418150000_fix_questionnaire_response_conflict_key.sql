-- Align questionnaire_responses physical uniqueness with measurement-based upsert.

drop index if exists public.uq_questionnaire_responses_visit_type;
drop index if exists public.uq_questionnaire_responses_patient_visit_type;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questionnaire_responses_visit_id_measurement_id_key'
      and conrelid = 'public.questionnaire_responses'::regclass
  ) then
    alter table public.questionnaire_responses
      add constraint questionnaire_responses_visit_id_measurement_id_key
      unique (visit_id, measurement_id);
  end if;
end
$$;
