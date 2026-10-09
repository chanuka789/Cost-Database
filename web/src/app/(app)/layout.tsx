import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }} theme={user.theme === "DARK" ? "dark" : "light"}>
      {children}
    </AppShell>
  );
}
