import { Pool, type PoolClient } from "pg";

const g = globalThis as unknown as { lfPool?: Pool };
export const pool = g.lfPool ?? (g.lfPool = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 10 }));

/** Runs fn in a transaction with the tenant set transaction-locally. RLS enforces isolation. */
export async function withTenant<T>(orgId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.org_id', $1, true)", [orgId]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
