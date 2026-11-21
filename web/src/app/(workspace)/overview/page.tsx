import { requireOrg } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { formatMinor } from "@/lib/money";
import { card } from "@/lib/ui";

export default async function Overview() {
  const { active } = await requireOrg();
  const s = await withTenant(active.organisation_id, async (c) =>
    (await c.query(
      `select
         (select count(*) from chart_of_accounts)::int as accounts,
         (select count(*) from journal_transactions)::int as journals,
         (select count(*) from memberships)::int as members,
         (select coalesce(sum(case when l.direction = 'DEBIT' then l.amount_minor else -l.amount_minor end), 0)::text
            from journal_lines l join chart_of_accounts a on a.id = l.account_id and a.organisation_id = l.organisation_id
            where a.code = '1000' and l.currency = $1) as cash`,
      [active.base_currency],
    )).rows[0],
  );
  const items: [string, string][] = [
    ["Cash and bank (posted)", formatMinor(s.cash, active.base_currency)],
    ["Posted journals", String(s.journals)],
    ["Ledger accounts", String(s.accounts)],
    ["Members", String(s.members)],
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{active.name}</h1>
        <p className="text-sm text-neutral-400">Base currency {active.base_currency}. Figures are calculated from posted ledger entries.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className={card}>
            <div className="text-xs text-neutral-400">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {s.journals === 0 && <div className={`${card} text-sm text-neutral-400`}>No activity recorded yet. Figures appear here as entries are posted.</div>}
    </div>
  );
}
