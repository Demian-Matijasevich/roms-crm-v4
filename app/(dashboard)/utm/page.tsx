import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchUtmCampaigns } from "@/lib/queries/utm";
import { fetchSetters } from "@/lib/queries/daily-reports";
import UtmClient from "./UtmClient";

export const dynamic = "force-dynamic";

export default async function UtmPage() {
  const auth = await requireAdmin();
  if ("error" in auth) redirect("/login");

  const [campaigns, setters] = await Promise.all([
    fetchUtmCampaigns(),
    fetchSetters(),
  ]);

  return <UtmClient campaigns={campaigns} setters={setters} />;
}
