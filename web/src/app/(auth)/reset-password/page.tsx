import type { Metadata } from "next";
import { TokenPage } from "@/components/auth/token-page";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <TokenPage token={token} type="RESET" />;
}
