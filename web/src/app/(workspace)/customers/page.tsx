import { requireOrg } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { createCustomer } from "@/lib/sales-actions";
import { btn, card, input } from "@/lib/ui";

export default async function Customers({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { active } = await requireOrg();
  const { error } = await searchParams;
  const rows = await withTenant(active.organisation_id, async (c) => (await c.query("select id, name, email from customers order by name")).rows);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Customers</h1>
      <form action={createCustomer} className={`${card} flex flex-wrap gap-3`}>
        {error && <p role="alert" className="w-full text-sm text-red-400">{error}</p>}
        <input className={`${input} flex-1`} name="name" placeholder="Customer name" required />
        <input className={`${input} flex-1`} name="email" type="email" placeholder="Email (optional)" />
        <button className={btn}>Add customer</button>
      </form>
      {rows.length === 0 ? <p className="text-sm text-neutral-400">No customers yet.</p> : (
        <ul className={`${card} divide-y divide-white/10 p-0`}>
          {rows.map((r) => <li key={r.id} className="flex justify-between px-4 py-3 text-sm"><span>{r.name}</span><span className="text-neutral-400">{r.email}</span></li>)}
        </ul>
      )}
    </div>
  );
}
