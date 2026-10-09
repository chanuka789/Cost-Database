import type { Metadata } from "next";
import { TokenPage } from "@/components/auth/token-page";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <TokenPage token={token} type="INVITE" />;
}
