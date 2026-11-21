import pg from 'pg'
import assert from 'node:assert/strict'
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL })
const app = new pg.Client({ connectionString: process.env.APP_DATABASE_URL })
await admin.connect(); await app.connect()
const tag = Math.random().toString(36).slice(2, 8)
const org = async n => (await admin.query("insert into organisations(name, base_currency) values ($1,'KES') returning id", [`${n}-${tag}`])).rows[0].id
const A = await org('A'), B = await org('B')
for (const o of [A, B]) await admin.query("insert into chart_of_accounts(organisation_id,code,name,type) values ($1,'1000','Cash','asset'),($1,'4000','Revenue','revenue')", [o])

async function inOrg(orgId, fn) {
  await app.query('begin')
  try { await app.query("select set_config('app.org_id', $1, true)", [orgId]); const r = await fn(); await app.query('commit'); return r }
  catch (e) { await app.query('rollback'); throw e }
}
const post = (orgId, key, lines) => inOrg(orgId, async () => {
  const t = (await app.query("insert into journal_transactions(organisation_id,description,source_type,idempotency_key) values ($1,'t','test',$2) returning id", [orgId, key])).rows[0].id
  for (const [acct, dir, amt] of lines) await app.query('insert into journal_lines(organisation_id,transaction_id,account_id,currency,amount_minor,direction) values ($1,$2,$3,$4,$5,$6)', [orgId, t, acct, 'KES', amt, dir])
  return t
})
const accts = o => inOrg(o, async () => Object.fromEntries((await app.query('select code,id from chart_of_accounts')).rows.map(r => [r.code, r.id])))
const rejects = async (name, p) => { try { await p } catch { return console.log('PASS', name) } throw new Error('FAIL ' + name) }

const a = await accts(A), b = await accts(B)
assert.equal((await inOrg(A, () => app.query('select * from chart_of_accounts'))).rowCount, 2); console.log('PASS tenant A sees only its 2 accounts')
assert.equal((await app.query('select * from chart_of_accounts')).rowCount, 0); console.log('PASS no tenant context returns nothing')
await rejects('cross-tenant account link', post(A, 'x1', [[b['1000'], 'DEBIT', 100], [a['4000'], 'CREDIT', 100]]))
await rejects('write with other tenant id', inOrg(A, () => app.query("insert into chart_of_accounts(organisation_id,code,name,type) values ($1,'9','x','asset')", [B])))
await rejects('unbalanced journal', post(A, 'x2', [[a['1000'], 'DEBIT', 100], [a['4000'], 'CREDIT', 90]]))
await rejects('single-line journal', post(A, 'x3', [[a['1000'], 'DEBIT', 100]]))
const t = await post(A, 'ok1', [[a['1000'], 'DEBIT', 100], [a['4000'], 'CREDIT', 100]]); console.log('PASS balanced journal posts', t)
await rejects('update posted line', inOrg(A, () => app.query('update journal_lines set amount_minor = 1')))
await rejects('delete posted line', inOrg(A, () => app.query('delete from journal_lines')))
await rejects('duplicate idempotency key', post(A, 'ok1', [[a['1000'], 'DEBIT', 5], [a['4000'], 'CREDIT', 5]]))
console.log('\nAll foundation checks passed.')
await admin.end(); await app.end()
