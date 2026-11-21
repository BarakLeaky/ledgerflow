import Link from "next/link";
import { logout, switchOrg } from "@/lib/actions";
import { requireOrg } from "@/lib/auth";
import { input } from "@/lib/ui";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, memberships, active } = await requireOrg();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col gap-6 border-r border-white/10 p-4">
        <div className="text-lg font-semibold">LedgerFlow</div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link className="rounded-lg bg-sky-500/10 px-3 py-2 text-sky-400" href="/overview">Overview</Link>
          <Link className="rounded-lg px-3 py-2 text-neutral-400 hover:bg-white/5" href="/onboarding">New organisation</Link>
        </nav>
        <form action={logout} className="mt-auto">
          <button className="text-sm text-red-400">Sign out</button>
        </form>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-3">
          <form action={switchOrg} className="flex items-center gap-2">
            <select name="orgId" defaultValue={active.organisation_id} className={`${input} w-56`} aria-label="Organisation">
              {memberships.map((m) => <option key={m.organisation_id} value={m.organisation_id}>{m.name}</option>)}
            </select>
            <button className="text-sm text-sky-400">Switch</button>
          </form>
          <span className="text-sm text-neutral-400">{user.name} · {active.role.replace("_", " ")}</span>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
