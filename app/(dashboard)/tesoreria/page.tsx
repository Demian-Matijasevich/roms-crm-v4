import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import TesoreriaClient from "./TesoreriaClient";
import type { TreasuryRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TesoreriaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();
  const nicho = await getNichoFilter();

  // Si hay filtro de nicho, usar la vista paralela `v_treasury_by_nicho`.
  // Esa vista agrupa también por `nicho`, así que con .eq() filtrás exacto.
  // Sino, usar la vista global histórica que no tiene columna nicho.
  let rows: TreasuryRow[] = [];
  if (nicho) {
    const { data } = await supabase.from("v_treasury_by_nicho").select("*").eq("nicho", nicho);
    rows = (data as TreasuryRow[]) ?? [];
  } else {
    const { data } = await supabase.from("v_treasury").select("*");
    rows = (data as TreasuryRow[]) ?? [];
  }

  return <TesoreriaClient rows={rows} />;
}
