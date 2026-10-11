/** Sign-in pages: always light, centred card. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light flex min-h-dvh flex-col items-center justify-center bg-qs-canvas px-4 py-10 text-qs-text">
      <main className="w-full max-w-[400px]">
        <div className="qs-card px-6 pt-7 pb-6 sm:px-8">
          <p className="text-center text-[11px] font-semibold tracking-[0.16em] text-qs-text-muted uppercase">Cost Database</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-[12px] text-qs-text-faint">Access is by invitation only.</p>
      </main>
    </div>
  );
}
