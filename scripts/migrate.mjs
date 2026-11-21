import pg from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
const { DATABASE_URL, APP_DB_PASSWORD } = process.env
if (!DATABASE_URL || !APP_DB_PASSWORD) throw new Error('Set DATABASE_URL and APP_DB_PASSWORD (see .env.example)')
const c = new pg.Client({ connectionString: DATABASE_URL })
await c.connect()
const exists = await c.query("select 1 from pg_roles where rolname='ledgerflow_app'")
if (!exists.rowCount) {
  const { rows } = await c.query("select format('create role ledgerflow_app login nosuperuser nobypassrls password %L', $1::text) q", [APP_DB_PASSWORD])
  await c.query(rows[0].q)
}
await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())')
const done = new Set((await c.query('select name from schema_migrations')).rows.map(r => r.name))
for (const f of readdirSync('db/migrations').filter(f => f.endsWith('.sql')).sort()) {
  if (done.has(f)) continue
  await c.query('begin')
  try {
    await c.query(readFileSync(`db/migrations/${f}`, 'utf8'))
    await c.query('insert into schema_migrations(name) values ($1)', [f])
    await c.query('commit'); console.log('applied', f)
  } catch (e) { await c.query('rollback'); throw e }
}
await c.end()
