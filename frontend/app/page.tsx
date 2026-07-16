export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center gap-4 bg-card border-[3px] border-ink rounded-[6px] shadow-[5px_5px_0_rgba(0,0,0,0.08)] p-8 max-w-md w-full">
        <h1 className="text-4xl font-bold tracking-tight text-ink">Fplit</h1>
        <p className="text-lg text-inkSecondary text-center">
          Split group expenses, settle up simply.
        </p>
        <p className="font-mono text-sm text-inkSecondary mt-4">
          M1 — skeleton is live
        </p>
      </div>
    </main>
  );
}
