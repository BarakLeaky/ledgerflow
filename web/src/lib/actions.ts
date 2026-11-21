"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pool, withTenant } from "./db";
import { CURRENCIES } from "./money";
import { endSession, getMemberships, hashPassword, requireUser, setOrgCookie, startSession, verifyPassword } from "./auth";

const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
});
export async function signup(fd: FormData) {
  const p = signupSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/signup", "Enter your name, a valid email and a password of at least 10 characters.");
  const { name, email, password } = p.data!;
  let id: string;
  try {
    id = (await pool.query("select create_user($1,$2,$3) as id", [email, name, await hashPassword(password)])).rows[0].id;
  } catch (e) {
    return fail("/signup", (e as { code?: string }).code === "23505" ? "That email is already registered." : "Could not create the account.");
  }
  await startSession(id);
  redirect("/onboarding");
}

export async function login(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const row = (await pool.query("select * from find_login($1)", [email])).rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) fail("/login", "Incorrect email or password.");
  await startSession(row.id);
  redirect("/overview");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

const orgSchema = z.object({ name: z.string().trim().min(2).max(120), currency: z.enum(CURRENCIES) });
const STARTER_ACCOUNTS: [string, string, string][] = [
  ["1000", "Cash and bank", "asset"], ["1100", "Accounts receivable", "asset"],
  ["2000", "Accounts payable", "liability"], ["2100", "Tax payable", "liability"],
  ["3000", "Owner's equity", "equity"], ["4000", "Sales revenue", "revenue"], ["5000", "Operating expenses", "expense"],
];
export async function createOrganisation(fd: FormData) {
  const user = await requireUser();
  const p = orgSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/onboarding", "Enter a business name and choose a supported currency.");
  const { name, currency } = p.data!;
  const orgId = randomUUID();
  await withTenant(orgId, async (c) => {
    await c.query("insert into organisations(id, name, base_currency) values ($1,$2,$3)", [orgId, name, currency]);
    await c.query("insert into memberships(organisation_id, user_id, role) values ($1,$2,'owner')", [orgId, user.id]);
    for (const [code, n, type] of STARTER_ACCOUNTS)
      await c.query("insert into chart_of_accounts(organisation_id, code, name, type) values ($1,$2,$3,$4)", [orgId, code, n, type]);
        await c.query(
      "insert into audit_logs(organisation_id, actor_user_id, action, resource_type, resource_id, reason) values ($1,$2,'organisation.create','organisation',$3,'onboarding')",
      [orgId, user.id, String(orgId)],
    );
  });
  await setOrgCookie(orgId);
  redirect("/overview");
}

export async function switchOrg(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("orgId") ?? "");
  if ((await getMemberships(user.id)).some((m) => m.organisation_id === id)) await setOrgCookie(id);
  redirect("/overview");
}
