import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { formatMinor } from "@/lib/money";
import { can } from "@/lib/permissions";
import { issueInvoice } from "@/lib/sales-actions";
import { btn, card } from "@/lib/ui";

export default async function Invoices({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { active } = await requireOrg();
  const { error } = await searchParams;
  const rows = await withTenant(active.organisation_id, async (c) =>
    (await c.query(
      `select i.id, i.number, i.status, i.due_date::text as due, i.total_minor::text as total, i.paid_minor::text as paid, i.currency, c.name
       from invoices i join customers c on c.id = i.customer_id and c.organisation_id = i.organisation_id
       order by i.created_at desc limit 100`,
    )).rows,
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {can(active.role, "invoice.create") && <Link href="/invoices/new" className={btn}>Create invoice</Link>}
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {rows.length === 0 ? <p className="text-sm text-neutral-400">No invoices yet.</p> : (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400"><tr>
              {["Number", "Customer", "Due", "Total", "Balance", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/10 tabular-nums">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.number ?? "Draft"}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{r.due}</td>
                  <td className="px-4 py-3">{formatMinor(r.total, r.currency)}</td>
                  <td className="px-4 py-3">{formatMinor((BigInt(r.total) - BigInt(r.paid)).toString(), r.currency)}</td>
                  <td className="px-4 py-3">{r.status.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    {r.status === "DRAFT" && can(active.role, "invoice.issue") && (
                      <form action={issueInvoice}><input type="hidden" name="id" value={r.id} /><button className="text-sky-400">Issue</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
