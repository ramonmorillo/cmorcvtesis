-- Align physical uniqueness with service upsert onConflict target.
-- Service writes use (visit_id, questionnaire_type), so enforce same unique key.

create unique index if not exists uq_questionnaire_responses_visit_type
  on public.questionnaire_responses(visit_id, questionnaire_type);
