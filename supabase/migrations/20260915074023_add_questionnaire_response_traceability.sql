-- Make questionnaire identity explicit on every response.
--
-- The legacy model inferred the questionnaire from a global measurement_id.
-- That identifier is retained for backwards compatibility, but visit_id plus
-- questionnaire_code becomes the canonical identity used by reports.

alter table public.questionnaire_responses
  add column if not exists questionnaire_code text;

-- Keep writes from the currently deployed client safe during rollout. The
-- trigger fills the new canonical column for legacy payloads and rejects a
-- payload whose explicit code contradicts its legacy measurement mapping.
create or replace function app_private.set_questionnaire_response_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  mapped_code text;
begin
  select qmm.questionnaire_code
  into mapped_code
  from public.questionnaire_measurement_map qmm
  where qmm.measurement_id = new.measurement_id;

  if mapped_code is null then
    raise exception 'No canonical questionnaire mapping exists for measurement_id %.', new.measurement_id;
  end if;

  if new.questionnaire_code is null then
    new.questionnaire_code := mapped_code;
  elsif new.questionnaire_code <> mapped_code then
    raise exception 'questionnaire_code does not match measurement_id mapping.';
  end if;

  return new;
end
$$;

drop trigger if exists trg_questionnaire_response_code
  on public.questionnaire_responses;

create trigger trg_questionnaire_response_code
before insert or update of measurement_id, questionnaire_code
on public.questionnaire_responses
for each row execute function app_private.set_questionnaire_response_code();

update public.questionnaire_responses qr
set questionnaire_code = qmm.questionnaire_code
from public.questionnaire_measurement_map qmm
where qr.questionnaire_code is null
  and qmm.measurement_id = qr.measurement_id;

do $$
begin
  if exists (
    select 1
    from public.questionnaire_responses
    where questionnaire_code is null
  ) then
    raise exception
      'Cannot establish questionnaire traceability: responses without a canonical questionnaire mapping exist.';
  end if;

  if exists (
    select 1
    from public.questionnaire_responses
    group by visit_id, questionnaire_code
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce questionnaire traceability: duplicate responses exist for the same visit and questionnaire.';
  end if;
end
$$;

alter table public.questionnaire_responses
  alter column questionnaire_code set not null;

alter table public.questionnaire_responses
  drop constraint if exists questionnaire_responses_questionnaire_code_check;

alter table public.questionnaire_responses
  add constraint questionnaire_responses_questionnaire_code_check
  check (questionnaire_code in ('IEXPAC', 'MORISKY_GREEN', 'EQ5D_5L', 'PAM10'));

alter table public.questionnaire_responses
  drop constraint if exists questionnaire_responses_visit_id_measurement_id_key;

drop index if exists public.uq_questionnaire_responses_visit_type;
drop index if exists public.uq_questionnaire_responses_patient_visit_type;

create unique index if not exists uq_questionnaire_responses_visit_questionnaire
  on public.questionnaire_responses(visit_id, questionnaire_code);

create index if not exists idx_questionnaire_responses_questionnaire_code
  on public.questionnaire_responses(questionnaire_code);
