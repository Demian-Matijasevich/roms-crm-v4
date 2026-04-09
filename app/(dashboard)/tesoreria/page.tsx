import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import TesoreriaClient from "./TesoreriaClient";
import type { TreasuryRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TesoreriaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();
  const { data } = await supabase.from("v_treasury").select("*");

  return <TesoreriaClient rows={(data as TreasuryRow[]) ?? []} />;
}
