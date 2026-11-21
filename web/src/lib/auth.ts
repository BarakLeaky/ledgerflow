import { randomBytes, scrypt as _scrypt, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "./db";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scrypt(pw, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [s, k] = stored.split(":");
  const key = await scrypt(pw, Buffer.from(s, "hex"), 64);
  const kb = Buffer.from(k, "hex");
  return kb.length === key.length && timingSafeEqual(kb, key);
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const exp = new Date(Date.now() + 30 * 86400_000);
  await pool.query("insert into sessions(token_hash, user_id, expires_at) values ($1,$2,$3)", [sha(token), userId, exp]);
  (await cookies()).set("lf_session", token, { ...cookieOpts, expires: exp });
}
export async function endSession() {
  const jar = await cookies();
  const t = jar.get("lf_session")?.value;
  if (t) await pool.query("delete from sessions where token_hash = $1", [sha(t)]);
  jar.delete("lf_session");
  jar.delete("lf_org");
}
export async function setOrgCookie(id: string) {
  (await cookies()).set("lf_org", id, { ...cookieOpts, maxAge: 365 * 86400 });
}

export type User = { id: string; email: string; name: string };
export type Membership = { organisation_id: string; name: string; base_currency: string; role: string };

export async function getUser(): Promise<User | null> {
  const t = (await cookies()).get("lf_session")?.value;
  if (!t) return null;
  const { rows } = await pool.query("select * from session_user_info($1)", [sha(t)]);
  return rows[0] ?? null;
}
export async function requireUser() {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}
export async function getMemberships(userId: string): Promise<Membership[]> {
  return (await pool.query("select * from list_memberships($1)", [userId])).rows;
}
/** The active org is always chosen from the user's verified memberships; the cookie is only a preference. */
export async function requireOrg() {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (!memberships.length) redirect("/onboarding");
  const wanted = (await cookies()).get("lf_org")?.value;
  const active = memberships.find((m) => m.organisation_id === wanted) ?? memberships[0];
  return { user, memberships, active };
}
