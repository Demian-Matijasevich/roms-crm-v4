import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import AuditClient from "./AuditClient";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; id?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const params = await searchParams;
  const sb = createServerClient();

  let query = sb
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.entity) query = query.eq("entity_type", params.entity);
  if (params.id) query = query.eq("entity_id", params.id);

  const { data } = await query;
  return <AuditClient entries={(data ?? []) as never[]} filterEntity={params.entity || ""} filterId={params.id || ""} />;
}
