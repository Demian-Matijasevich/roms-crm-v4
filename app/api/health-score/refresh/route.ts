import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export async function POST() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const supabase = createServerClient();

    // Fetch all active client IDs
    const { data: clients, error: fetchErr } = await supabase
      .from("clients")
      .select("id")
      .eq("estado", "activo");

    if (fetchErr) {
      console.error("[POST /api/health-score/refresh] fetch clients", fetchErr);
      return NextResponse.json({ error: "Error obteniendo clientes" }, { status: 500 });
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // Update each client's health score using the SQL function
    // Batch via raw SQL for efficiency
    const ids = clients.map((c) => `'${c.id}'`).join(",");
    const { error: updateErr } = await supabase.rpc("exec_sql", {
      sql: `UPDATE clients SET health_score = calculate_health_score(id) WHERE id IN (${ids})`,
    });

    // Fallback: if rpc doesn't exist, do it one by one
    if (updateErr) {
      console.warn("[POST /api/health-score/refresh] rpc fallback, updating individually");
      let updated = 0;
      for (const client of clients) {
        const { data: score } = await supabase.rpc("calculate_health_score", {
          client_uuid: client.id,
        });
        if (score !== null && score !== undefined) {
          await supabase
            .from("clients")
            .update({ health_score: score })
            .eq("id", client.id);
          updated++;
        }
      }
      return NextResponse.json({ ok: true, updated });
    }

    return NextResponse.json({ ok: true, updated: clients.length });
  } catch (err) {
    console.error("[POST /api/health-score/refresh]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
