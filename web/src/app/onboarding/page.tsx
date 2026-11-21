import { createOrganisation } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/money";
import { btn, card, input } from "@/lib/ui";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Set up your business</h1>
      <form action={createOrganisation} className={`${card} flex flex-col gap-3`}>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <input className={input} name="name" placeholder="Business name" required />
        <label className="text-sm text-neutral-400">Base currency
          <select className={`${input} mt-1`} name="currency" defaultValue="KES">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <p className="text-xs text-neutral-500">A starter chart of accounts is created. Have an accountant review it before relying on reports.</p>
        <button className={btn}>Create organisation</button>
      </form>
    </main>
  );
}
