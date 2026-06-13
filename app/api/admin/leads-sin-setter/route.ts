import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

/**
 * Lista leads SIN setter asignado (ni setter_id directo ni matcheable por utm_medium).
 * Útil para que admins manden la lista a los setters y cada uno reclame los suyos.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const desde = url.searchParams.get("desde") || "2026-01-01";
  const hasta = url.searchParams.get("hasta") || "2027-12-31";
  const format = url.searchParams.get("format") || "json"; // json | text
  const onlyNoUtm = url.searchParams.get("only_no_utm") === "1";

  const sb = createServerClient();

  // UTM campaigns para saber si el lead tiene setter via utm_medium
  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, setter_id");
  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns || []) {
    if (c.setter_id && c.medium) mediumToSetter.set(String(c.medium).toLowerCase(), c.setter_id);
  }

  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, instagram, telefono, email, setter_id, utm_source, utm_medium, utm_content, fecha_agendado, fecha_llamada, estado, sheets_row_index, fuente")
    .or(`fecha_agendado.gte.${desde}T00:00:00,fecha_llamada.gte.${desde}T00:00:00`)
    .order("fecha_agendado", { ascending: false })
    .range(0, 4999);

  const inRange = (leads || []).filter((l) => {
    const f = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
    return f && f >= desde && f <= hasta;
  });

  const sinSetter = inRange.filter((l) => {
    if (l.setter_id) return false;
    if (l.utm_medium && mediumToSetter.has(l.utm_medium.toLowerCase())) return false;
    if (onlyNoUtm) {
      return !l.utm_source && !l.utm_medium;
    }
    return true;
  });

  // Breakdown por utm_source
  const bySource = new Map<string, number>();
  for (const l of sinSetter) {
    const src = (l.utm_source || "sin_utm").toLowerCase();
    bySource.set(src, (bySource.get(src) || 0) + 1);
  }

  if (format === "text") {
    const lines: string[] = [];
    lines.push(`📋 LEADS SIN SETTER ${desde} a ${hasta}`);
    lines.push(`Total: ${sinSetter.length}`);
    lines.push("");
    lines.push("Por fuente:");
    for (const [src, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  • ${src}: ${n}`);
    }
    lines.push("");
    lines.push("Lista (fecha | nombre | @ig | estado | utm_source | sheet_row):");
    for (const l of sinSetter) {
      const fecha = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
      const ig = l.instagram || "—";
      lines.push(`  ${fecha} | ${l.nombre} | ${ig} | ${l.estado} | ${l.utm_source || "—"} | row ${l.sheets_row_index || "—"}`);
    }
    return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  return NextResponse.json({
    rango: { desde, hasta },
    total: sinSetter.length,
    breakdown_por_source: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1])),
    leads: sinSetter.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      instagram: l.instagram,
      telefono: l.telefono,
      email: l.email,
      estado: l.estado,
      fecha_agendado: l.fecha_agendado?.split("T")[0] || null,
      fecha_llamada: l.fecha_llamada?.split("T")[0] || null,
      utm_source: l.utm_source,
      utm_medium: l.utm_medium,
      utm_content: l.utm_content,
      fuente: l.fuente,
      sheet_row: l.sheets_row_index,
    })),
  });
}
