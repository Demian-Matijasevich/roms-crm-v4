import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import ComparativaClient from "./ComparativaClient";
import type { MonthlyCash, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ComparativaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();

  const [cashRes, pipelineRes] = await Promise.all([
    supabase.from("v_monthly_cash").select("*"),
    supabase
      .from("leads")
      .select("id, estado, ticket_total, fecha_llamada, closer_id")
      .not("fecha_llamada", "is", null),
  ]);

  return (
    <ComparativaClient
      monthlyCash={(cashRes.data as MonthlyCash[]) ?? []}
      leads={(pipelineRes.data as Pick<Lead, "id" | "estado" | "ticket_total" | "fecha_llamada" | "closer_id">[]) ?? []}
    />
  );
}
