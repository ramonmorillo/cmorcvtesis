# Production schema reconciliation notes

## Root cause summary
Production was not fully migrated through the repository's migration chain. The current app expects `cmo_scores`, `measurements`, and `questionnaire_responses` plus their supporting RLS predicates, triggers, and indexes from the initial and hardening migrations.

## Minimum required missing objects
- `public.profiles` (required by FK references and runtime profile upsert in score persistence flow)
- `public.measurements`
- `public.cmo_scores`
- `public.questionnaire_responses`
- `public.set_updated_at()` trigger function
- `app_private.current_profile_role()`
- `app_private.has_any_role(text[])`
- `app_private.can_read_patient(uuid)`
- `app_private.can_write_patient(uuid)`
- `app_private.patient_is_owner(uuid)`
- `updated_at` triggers for `profiles`, `measurements`, `cmo_scores`, `questionnaire_responses`
- runtime indexes for the 3 missing tables
- authenticated RLS policies for `profiles`, `measurements`, `cmo_scores`, `questionnaire_responses`

## Safety and execution order
1. Run the reconciliation script in Supabase SQL Editor as a single transaction.
2. The script is additive/idempotent (`IF NOT EXISTS` + `CREATE OR REPLACE` + guarded policy creation).
3. Existing `patients`, `visits`, and `interventions` data is preserved.
