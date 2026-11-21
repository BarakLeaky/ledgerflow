import { signup } from "@/lib/actions";
import { btn, card, input } from "@/lib/ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">LedgerFlow</h1>
      <form action={signup} className={`${card} flex flex-col gap-3`}>
        <h2 className="font-medium">Create your account</h2>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <input className={input} name="name" placeholder="Full name" autoComplete="name" required />
        <input className={input} name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input className={input} name="password" type="password" placeholder="Password" autoComplete="new-password" required />
        <button className={btn}>Create account</button>
      </form>
      <p className="text-sm text-neutral-400">Already registered? <a className="text-sky-400" href="/login">Sign in</a></p>
    </main>
  );
}
