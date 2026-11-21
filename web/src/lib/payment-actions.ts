"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "./auth";
import { withTenant } from "./db";
import { formatMinor, parseMinor } from "./money";
import { can } from "./permissions";

class UserError extends Error {}
const fail = (msg: string): never => redirect(`/invoices?error=${encodeURIComponent(msg)}`);

const schema = z.object({
  invoiceId: z.string().uuid(),
  key: z.string().uuid(),
  amount: z.string(),
  method: z.enum(["CASH", "BANK_TRANSFER", "MPESA", "CARD", "OTHER"]),
  reference: z.string().trim().max(100).optional(),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function recordPayment(fd: FormData) {
  const { user, active } = await requireOrg();
  if (!can(active.role, "payment.record") || !can(active.role, "payment.allocate")) fail("You do not have permission to record payments.");
  const p = schema.safeParse(Object.fromEntries(fd));
  const amount = p.success ? parseMinor(p.data.amount) : null;
  if (!p.success || amount === null || amount <= 0n) fail("Enter a valid payment amount and date.");
  const d = p.data!;
  const org = active.organisation_id;
  try {
    await withTenant(org, async (c) => {
      const inv = (await c.query(
        "select number, status, customer_id, currency, total_minor::text as t, paid_minor::text as p from invoices where id = $1 for update", [d.invoiceId],
      )).rows[0];
      if (!inv || !["ISSUED", "PARTIALLY_PAID"].includes(inv.status)) throw new UserError("This invoice cannot take payments.");
      const remaining = BigInt(inv.t) - BigInt(inv.p);
      if (amount! > remaining) throw new UserError(`Amount exceeds the outstanding balance of ${formatMinor(remaining.toString(), inv.currency)}.`);
      const acc = Object.fromEntries((await c.query("select code, id from chart_of_accounts where code in ('1000','1100')")).rows.map((r) => [r.code, r.id]));
      if (!acc["1000"] || !acc["1100"]) throw new UserError("Accounts 1000 and 1100 are required to post payments.");
      const pid = randomUUID();
      const j = (await c.query(
        "insert into journal_transactions(organisation_id, description, source_type, source_id, idempotency_key, created_by) values ($1,$2,'payment',$3,$4,$5) returning id",
        [org, `Payment for ${inv.number}`, pid, `payment:${d.key}`, user.id],
      )).rows[0].id;
      const amt = amount!.toString();
      await c.query(
        "insert into journal_lines(organisation_id, transaction_id, account_id, currency, amount_minor, direction) values ($1,$2,$3,$4,$5,'DEBIT'), ($1,$2,$6,$4,$5,'CREDIT')",
        [org, j, acc["1000"], inv.currency, amt, acc["1100"]],
      );
      await c.query(
        "insert into payments(id, organisation_id, customer_id, amount_minor, currency, method, reference, received_on, journal_id, created_by) values ($1,$2,$3,$4,$5,$6,nullif($7,''),$8,$9,$10)",
        [pid, org, inv.customer_id, amt, inv.currency, d.method, d.reference ?? "", d.receivedOn, j, user.id],
      );
      await c.query("insert into payment_allocations(organisation_id, payment_id, invoice_id, amount_minor) values ($1,$2,$3,$4)", [org, pid, d.invoiceId, amt]);
      await c.query(
        "update invoices set paid_minor = paid_minor + $2::bigint, status = case when paid_minor + $2::bigint = total_minor then 'PAID' else 'PARTIALLY_PAID' end where id = $1",
        [d.invoiceId, amt],
      );
      await c.query(
        "insert into audit_logs(organisation_id, actor_user_id, action, resource_type, resource_id, reason) values ($1,$2,'payment.record','payment',$3,$4)",
        [org, user.id, pid, d.method],
      );
    });
  } catch (e) {
    const dup = (e as { code?: string }).code === "23505";
    return fail(e instanceof UserError ? e.message : dup ? "This payment was already recorded." : "Something went wrong. Please try again.");
  }
  redirect("/invoices");
}
