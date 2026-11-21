import { login } from "@/lib/actions";
import { btn, card, input } from "@/lib/ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">LedgerFlow</h1>
      <form action={login} className={`${card} flex flex-col gap-3`}>
        <h2 className="font-medium">Sign in</h2>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <input className={input} name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input className={input} name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        <button className={btn}>Sign in</button>
      </form>
      <p className="text-sm text-neutral-400">No account? <a className="text-sky-400" href="/signup">Create one</a></p>
    </main>
  );
}
