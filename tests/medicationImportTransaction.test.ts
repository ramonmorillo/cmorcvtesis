import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
const U = '11111111-1111-4111-8111-111111111111',
  P = '22222222-2222-4222-8222-222222222222',
  V = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444',
  D = '55555555-5555-4555-8555-555555555555',
  OP = '66666666-6666-4666-8666-666666666666';
let db: PGlite;
const rows = [{ medication_catalog_id: C, dose_text: '1 comprimido', frequency_text: 'cada 24 h', route_text: 'oral' }];
const invoke = (body: unknown = rows, patient = P, visit = V, operation = OP) =>
  db.query('select public.import_visit_medication_document($1,$2,$3,$4::jsonb) as ids', [
    operation,
    patient,
    visit,
    JSON.stringify(body),
  ]);
async function rejectSafely(action: () => Promise<unknown>, pattern: RegExp) {
  await db.exec('savepoint rejection');
  await expect(action()).rejects.toThrow(pattern);
  await db.exec('rollback to savepoint rejection');
}
async function counts() {
  return (
    await db.query<{ n: number; e: number; r: number }>(
      'select (select count(*)::int from patient_medications) n, (select count(*)::int from visit_medication_events) e, (select count(*)::int from medication_import_receipts) r',
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema app_private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table patients(id uuid primary key,created_by uuid);
    create table visits(id uuid primary key,patient_id uuid references patients(id),visit_date date,scheduled_date date,visit_number int,visit_type text,created_at timestamptz default now());
    create function app_private.patient_is_owner(p uuid) returns boolean language sql security definer as $$select exists(select 1 from public.patients where id=p and created_by=auth.uid())$$;
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;
    insert into auth.users values ('${U}'); insert into patients values ('${P}','${U}');
    insert into visits(id,patient_id,visit_date,visit_type,visit_number) values ('${V}','${P}','2026-11-01','baseline',1);`);
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/20260420110000_add_medication_longitudinal_module.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(`delete from medication_catalog;
    insert into medication_catalog(id,display_name,active_ingredient) values ('${C}','Atorvastatina 40 mg','Atorvastatina'),('${D}','Metformina 850 mg','Metformina');
    alter table patients enable row level security; create policy own_patient on patients for all to authenticated using (created_by=auth.uid()) with check(created_by=auth.uid());
    alter table visits enable row level security; create policy own_visit on visits for all to authenticated using(app_private.patient_is_owner(patient_id)) with check(app_private.patient_is_owner(patient_id));
    grant usage on schema public,auth,app_private to authenticated;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    create function fail_event() returns trigger language plpgsql as $$begin if new.new_value->>'frequency_text'='FAIL' then raise exception 'synthetic event failure';end if;return new;end;$$;
    create trigger synthetic_failure before insert on visit_medication_events for each row execute function fail_event();`);
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/20261107100000_atomic_medication_document_import.sql', import.meta.url),
      'utf8',
    ),
  );
  // Recovery: rerunning the corrected migration preserves existing objects.
  await db.exec(readFileSync(new URL('../supabase/migrations/20261107100000_atomic_medication_document_import.sql', import.meta.url), 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`begin; set local role authenticated; set local "request.jwt.claim.sub"='${U}';`);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});
describe('authorized atomic import RPC (PostgreSQL/PGlite, synthetic data)', () => {
  it('supports the original schema without optional permission helpers', async () => {
    const result = await db.query("select to_regprocedure('app_private.can_read_patient(uuid)') as read_helper, to_regprocedure('app_private.can_write_patient(uuid)') as write_helper");
    expect(result.rows[0]).toEqual({read_helper:null,write_helper:null});
    await invoke();
    expect(await counts()).toEqual({n:1,e:1,r:1});
  });

  it('inserts confirmed treatments and added events with receipt', async () => {
    const result = await invoke();
    expect(result.rows).toHaveLength(1);
    expect(await counts()).toEqual({ n: 1, e: 1, r: 1 });
    const event = await db.query<{ event_type: string; old_value: unknown; new_value: Record<string, unknown> }>(
      'select event_type,old_value,new_value from visit_medication_events',
    );
    expect(event.rows[0]).toMatchObject({
      event_type: 'added',
      old_value: null,
      new_value: { dose_text: '1 comprimido', frequency_text: 'cada 24 h', is_active: true },
    });
  });
  it('replays the same key without duplicating', async () => {
    const first = await invoke();
    expect(await invoke()).toEqual(first);
    expect(await counts()).toEqual({ n: 1, e: 1, r: 1 });
  });
  it('rejects reusing a key for different data', async () => {
    await invoke();
    await rejectSafely(() => invoke([{ ...rows[0], dose_text: '2 comprimidos' }]), /otro lote/);
    expect(await counts()).toEqual({ n: 1, e: 1, r: 1 });
  });
  it('rolls back the entire batch if any event insert fails', async () => {
    await rejectSafely(
      () => invoke([...rows, { ...rows[0], medication_catalog_id: D, frequency_text: 'FAIL' }]),
      /synthetic event failure/,
    );
    expect(await counts()).toEqual({ n: 0, e: 0, r: 0 });
  });
  it('rejects duplicates inside the same batch atomically', async () => {
    await rejectSafely(() => invoke([...rows, ...rows]), /duplicado/);
    expect(await counts()).toEqual({ n: 0, e: 0, r: 0 });
  });
  it('rejects existing medication without updating it', async () => {
    await invoke();
    await rejectSafely(() => invoke(rows, P, V, '77777777-7777-4777-8777-777777777777'), /duplicado/);
    expect(await counts()).toEqual({ n: 1, e: 1, r: 1 });
  });
  it('rejects unstructured clinical fragments', async () => {
    await rejectSafely(() => invoke([{ ...rows[0], original: 'SYNTHETIC CONFIDENTIAL FRAGMENT' }]), /Campos/);
    expect(await counts()).toEqual({ n: 0, e: 0, r: 0 });
  });
  it('rejects anonymous and other patient identities', async () => {
    await db.exec(`set local "request.jwt.claim.sub"='88888888-8888-4888-8888-888888888888'`);
    await rejectSafely(() => invoke(), /no autorizada/);
    await db.exec(`set local "request.jwt.claim.sub"=''`);
    await rejectSafely(() => invoke(), /no autorizada/);
  });
  it('rejects a mismatched visit', async () => {
    await rejectSafely(() => invoke(rows, P, '99999999-9999-4999-8999-999999999999'), /Visita no disponible/);
    expect(await counts()).toEqual({ n: 0, e: 0, r: 0 });
  });
  it('blocks historical visits including same-day visit ordering', async () => {
    const later = '99999999-9999-4999-8999-999999999999';
    await db.exec(
      `insert into visits(id,patient_id,visit_date,visit_type,visit_number) values ('${later}','${P}','2026-11-01','month_3',2);`,
    );
    await invoke(rows, P, later);
    await rejectSafely(
      () => invoke([{ ...rows[0], medication_catalog_id: D }], P, V, '77777777-7777-4777-8777-777777777777'),
      /histórica/,
    );
    expect(await counts()).toEqual({ n: 1, e: 1, r: 1 });
  });
});
