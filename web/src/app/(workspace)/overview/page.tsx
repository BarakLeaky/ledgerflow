import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { formatMinor } from "@/lib/money";
import { card } from "@/lib/ui";

const BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"];
type Tone = "good" | "warn" | "bad" | "neutral";
const TONES: Record<Tone, string> = {
  good: "bg-emerald-500/10 text-emerald-400",
  warn: "bg-amber-500/10 text-amber-400",
  bad: "bg-red-500/10 text-red-400",
  neutral: "bg-white/5 text-neutral-400",
};

function change(cur: string, prev: string) {
  const c = BigInt(cur), p = BigInt(prev);
  const den = p < 0n ? -p : p;
  if (den === 0n) return c === 0n ? null : { text: "new this month", dir: "up" as const };
  const t = ((c - p) * 1000n) / den;
  const a = t < 0n ? -t : t;
  return { text: `${t < 0n ? "-" : "+"}${a / 10n}.${a % 10n}%`, dir: t > 0n ? ("up" as const) : t < 0n ? ("down" as const) : ("flat" as const) };
}

function Chip({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${TONES[tone]}`}>{label}</span>;
}

function Chart({ data }: { data: { label: string; invoiced: string; collected: string }[] }) {
  const W = 640, H = 220, L = 48, R = 8, T = 12, B = 28;
  const n = (v: string) => Number(BigInt(v)) / 100; // display scaling only
  const max = Math.max(1, ...data.flatMap((d) => [n(d.invoiced), n(d.collected)]));
  const bw = (W - L - R) / data.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const fmt = new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Invoiced versus collected by month" className="w-full">
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-white/10" />
      <line x1={L} x2={W - R} y1={y(max)} y2={y(max)} stroke="currentColor" strokeDasharray="3 4" className="text-white/10" />
      <text x={L - 6} y={y(max) + 4} textAnchor="end" className="fill-neutral-500 text-[10px]">{fmt.format(max)}</text>
      <text x={L - 6} y={y(0) + 4} textAnchor="end" className="fill-neutral-500 text-[10px]">0</text>
      {data.map((d, i) => {
        const x = L + i * bw + bw * 0.15, w = bw * 0.3;
        return (
          <g key={d.label + i}>
            <rect x={x} y={y(n(d.invoiced))} width={w} height={y(0) - y(n(d.invoiced))} rx={2} className="fill-sky-500"><title>{`${d.label} invoiced ${n(d.invoiced).toLocaleString("en-KE")}`}</title></rect>
            <rect x={x + w + 2} y={y(n(d.collected))} width={w} height={y(0) - y(n(d.collected))} rx={2} className="fill-emerald-500"><title>{`${d.label} collected ${n(d.collected).toLocaleString("en-KE")}`}</title></rect>
            <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="fill-neutral-400 text-[11px]">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function Overview() {
  const { active } = await requireOrg();
  const cur = active.base_currency;
  const s = await withTenant(active.organisation_id, async (c) => {
    const bal = "case when l.direction = 'DEBIT' then l.amount_minor else -l.amount_minor end";
    const cash = (await c.query(
      `select coalesce(sum(${bal}), 0)::text as cash,
              coalesce(sum(${bal}) filter (where t.posted_at < date_trunc('month', now())), 0)::text as cash_prev
       from journal_lines l
       join chart_of_accounts a on a.id = l.account_id and a.organisation_id = l.organisation_id
       join journal_transactions t on t.id = l.transaction_id and t.organisation_id = l.organisation_id
       where a.code = '1000' and l.currency = $1`, [cur])).rows[0];
    const col = (await c.query(
      `select coalesce(sum(amount_minor) filter (where received_on >= date_trunc('month', current_date)::date), 0)::text as col_cur,
              coalesce(sum(amount_minor) filter (where received_on >= (date_trunc('month', current_date) - interval '1 month')::date
                and received_on < date_trunc('month', current_date)::date), 0)::text as col_prev
       from payments where currency = $1`, [cur])).rows[0];
    const ar = (await c.query(
      `select coalesce(sum(total_minor - paid_minor), 0)::text as outstanding,
         count(*)::int as open_count, count(*) filter (where due_date < current_date)::int as overdue_count,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date), 0)::text as overdue,
         coalesce(sum(total_minor - paid_minor) filter (where due_date >= current_date), 0)::text as b0,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date and due_date >= current_date - 30), 0)::text as b1,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date - 30 and due_date >= current_date - 60), 0)::text as b2,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date - 60 and due_date >= current_date - 90), 0)::text as b3,
         coalesce(sum(total_minor - paid_minor) filter (where due_date < current_date - 90), 0)::text as b4
       from invoices where status in ('ISSUED','PARTIALLY_PAID') and currency = $1`, [cur])).rows[0];
    const series = (await c.query(
      `select to_char(m, 'Mon') as label,
         coalesce((select sum(total_minor) from invoices i where i.issue_date >= m::date and i.issue_date < (m + interval '1 month')::date
                   and i.status in ('ISSUED','PARTIALLY_PAID','PAID') and i.currency = $1), 0)::text as invoiced,
         coalesce((select sum(amount_minor) from payments p where p.received_on >= m::date and p.received_on < (m + interval '1 month')::date
                   and p.currency = $1), 0)::text as collected
       from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m
       order by m`, [cur])).rows;
    const alerts = (await c.query(
      `select i.number, c.name, (i.total_minor - i.paid_minor)::text as bal, (current_date - i.due_date) as days
       from invoices i join customers c on c.id = i.customer_id and c.organisation_id = i.organisation_id
       where i.status in ('ISSUED','PARTIALLY_PAID') and i.due_date <= current_date + 7
       order by i.due_date limit 5`)).rows;
    const invCount = (await c.query("select count(*)::int as n from invoices")).rows[0].n;
    return { ...cash, ...col, ...ar, series, alerts, invCount };
  });

  const cashChg = change(s.cash, s.cash_prev);
  const colChg = change(s.col_cur, s.col_prev);
  const overdueShare = BigInt(s.outstanding) === 0n ? 0n : (BigInt(s.overdue) * 100n) / BigInt(s.outstanding);
  const overdueTone: Tone = BigInt(s.overdue) === 0n ? "good" : overdueShare < 20n ? "warn" : "bad";
  const overdueLabel = overdueTone === "good" ? "On track" : overdueTone === "warn" ? "Watch" : "At risk";
  const kpis: { label: string; value: string; chip: [string, Tone]; sub: string }[] = [
    { label: "Cash on hand", value: formatMinor(s.cash, cur), chip: cashChg ? [cashChg.dir === "down" ? "Declining" : cashChg.dir === "up" ? "Growing" : "Flat", cashChg.dir === "down" ? "warn" : "good"] : ["No change", "neutral"], sub: cashChg ? `${cashChg.text} vs last month` : "Posted ledger balance" },
    { label: "Collected this month", value: formatMinor(s.col_cur, cur), chip: colChg ? [colChg.dir === "down" ? "Slipping" : "Up", colChg.dir === "down" ? "warn" : "good"] : ["No payments", "neutral"], sub: colChg ? `${colChg.text} vs last month` : "Payments received" },
    { label: "Receivables outstanding", value: formatMinor(s.outstanding, cur), chip: [`${s.open_count} open`, "neutral"], sub: "Issued, not fully paid" },
    { label: "Overdue", value: formatMinor(s.overdue, cur), chip: [overdueLabel, overdueTone], sub: `${s.overdue_count} invoice${s.overdue_count === 1 ? "" : "s"} past due` },
  ];
  const glance = s.invCount === 0
    ? "No invoices yet. Add a customer and create an invoice to see your summary here."
    : `Collected ${formatMinor(s.col_cur, cur)} this month${colChg ? ` (${colChg.text} on last month)` : ""}. ${formatMinor(s.outstanding, cur)} is outstanding${s.overdue_count ? `, of which ${formatMinor(s.overdue, cur)} across ${s.overdue_count} invoice${s.overdue_count === 1 ? "" : "s"} is overdue` : ""}.`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{active.name}</h1>
        <p className="text-sm text-neutral-400">Base currency {cur}. Calculated from posted ledger entries, invoices and payments.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={card}>
            <div className="flex items-center justify-between"><span className="text-xs text-neutral-400">{k.label}</span><Chip label={k.chip[0]} tone={k.chip[1]} /></div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{k.value}</div>
            <div className="mt-1 text-xs text-neutral-500">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${card} lg:col-span-2`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Invoiced vs collected, last 6 months</h2>
            <span className="flex gap-3 text-xs text-neutral-400">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />Invoiced</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Collected</span>
            </span>
          </div>
          <Chart data={s.series} />
        </div>
        <div className={card}>
          <h2 className="mb-3 text-sm font-medium">Receivables aging</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {BUCKETS.map((b, i) => (
              <li key={b} className="flex justify-between"><span className="text-neutral-400">{b}</span><span className="tabular-nums">{formatMinor(s[`b${i}`], cur)}</span></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${card} lg:col-span-2`}>
          <h2 className="mb-3 text-sm font-medium">Needs attention</h2>
          {s.alerts.length === 0 ? <p className="text-sm text-neutral-400">Nothing overdue or due within 7 days.</p> : (
            <ul className="flex flex-col gap-2">
              {s.alerts.map((a: { number: string; name: string; bal: string; days: number }) => (
                <li key={a.number} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span><Chip label={a.days > 0 ? "Overdue" : "Due soon"} tone={a.days > 0 ? "bad" : "warn"} /> <span className="ml-2">{a.number} · {a.name}</span></span>
                  <span className="tabular-nums text-neutral-300">{formatMinor(a.bal, cur)} · {a.days > 0 ? `${a.days} day${a.days === 1 ? "" : "s"} late` : a.days === 0 ? "due today" : `due in ${-a.days} day${a.days === -1 ? "" : "s"}`}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/invoices" className="mt-3 inline-block text-sm text-sky-400">Open invoices</Link>
        </div>
        <div className={card}>
          <h2 className="mb-2 text-sm font-medium">At a glance</h2>
          <p className="text-sm text-neutral-300">{glance}</p>
          <p className="mt-3 text-xs text-neutral-500">Summary written from your records by fixed rules. No AI is involved yet.</p>
        </div>
      </div>
    </div>
  );
}
