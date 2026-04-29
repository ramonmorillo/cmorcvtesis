-- Add PAM-10 questionnaire support to PRO questionnaire model (non-destructive).

alter table public.questionnaire_responses
  drop constraint if exists questionnaire_responses_questionnaire_type_check;

alter table public.questionnaire_responses
  add constraint questionnaire_responses_questionnaire_type_check
  check (questionnaire_type in ('iexpac', 'morisky', 'eq5d', 'pam10'));

alter table public.questionnaire_measurement_map
  drop constraint if exists questionnaire_measurement_map_code_check;

alter table public.questionnaire_measurement_map
  add constraint questionnaire_measurement_map_code_check
  check (questionnaire_code in ('IEXPAC', 'MORISKY_GREEN', 'EQ5D_5L', 'PAM10'));
