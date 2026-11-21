"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "./auth";
import { withTenant } from "./db";
import { parseMinor } from "./money";
import { can } from "./permissions";

class UserError extends Error {}
const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);
const safe = (e: unknown) => (e instanceof UserError ? e.message : "Something went wrong. Please try again.");

export async function createCustomer(fd: FormData) {
  const { active } = await requireOrg();
  if (!can(active.role, "invoice.create")) fail("/customers", "You do not have permission to add customers.");
  const p = z.object({ name: z.string().trim().min(1).max(150), email: z.string().trim().max(200).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/customers", "Enter a customer name.");
  await withTenant(active.organisation_id, (c) =>
    c.query("insert into customers(organisation_id, name, email) values ($1,$2,nullif($3,''))", [active.organisation_id, p.data!.name, p.data!.email ?? ""]),
  );
  redirect("/customers");
}

export async function createInvoice(fd: FormData) {
  const { user, active } = await requireOrg();
  if (!can(active.role, "invoice.create")) fail("/invoices/new", "You do not have permission to create invoices.");
  const head = z.object({ customerId: z.string().uuid(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(Object.fromEntries(fd));
  if (!head.success) fail("/invoices/new", "Choose a customer and a due date.");
  const [d, q, p] = [fd.getAll("desc"), fd.getAll("qty"), fd.getAll("price")].map((a) => a.map(String));
  try {
    const lines: { desc: string; qty: number; price: bigint }[] = [];
    d.forEach((desc, i) => {
      if (!desc.trim()) return;
      const qty = Number(q[i]);
      const price = parseMinor(p[i] ?? "");
      if (!Number.isInteger(qty) || qty < 1 || qty > 100000 || price === null) throw new UserError(`Check quantity and price on line ${i + 1}.`);
      lines.push({ desc: desc.trim().slice(0, 300), qty, price });
    });
    if (!lines.length) throw new UserError("Add at least one line.");
    const total = lines.reduce((s, l) => s + BigInt(l.qty) * l.price, 0n);
    if (total <= 0n) throw new UserError("The invoice total must be greater than zero.");
    const org = active.organisation_id;
    await withTenant(org, async (c) => {
      const id = (await c.query(
        "insert into invoices(organisation_id, customer_id, currency, due_date, total_minor, created_by) values ($1,$2,$3,$4,$5,$6) returning id",
        [org, head.data!.customerId, active.base_currency, head.data!.dueDate, total.toString(), user.id],
      )).rows[0].id;
      for (const l of lines)
        await c.query(
          "insert into invoice_lines(organisation_id, invoice_id, description, quantity, unit_price_minor, line_total_minor) values ($1,$2,$3,$4,$5,$6)",
          [org, id, l.desc, l.qty, l.price.toString(), (BigInt(l.qty) * l.price).toString()],
        );
    });
  } catch (e) {
    return fail("/invoices/new", safe(e));
  }
  redirect("/invoices");
}

export async function issueInvoice(fd: FormData) {
  const { user, active } = await requireOrg();
  if (!can(active.role, "invoice.issue")) fail("/invoices", "You do not have permission to issue invoices.");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) fail("/invoices", "Invalid invoice.");
  const org = active.organisation_id;
  try {
    await withTenant(org, async (c) => {
      const inv = (await c.query("select status, total_minor::text as total, currency from invoices where id = $1 for update", [id.data])).rows[0];
      if (!inv || inv.status !== "DRAFT") throw new UserError("Only draft invoices can be issued.");
      const acc = Object.fromEntries((await c.query("select code, id from chart_of_accounts where code in ('1100','4000')")).rows.map((r) => [r.code, r.id]));
      if (!acc["1100"] || !acc["4000"]) throw new UserError("Accounts 1100 and 4000 are required to post invoices.");
      const n = (await c.query(
        "insert into invoice_sequences(organisation_id, next_number) values ($1, 2) on conflict (organisation_id) do update set next_number = invoice_sequences.next_number + 1 returning next_number - 1 as n",
        [org],
      )).rows[0].n;
      const number = `INV-${String(n).padStart(5, "0")}`;
      const j = (await c.query(
        "insert into journal_transactions(organisation_id, description, source_type, source_id, idempotency_key, created_by) values ($1,$2,'invoice',$3,$4,$5) returning id",
        [org, `Invoice ${number}`, id.data, `invoice-issue:${id.data}`, user.id],
      )).rows[0].id;
      await c.query(
        "insert into journal_lines(organisation_id, transaction_id, account_id, currency, amount_minor, direction) values ($1,$2,$3,$4,$5,'DEBIT'), ($1,$2,$6,$4,$5,'CREDIT')",
        [org, j, acc["1100"], inv.currency, inv.total, acc["4000"]],
      );
      await c.query("update invoices set status = 'ISSUED', number = $2, issue_date = current_date, journal_id = $3 where id = $1", [id.data, number, j]);
      await c.query(
        "insert into audit_logs(organisation_id, actor_user_id, action, resource_type, resource_id, reason) values ($1,$2,'invoice.issue','invoice',$3,$4)",
        [org, user.id, id.data, number],
      );
    });
  } catch (e) {
    return fail("/invoices", safe(e));
  }
  redirect("/invoices");
}
