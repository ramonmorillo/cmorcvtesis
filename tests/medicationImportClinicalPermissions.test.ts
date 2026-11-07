import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
const actor = '11111111-1111-4111-8111-111111111111';
const creator = '22222222-2222-4222-8222-222222222222';
const patient = '33333333-3333-4333-8333-333333333333';
const visit = '44444444-4444-4444-8444-444444444444';
const catalog = '55555555-5555-4555-8555-555555555555';
const operation = '66666666-6666-4666-8666-666666666666';
const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const base = sql('20261107100000_atomic_medication_document_import.sql');
const patch = sql('20261107120000_align_medication_import_with_clinical_rls.sql');
let db: PGlite;
const input = [
  { medication_catalog_id: catalog, dose_text: '1 comprimido', frequency_text: 'cada 24 h', route_text: 'oral' },
];
const invoke = (op = operation, v = visit) =>
  db.query('select import_visit_medication_document($1,$2,$3,$4::jsonb) as ids', [
    op,
    patient,
    v,
    JSON.stringify(input),
  ]);
async function rejectSafely(action: () => Promise<unknown>, pattern: RegExp) {
  await db.exec('savepoint failure');
  await expect(action()).rejects.toThrow(pattern);
  await db.exec('rollback to savepoint failure');
}
async function counts() {
  return (
    await db.query(
      'select (select count(*)::int from patient_medications) as medications, (select count(*)::int from visit_medication_events) as events, (select count(*)::int from medication_import_receipts) as receipts',
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema app_private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table patients(id uuid primary key,created_by uuid);
    create table visits(id uuid primary key,patient_id uuid references patients(id),visit_date date,scheduled_date date,visit_number int,visit_type text,created_at timestamptz default now());
    create function app_private.patient_is_owner(p uuid) returns boolean language sql security definer as $$select exists(select 1 from public.patients where id=p and created_by=auth.uid())$$;
    create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;
    insert into auth.users values('${actor}'),('${creator}');
    insert into patients values('${patient}','${creator}');
    insert into visits(id,patient_id,visit_type,visit_date) values('${visit}','${patient}','extra','2031-01-01');`);
  await db.exec(sql('20260420110000_add_medication_longitudinal_module.sql'));
  await db.exec(`delete from medication_catalog;insert into medication_catalog(id,display_name) values('${catalog}','MEDICAMENTO SINTETICO 20 mg');
    do $$declare p record;begin for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('patient_medications','visit_medication_events') loop execute format('drop policy %I on public.%I',p.policyname,p.tablename);end loop;end;$$;
    alter table patients enable row level security;alter table visits enable row level security;
    create policy patients_all_authenticated on patients for all to authenticated using(true) with check(true);
    create policy visits_all_authenticated on visits for all to authenticated using(true) with check(true);
    create policy patient_meds_all on patient_medications for all to authenticated using(true) with check(true);
    create policy visit_med_events_all on visit_medication_events for all to authenticated using(true) with check(true);
    grant usage on schema public,auth,app_private to authenticated;
    grant select on patients,visits,medication_catalog to authenticated;
    grant select,insert on patient_medications,visit_medication_events to authenticated;
    create function deny_event() returns trigger language plpgsql as $$begin if current_setting('test.reject_event',true)='true' then raise exception 'synthetic event rejection';end if;return new;end;$$;
    create trigger fail_event before insert on visit_medication_events for each row execute function deny_event();`);
  await db.exec(base);
  // Reproduce the reported mismatch: medication RLS allows this actor, but the old RPC rejects them.
  await db.exec(`begin;set local role authenticated;set local "request.jwt.claim.sub"='${actor}';`);
  await rejectSafely(() => invoke(), /Importación no autorizada/);
  await db.exec('rollback');
  await db.exec(patch);
  await db.exec(patch); // Safe to reapply without removing records.
}, 30000);
beforeEach(async () => {
  await db.exec(`begin;set local role authenticated;set local "request.jwt.claim.sub"='${actor}';`);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});
it('allows the extraordinary visit when existing clinical policies allow the caller, without patient UPDATE privilege', async () => {
  expect((await db.query("select has_table_privilege(current_user,'patients','UPDATE') as allowed")).rows[0]).toEqual({
    allowed: false,
  });
  await invoke();
  expect(await counts()).toEqual({ medications: 1, events: 1, receipts: 1 });
  expect((await db.query('select created_by from patients')).rows[0]).toEqual({ created_by: creator });
});
it('does not require inventing an owner for legacy patients', async () => {
  await db.exec(`reset role;update patients set created_by=null;set local role authenticated;`);
  await invoke();
  expect(await counts()).toEqual({ medications: 1, events: 1, receipts: 1 });
});
it('still rejects anonymous callers', async () => {
  await db.exec(`set local "request.jwt.claim.sub"=''`);
  await rejectSafely(() => invoke(), /Importación no autorizada/);
  expect(await counts()).toEqual({ medications: 0, events: 0, receipts: 0 });
});
it('does not bypass a restrictive patient policy', async () => {
  await db.exec(
    `reset role;alter policy patients_all_authenticated on patients using(created_by=auth.uid()) with check(created_by=auth.uid());set local role authenticated;`,
  );
  await rejectSafely(() => invoke(), /Paciente no disponible/);
  expect(await counts()).toEqual({ medications: 0, events: 0, receipts: 0 });
});
it('does not bypass restrictive medication INSERT policies', async () => {
  await db.exec(
    `reset role;alter policy patient_meds_all on patient_medications with check(false);set local role authenticated;`,
  );
  await rejectSafely(() => invoke(), /row-level security/);
  expect(await counts()).toEqual({ medications: 0, events: 0, receipts: 0 });
});
it('rolls back medication and receipt if an event fails', async () => {
  await db.exec(`set local "test.reject_event"='true';`);
  await rejectSafely(() => invoke(), /synthetic event rejection/);
  expect(await counts()).toEqual({ medications: 0, events: 0, receipts: 0 });
});
it('retains idempotency and duplicate prevention', async () => {
  const first = await invoke();
  expect(await invoke()).toEqual(first);
  await rejectSafely(() => invoke('77777777-7777-4777-8777-777777777777'), /duplicado/);
  expect(await counts()).toEqual({ medications: 1, events: 1, receipts: 1 });
});
it('keeps receipts private to their actor in shared patients', async () => {
  await invoke();
  await db.exec(`set local "request.jwt.claim.sub"='${creator}'`);
  expect((await db.query('select count(*)::int as n from medication_import_receipts')).rows).toEqual([{ n: 0 }]);
});
it('rejects a different patient/visit pair', async () => {
  await rejectSafely(() => invoke(operation, '88888888-8888-4888-8888-888888888888'), /Visita no disponible/);
  expect(await counts()).toEqual({ medications: 0, events: 0, receipts: 0 });
});
it('retains historical visit protection', async () => {
  const later = '99999999-9999-4999-8999-999999999999';
  await db.exec(
    `reset role;insert into visits(id,patient_id,visit_type,visit_date) values('${later}','${patient}','extra','2031-02-01');set local role authenticated;`,
  );
  await invoke(operation, later);
  await rejectSafely(() => invoke('77777777-7777-4777-8777-777777777777'), /histórica/);
  expect(await counts()).toEqual({ medications: 1, events: 1, receipts: 1 });
});

it('does not bypass restrictive visit-event INSERT policies', async () => {
  await db.exec(
    `reset role;alter policy visit_med_events_all on visit_medication_events with check(false);set local role authenticated;`,
  );
  await rejectSafely(() => invoke(), /row-level security/);
  expect(await counts()).toEqual({ medications: 0, events: 0, receipts: 0 });
});
it('does not let a caller write a receipt in another actor name', async () => {
  await rejectSafely(
    () =>
      db.query(
        'insert into medication_import_receipts(operation_id,actor_id,patient_id,visit_id,request_hash,medication_ids) values($1,$2,$3,$4,$5,$6)',
        [operation, creator, patient, visit, 'synthetic', []],
      ),
    /row-level security/,
  );
  expect(await counts()).toEqual({ medications: 0, events: 0, receipts: 0 });
});
