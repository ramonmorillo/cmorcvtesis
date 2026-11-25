import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const P = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const V2 = '44444444-4444-4444-8444-444444444444';
const MIGRATION = 'supabase/migrations/20261125120000_add_visit_plan_items.sql';

let db: PGlite;

async function rejects(sql: string, params: unknown[], pattern: RegExp) {
  // Cada sentencia se ejecuta en autocommit: una violación de CHECK no deja estado a deshacer.
  await expect(db.query(sql, params)).rejects.toThrow(pattern);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon')$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table patients(id uuid primary key);
    create table visits(id uuid primary key, patient_id uuid references patients(id));
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;
    insert into patients values ('${P}');
    insert into visits values ('${V1}','${P}'),('${V2}','${P}');
  `);
  await db.exec(readFileSync(MIGRATION, 'utf8'));
  await db.exec('grant select, insert, update, delete on public.visit_plan_items to authenticated; grant select on public.visit_plan_items to anon;');
});

afterAll(async () => {
  await db.close();
});

const insertPending = (label = 'Medir TA', kind = 'parameter') =>
  db.query(
    `insert into visit_plan_items (patient_id, origin_visit_id, kind, label) values ($1,$2,$3,$4) returning id, status`,
    [P, V1, kind, label],
  );

describe('migración visit_plan_items', () => {
  it('crea objetivos pendientes por defecto', async () => {
    const { rows } = await insertPending();
    expect(rows[0]).toMatchObject({ status: 'pending' });
  });

  it('rechaza etiquetas vacías, solo con espacios o de más de 200 caracteres', async () => {
    await rejects('insert into visit_plan_items (patient_id, kind, label) values ($1,$2,$3)', [P, 'action', '   '], /check/i);
    await rejects('insert into visit_plan_items (patient_id, kind, label) values ($1,$2,$3)', [P, 'action', 'x'.repeat(201)], /check/i);
  });

  it('rechaza un tipo de objetivo desconocido', async () => {
    await rejects('insert into visit_plan_items (patient_id, kind, label) values ($1,$2,$3)', [P, 'otro', 'Algo'], /check/i);
  });

  it('un objetivo hecho exige fecha de cierre y no admite motivo de descarte', async () => {
    const { rows } = await insertPending('MAPA', 'test');
    const id = rows[0].id;
    await rejects(`update visit_plan_items set status='done' where id=$1`, [id], /check/i);
    await db.query(`update visit_plan_items set status='done', completed_at=now(), completed_visit_id=$2 where id=$1`, [id, V2]);
    await rejects(`update visit_plan_items set dropped_reason='x' where id=$1`, [id], /check/i);
  });

  it('descartar exige motivo no vacío', async () => {
    const { rows } = await insertPending('Pesar');
    const id = rows[0].id;
    await rejects(`update visit_plan_items set status='dropped' where id=$1`, [id], /check/i);
    await rejects(`update visit_plan_items set status='dropped', dropped_reason='  ' where id=$1`, [id], /check/i);
    await db.query(`update visit_plan_items set status='dropped', dropped_reason='No procede' where id=$1`, [id]);
  });

  it('un objetivo pendiente no puede tener fecha de cierre', async () => {
    const { rows } = await insertPending('Glucemia');
    await rejects(`update visit_plan_items set completed_at=now() where id=$1`, [rows[0].id], /check/i);
  });

  it('borrar la visita de origen no borra el objetivo: queda sin visita asociada', async () => {
    await db.exec(`insert into visits values ('55555555-5555-4555-8555-555555555555','${P}')`);
    const { rows } = await db.query<{ id: string }>(
      `insert into visit_plan_items (patient_id, origin_visit_id, kind, label) values ($1,'55555555-5555-4555-8555-555555555555','action','Persistente') returning id`,
      [P],
    );
    await db.exec(`delete from visits where id='55555555-5555-4555-8555-555555555555'`);
    const after = await db.query<{ origin_visit_id: string | null }>('select origin_visit_id from visit_plan_items where id=$1', [rows[0].id]);
    expect(after.rows[0].origin_visit_id).toBeNull();
  });

  it('borrar al paciente borra sus objetivos', async () => {
    const other = '99999999-9999-4999-8999-999999999999';
    await db.exec(`insert into patients values ('${other}')`);
    await db.query(`insert into visit_plan_items (patient_id, kind, label) values ($1,'action','Temporal')`, [other]);
    await db.exec(`delete from patients where id='${other}'`);
    const { rows } = await db.query<{ n: number }>('select count(*)::int n from visit_plan_items where patient_id=$1', [other]);
    expect(rows[0].n).toBe(0);
  });

  it('actualiza updated_at al modificar', async () => {
    const { rows } = await insertPending('Lípidos');
    const before = await db.query<{ updated_at: string }>('select updated_at from visit_plan_items where id=$1', [rows[0].id]);
    await db.exec('select pg_sleep(0.01)');
    await db.query(`update visit_plan_items set outcome_note='x' where id=$1`, [rows[0].id]);
    const after = await db.query<{ updated_at: string }>('select updated_at from visit_plan_items where id=$1', [rows[0].id]);
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(new Date(before.rows[0].updated_at).getTime());
  });

  it('RLS: un usuario autenticado puede leer y escribir; anon no ve nada', async () => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);`);
    const ok = await db.query<{ n: number }>('select count(*)::int n from visit_plan_items');
    expect(ok.rows[0].n).toBeGreaterThan(0);
    await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.role','anon',false);`);
    const denied = await db.query<{ n: number }>('select count(*)::int n from visit_plan_items');
    expect(denied.rows[0].n).toBe(0);
    await db.exec('reset role');
  });
});
