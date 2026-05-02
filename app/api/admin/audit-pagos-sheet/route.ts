import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { readRegistroCalls } from "@/lib/sheets-read";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function tokens(s: string): string[] {
  return norm(s).split(/\s+/).filter((w) => w.length > 2);
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1; // tolera ±$1 USD por redondeo
}

function sameDate(a: string | null, b: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.split("T")[0] === b.split("T")[0];
}

/**
 * Compara el Sheet ROMS contra la DB y lista pagos que están en Sheet pero faltan en la app.
 * Query params:
 *   - s=<secret>           obligatorio
 *   - closer=<nombre>      filtrar por closer (match por substring case-insensitive)
 *   - apply=1              en lugar de listar, inserta los pagos faltantes en DB
 */
export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const closerFilter = (url.searchParams.get("closer") || "").trim().toLowerCase();
  const apply = url.searchParams.get("apply") === "1";

  const sheetRows = await readRegistroCalls();
  const sb = createServerClient();
  const [{ data: leads }, { data: payments }] = await Promise.all([
    sb.from("leads").select("id, nombre, closer_id, estado").range(0, 9999),
    sb.from("payments").select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado, receptor").range(0, 9999),
  ]);
  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamByNorm = new Map<string, { id: string; nombre: string }>();
  for (const t of team || []) teamByNorm.set(norm(t.nombre), t);

  const leadByTokens = (leads || []).map((l) => ({ ...l, nm: norm(l.nombre || ""), tks: tokens(l.nombre || "") }));
  const paymentsByLead = new Map<string, typeof payments>();
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    const arr = paymentsByLead.get(p.lead_id) || [];
    arr.push(p);
    paymentsByLead.set(p.lead_id, arr);
  }

  const missing: Array<Record<string, unknown>> = [];
  const cantMatch: string[] = [];

  for (const r of sheetRows) {
    if (closerFilter) {
      const cn = norm(r.closer || "");
      if (!cn.includes(closerFilter)) continue;
    }
    // Match lead in DB by name tokens (all sheet tokens must be in DB lead name)
    const tks = tokens(r.nombre);
    if (tks.length === 0) continue;
    const matched = leadByTokens.find((l) => tks.every((t) => l.nm.includes(t)));
    if (!matched) {
      cantMatch.push(`${r.nombre} (closer: ${r.closer})`);
      continue;
    }

    const dbPayments = paymentsByLead.get(matched.id) || [];

    // Check pago 1, 2, 3
    const slots = [
      { num: 1, monto: r.pago_1, fecha: r.fecha_pago_1, estado: r.estado_pago_1 },
      { num: 2, monto: r.pago_2, fecha: r.fecha_pago_2, estado: r.estado_pago_2 },
      { num: 3, monto: r.pago_3, fecha: r.fecha_pago_3, estado: r.estado_pago_3 },
    ];

    for (const s of slots) {
      if (!s.monto || s.monto <= 0) continue;
      const sheetEstado = (s.estado || "").toLowerCase().includes("pag") ? "pagado" : "pendiente";
      // ¿Existe ese pago en DB?
      const existing = dbPayments.find((p) => p.numero_cuota === s.num && sameAmount(p.monto_usd, s.monto));
      if (existing) {
        // Si la fecha o el estado difieren, lo reportamos como "diff" (no missing)
        const diffFecha = !sameDate(existing.fecha_pago, s.fecha);
        if (diffFecha && s.fecha) {
          missing.push({
            kind: "fecha_diff",
            lead: matched.nombre,
            leadId: matched.id,
            cuota: s.num,
            monto: s.monto,
            fechaSheet: s.fecha,
            fechaDb: existing.fecha_pago,
            paymentId: existing.id,
          });
        }
        continue;
      }
      missing.push({
        kind: "missing",
        lead: matched.nombre,
        leadId: matched.id,
        cuota: s.num,
        monto: s.monto,
        fecha: s.fecha,
        estado: sheetEstado,
        receptor: r.receptor,
        metodo: r.metodo_pago,
        sheetRow: r.row,
      });
    }
  }

  // ── Fix specific date diffs ──
  const fixIds = (url.searchParams.get("fixFechaIds") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fixIds.length > 0) {
    let fixed = 0;
    const fixErrors: string[] = [];
    for (const m of missing) {
      if (m.kind !== "fecha_diff") continue;
      const pid = m.paymentId as string;
      if (!fixIds.includes(pid)) continue;
      const newFecha = (m.fechaSheet as string).split("T")[0];
      const { error } = await sb.from("payments").update({ fecha_pago: newFecha }).eq("id", pid);
      if (error) fixErrors.push(`${m.lead}: ${error.message}`);
      else fixed++;
    }
    return NextResponse.json({ ok: true, fixed, errors: fixErrors });
  }

  if (!apply) {
    return NextResponse.json({
      ok: true,
      total_sheet_rows: sheetRows.length,
      total_missing: missing.filter((m) => m.kind === "missing").length,
      total_fecha_diff: missing.filter((m) => m.kind === "fecha_diff").length,
      cant_match_count: cantMatch.length,
      cant_match_sample: cantMatch.slice(0, 20),
      missing: missing.slice(0, 200),
    });
  }

  // Aplicar inserts de los pagos faltantes
  let inserted = 0;
  const errors: string[] = [];
  for (const m of missing) {
    if (m.kind !== "missing") continue;
    const fechaPago = (m.fecha as string | null) || new Date().toISOString().slice(0, 10);
    const insertData = {
      lead_id: m.leadId as string,
      client_id: null,
      renewal_id: null,
      numero_cuota: m.cuota as number,
      monto_usd: m.monto as number,
      monto_ars: 0,
      fecha_pago: fechaPago.split("T")[0],
      fecha_vencimiento: null,
      estado: m.estado as string,
      metodo_pago: (m.metodo as string) || null,
      receptor: (m.receptor as string) || null,
      comprobante_url: null,
      cobrador_id: null,
      verificado: false,
      es_renovacion: false,
    };
    const { error } = await sb.from("payments").insert(insertData);
    if (error) errors.push(`${m.lead} cuota#${m.cuota}: ${error.message}`);
    else inserted++;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    errors: errors.slice(0, 30),
    total_attempted: missing.filter((m) => m.kind === "missing").length,
  });
}
