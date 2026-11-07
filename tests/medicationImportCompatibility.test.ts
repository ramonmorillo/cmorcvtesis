import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('creates the missing helper on the deployed permissive schema without changing patient policies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.patients(id uuid primary key, created_by uuid);
      alter table patients enable row level security;
      create policy patients_all_authenticated on patients for all to authenticated using(true) with check(true);
      grant usage on schema public,auth to authenticated;
      grant select on patients to authenticated;
      insert into patients values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111'),('33333333-3333-4333-8333-333333333333',null);`);
    const sql = readFileSync(new URL('../supabase/migrations/20261107100000_atomic_medication_document_import.sql',import.meta.url),'utf8');
    const prefix = sql.slice(sql.indexOf('begin;'),sql.indexOf('create table if not exists public.medication_import_receipts'));
    await db.exec(prefix+'commit;');
    await db.exec(prefix+'commit;');
    await db.exec(`set role authenticated; set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';`);
    const check = async () => (await db.query<{allowed:boolean}>("select app_private.patient_is_owner('22222222-2222-4222-8222-222222222222') as allowed")).rows[0].allowed;
    expect(await check()).toBe(true);
    await db.exec(`set "request.jwt.claim.sub"='44444444-4444-4444-8444-444444444444';`);
    expect(await check()).toBe(false);
    expect((await db.query<{allowed:boolean}>("select app_private.patient_is_owner('33333333-3333-4333-8333-333333333333') as allowed")).rows[0].allowed).toBe(false);
    const policy=await db.query("select qual,with_check from pg_policies where tablename='patients'");
    expect(policy.rows).toEqual([{qual:'true',with_check:'true'}]);
  } finally {await db.close();}
},30000);
