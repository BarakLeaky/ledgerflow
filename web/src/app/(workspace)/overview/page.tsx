import { requireOrg } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { formatMinor } from "@/lib/money";
import { card } from "@/lib/ui";

const BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"];

export default async function Overview() {
  const { active } = await requireOrg();
  const cur = active.base_currency;
  const s = await withTenant(active.organisation_id, async (c) => {
    const base = (await c.query(
      `select
         (select count(*) from chart_of_accounts)::int as accounts,
         (select count(*) from journal_transactions)::int as journals,
         (select count(*) from memberships)::int as members,
         (select coalesce(sum(case when l.direction = 'DEBIT' then l.amount_minor else -l.amount_minor end), 0)::text
            from journal_lines l join chart_of_accounts a on a.id = l.account_id and a.organisation_id = l.organisation_id
            where a.code = '1000' and l.currency = $1) as cash`, [cur],
    )).rows[0];
    const ar = (await c.query(
      `select coalesce(sum(total_minor - paid_minor), 0)::text as outstanding,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date), 0)::text as overdue,
         coalesce(sum(total_minor - paid_minor) filter (where due_date >= current_date), 0)::text as b0,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date and due_date >= current_date - 30), 0)::text as b1,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date - 30 and due_date >= current_date - 60), 0)::text as b2,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date - 60 and due_date >= current_date - 90), 0)::text as b3,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date - 90), 0)::text as b4
       from invoices where status in ('ISSUED','PARTIALLY_PAID') and currency = $1`, [cur],
    )).rows[0];
    return { ...base, ...ar };
  });
  const items: [string, string][] = [
    ["Cash and bank (posted)", formatMinor(s.cash, cur)],
    ["Receivables outstanding", formatMinor(s.outstanding, cur)],
    ["Overdue", formatMinor(s.overdue, cur)],
    ["Posted journals", String(s.journals)],
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{active.name}</h1>
        <p className="text-sm text-neutral-400">Base currency {cur}. Figures are calculated from posted ledger entries and invoices.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className={card}>
            <div className="text-xs text-neutral-400">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className={card}>
        <h2 className="mb-3 text-sm font-medium">Receivables aging</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {BUCKETS.map((b, i) => (
            <div key={b}>
              <div className="text-xs text-neutral-400">{b}</div>
              <div className="mt-1 font-semibold tabular-nums">{formatMinor(s[`b${i}`], cur)}</div>
            </div>
          ))}
        </div>
      </div>
      {s.journals === 0 && <div className={`${card} text-sm text-neutral-400`}>No activity recorded yet. Figures appear here as entries are posted.</div>}
    </div>
  );
}
