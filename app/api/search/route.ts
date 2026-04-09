import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ leads: [], clients: [], payments: [] });
    }

    const supabase = createServerClient();
    const pattern = `%${q}%`;

    // Search leads
    const { data: leads } = await supabase
      .from("leads")
      .select("id, nombre, instagram, email, telefono, estado")
      .or(
        `nombre.ilike.${pattern},instagram.ilike.${pattern},email.ilike.${pattern},telefono.ilike.${pattern}`
      )
      .limit(10);

    // Search clients
    const { data: clients } = await supabase
      .from("clients")
      .select("id, nombre, email, telefono, programa, estado")
      .or(
        `nombre.ilike.${pattern},email.ilike.${pattern},telefono.ilike.${pattern}`
      )
      .limit(10);

    // Search payments by lead name (join leads)
    const { data: payments } = await supabase
      .from("payments")
      .select("id, lead_id, client_id, monto_usd, estado, fecha_pago, leads!inner(nombre)")
      .ilike("leads.nombre", pattern)
      .limit(10);

    return NextResponse.json({
      leads: leads ?? [],
      clients: clients ?? [],
      payments: payments ?? [],
    });
  } catch (err) {
    console.error("[GET /api/search]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
