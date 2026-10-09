import { requireAdminPage } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { aiAdminData } from "@/lib/ai-service";
import { AiSettingsPanel } from "./settings-panel";
export const metadata = { title: "AI helper" };
export default async function AiPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdminPage();
  const { month } = await searchParams;
  const data = await aiAdminData(month);
  return <><PageHeader title="AI helper" description="Choose who receives BOQ text, test connections and track usage. Every suggestion needs an admin review." /><AiSettingsPanel data={data} /></>;
}
