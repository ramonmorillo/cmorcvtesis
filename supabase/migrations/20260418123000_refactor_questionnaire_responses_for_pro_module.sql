-- PRO module: visit-level questionnaire storage for IEXPAC, Morisky, and EQ-5D-5L.
-- Keeps existing table name and RLS policies while reshaping to thesis-required schema.

alter table public.questionnaire_responses
  add column if not exists patient_id uuid references public.patients(id) on delete cascade,
  add column if not exists visit_type text,
  add column if not exists questionnaire_type text,
  add column if not exists responses jsonb,
  add column if not exists total_score numeric,
  add column if not exists secondary_score numeric;

update public.questionnaire_responses qr
set
  patient_id = v.patient_id,
  visit_type = v.visit_type
from public.visits v
where v.id = qr.visit_id
  and (qr.patient_id is null or qr.visit_type is null);

alter table public.questionnaire_responses
  alter column patient_id set not null,
  alter column visit_type set not null,
  alter column questionnaire_type set not null,
  alter column responses set not null,
  alter column created_at set default timezone('utc', now()),
  alter column updated_at set default timezone('utc', now());

alter table public.questionnaire_responses
  drop constraint if exists questionnaire_responses_questionnaire_type_check;

alter table public.questionnaire_responses
  add constraint questionnaire_responses_questionnaire_type_check
  check (questionnaire_type in ('iexpac', 'morisky', 'eq5d'));

create unique index if not exists uq_questionnaire_responses_patient_visit_type
  on public.questionnaire_responses(patient_id, visit_id, questionnaire_type);

create index if not exists idx_questionnaire_responses_patient_id
  on public.questionnaire_responses(patient_id);

create index if not exists idx_questionnaire_responses_visit_id
  on public.questionnaire_responses(visit_id);

create index if not exists idx_questionnaire_responses_type
  on public.questionnaire_responses(questionnaire_type);

alter table public.questionnaire_responses
  drop column if exists questionnaire_code,
  drop column if exists question_code,
  drop column if exists response_value,
  drop column if exists answered_at,
  drop column if exists answered_by;
