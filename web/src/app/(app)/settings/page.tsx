import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/session";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Settings" description="Your name, password and theme." />
      <SettingsForms name={user.name} email={user.email} theme={user.theme === "DARK" ? "dark" : "light"} />
    </>
  );
}
