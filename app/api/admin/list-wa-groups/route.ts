/**
 * GET /api/admin/list-wa-groups
 * Devuelve todos los grupos de WhatsApp de la instancia Evolution `fran`, para
 * poder identificar cambios de ID del grupo PAGOS SECURE SCALE u otros.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const EVO_INSTANCE = "fran";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) return NextResponse.json({ error: "EVOLUTION envs missing" }, { status: 500 });

  const r = await fetch(`${url}/group/fetchAllGroups/${EVO_INSTANCE}?getParticipants=false`, {
    headers: { apikey: key },
  });
  if (!r.ok) return NextResponse.json({ error: `fetchAllGroups ${r.status}` }, { status: 502 });
  const groups = (await r.json()) as Array<{ id?: string; subject?: string; creation?: number }>;
  const filtered = groups
    .filter((g) => (g.subject || "").toLowerCase().includes("secure") || (g.subject || "").toLowerCase().includes("pago") || (g.subject || "").toLowerCase().includes("scale"))
    .map((g) => ({ id: g.id, subject: g.subject, created: g.creation }));
  return NextResponse.json({ total: groups.length, matches: filtered });
}
