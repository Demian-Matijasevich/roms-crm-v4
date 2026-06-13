import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

// Leads whose small April sales should be attributed to Valentino as closer
const ATTRIBUTE_TO_VALEN: string[] = [
  "Sofía Dalia Vichich",
  "Luna Natalia Ornella",
  "Juan Carlos Onofre",
  "Nicolas Agustin Constantino Delgado",
  "Mateo Moabro",
  "Alan González Millán",
  "Valentino Banchero",
];

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();

  const { data: valen } = await sb.from("team_members").select("id").eq("nombre", "Valentino").maybeSingle();
  const valenId: string | null = valen?.id ?? null;
  if (!valenId) return NextResponse.json({ error: "Valentino not found" }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];

  // 1. Delete Andres Castrilli $18k duplicate — keep the 11/04 (matches xlsx), delete 01/04
  const { data: andresList } = await sb.from("leads").select("id").ilike("nombre", "Andres Castrilli").range(0, 10);
  for (const a of andresList || []) {
    const { data: pays } = await sb
      .from("payments")
      .select("id, fecha_pago, monto_usd")
      .eq("lead_id", a.id)
      .eq("monto_usd", 18000)
      .eq("estado", "pagado");
    if ((pays || []).length > 1) {
      // Keep the one with fecha closer to 2026-04-11 (correct per Sheet)
      const sorted = [...(pays || [])].sort((p1, p2) => {
        const d1 = p1.fecha_pago?.split("T")[0] || "";
        const d2 = p2.fecha_pago?.split("T")[0] || "";
        // Prefer 2026-04-11
        if (d1 === "2026-04-11") return -1;
        if (d2 === "2026-04-11") return 1;
        return d1.localeCompare(d2);
      });
      const [, ...drops] = sorted;
      for (const d of drops) {
        await sb.from("payments").delete().eq("id", d.id);
        results.push({ action: "deleted_dup_pay", lead: "Andres Castrilli", monto: d.monto_usd, fecha: d.fecha_pago });
      }
    }
  }

  // 2. Attribute 7 small sales to Valen (set closer_id = Valen if empty)
  const { data: allLeads } = await sb.from("leads").select("id, nombre, closer_id").range(0, 4999);
  for (const targetName of ATTRIBUTE_TO_VALEN) {
    const needle = norm(targetName).split(" ").filter((w) => w.length > 2);
    const match = (allLeads || []).find((l) => {
      const ln = norm(l.nombre || "");
      return needle.every((w) => ln.includes(w));
    });
    if (!match) {
      results.push({ nombre: targetName, action: "not_found" });
      continue;
    }
    if (match.closer_id && match.closer_id !== valenId) {
      results.push({ nombre: targetName, action: "already_assigned_to_other", current: match.closer_id });
      continue;
    }
    if (match.closer_id === valenId) {
      results.push({ nombre: targetName, action: "already_valen" });
      continue;
    }
    await sb.from("leads").update({ closer_id: valenId }).eq("id", match.id);
    results.push({ nombre: targetName, action: "assigned_to_valen", leadId: match.id });
  }

  return NextResponse.json({ ok: true, results });
}
