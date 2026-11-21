import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { createInvoice } from "@/lib/sales-actions";
import { btn, card, input } from "@/lib/ui";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { active } = await requireOrg();
  const { error } = await searchParams;
  const customers = await withTenant(active.organisation_id, async (c) => (await c.query("select id, name from customers order by name")).rows);
  if (customers.length === 0)
    return <p className="text-sm text-neutral-400">Add a customer first. <Link className="text-sky-400" href="/customers">Go to customers</Link></p>;
  return (
    <form action={createInvoice} className={`${card} flex max-w-3xl flex-col gap-4`}>
      <h1 className="text-2xl font-semibold">New invoice ({active.base_currency})</h1>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <div className="flex-1">
          <select className={input} name="customerId" required defaultValue="">
            <option value="" disabled>Choose customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1"><input className={input} name="dueDate" type="date" required aria-label="Due date" /></div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 text-xs text-neutral-400">
          <div className="flex-1">Description</div><div className="w-20">Qty</div><div className="w-32">Unit price</div>
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-2">
            <div className="flex-1"><input className={input} name="desc" placeholder="Description" /></div>
            <div className="w-20"><input className={input} name="qty" type="number" min={1} defaultValue={1} aria-label="Quantity" /></div>
            <div className="w-32"><input className={input} name="price" inputMode="decimal" placeholder="0.00" aria-label="Unit price" /></div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">Leave unused lines blank. Tax is not calculated yet. Issuing posts to the ledger and assigns the next number.</p>
      <button className={btn}>Save draft</button>
    </form>
  );
}