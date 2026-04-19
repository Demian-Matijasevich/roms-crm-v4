import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { readRegistroCalls, mapSheetEstadoToEnum } from "@/lib/sheets-read";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Sheet → Supabase sync.
 * Reads all rows from Registro Calls and upserts into leads/payments.
 * Sheet is the source of truth: its values overwrite Supabase.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = url.searchParams.get("from"); // optional date filter
  const to = url.searchParams.get("to");
  const dryRun = url.searchParams.get("dry") === "1";

  const sb = createServerClient();
  const rows = await readRegistroCalls();

  // Team members map (for closer_id/setter_id resolution by nombre)
  const { data: team } = await sb.from("team_members").select("id, nombre, is_closer, is_setter");
  const memberByName = new Map(
    (team || []).map((t) => [t.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), t])
  );
  function findMemberId(name: string | null, role: "closer" | "setter"): string | null {
    if (!name) return null;
    const key = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const m = memberByName.get(key);
    if (!m) return null;
    if (role === "closer" && !m.is_closer) return null;
    if (role === "setter" && !m.is_setter) return null;
    return m.id;
  }

  let updated = 0, created = 0, skipped = 0, failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const r of rows) {
    // Optional date-range filter
    if (from || to) {
      const refDate = (r.fecha_llamada || r.fecha_agendado || "").split("T")[0];
      if (from && refDate < from) { skipped++; continue; }
      if (to && refDate > to) { skipped++; continue; }
    }

    try {
      // Find existing lead by sheets_row_index
      const { data: existing } = await sb
        .from("leads")
        .select("id, nombre, notas_internas")
        .eq("sheets_row_index", r.row)
        .maybeSingle();

      const closer_id = findMemberId(r.closer, "closer");
      const setter_id = findMemberId(r.setter, "setter");

      const leadData: Record<string, unknown> = {
        nombre: r.nombre,
        instagram: r.instagram,
        fecha_llamada: r.fecha_llamada,
        fecha_agendado: r.fecha_agendado,
        estado: mapSheetEstadoToEnum(r.estado),
        programa_pitcheado: r.programa ? r.programa.toLowerCase().replace(/\s+/g, "_") : null,
        ticket_total: r.ticket_total || 0,
        email: r.email,
        telefono: r.telefono,
        fuente: r.fuente ? r.fuente.toLowerCase() : null,
        sheets_row_index: r.row,
        setter_id,
        closer_id,
      };
      // Map lead_calificado
      if (r.calificado) {
        const c = r.calificado.toLowerCase();
        if (c.includes("cali")) leadData.lead_calificado = "calificado";
        else if (c.includes("no")) leadData.lead_calificado = "no_calificado";
      }

      if (dryRun) {
        results.push({ action: existing ? "would_update" : "would_create", row: r.row, nombre: r.nombre });
        continue;
      }

      let leadId: string;
      if (existing) {
        await sb.from("leads").update(leadData).eq("id", existing.id);
        leadId = existing.id;
        updated++;
      } else {
        const { data: ins, error: insErr } = await sb.from("leads").insert(leadData).select("id").single();
        if (insErr || !ins) {
          failed++;
          results.push({ row: r.row, nombre: r.nombre, error: insErr?.message || "insert failed" });
          continue;
        }
        leadId = ins.id;
        created++;
      }

      // Sync payments from Sheet columns (pago_1, pago_2, pago_3 + cash_dia_1)
      // Strategy: for each non-zero payment amount in the Sheet, ensure there's a matching payment in Supabase.
      // This is append-only: we don't delete DB payments that aren't in Sheet (too risky).
      const sheetPays = [
        { monto: r.pago_1 || r.cash_dia_1, estado: r.estado_pago_1, fecha: r.fecha_pago_1, cuota: 1 },
        { monto: r.pago_2, estado: r.estado_pago_2, fecha: r.fecha_pago_2, cuota: 2 },
        { monto: r.pago_3, estado: r.estado_pago_3, fecha: r.fecha_pago_3, cuota: 3 },
      ].filter((p) => p.monto > 0);

      for (const sp of sheetPays) {
        // Look for existing payment with same lead + monto (rounded)
        const { data: existingPays } = await sb
          .from("payments")
          .select("id, monto_usd, fecha_pago, estado")
          .eq("lead_id", leadId)
          .eq("monto_usd", sp.monto);
        const existingPay = (existingPays || [])[0];

        const payEstado = sp.estado
          ? sp.estado.toLowerCase().includes("pagado")
            ? "pagado"
            : sp.estado.toLowerCase().includes("perdido")
            ? "perdido"
            : "pendiente"
          : "pendiente";

        if (existingPay) {
          // Update only if Sheet has fecha and DB doesn't, or estado differs
          const patch: Record<string, unknown> = {};
          if (sp.fecha && !existingPay.fecha_pago) patch.fecha_pago = sp.fecha;
          if (existingPay.estado !== payEstado) patch.estado = payEstado;
          if (Object.keys(patch).length > 0) {
            await sb.from("payments").update(patch).eq("id", existingPay.id);
          }
        } else {
          await sb.from("payments").insert({
            lead_id: leadId,
            numero_cuota: sp.cuota,
            monto_usd: sp.monto,
            monto_ars: 0,
            fecha_pago: sp.fecha,
            estado: payEstado,
            metodo_pago: r.metodo_pago ? r.metodo_pago.toLowerCase().replace(/\s+/g, "_") : null,
            receptor: r.receptor,
            es_renovacion: false,
            verificado: false,
          });
        }
      }

      results.push({ row: r.row, nombre: r.nombre, action: existing ? "updated" : "created", leadId });
    } catch (err) {
      failed++;
      results.push({ row: r.row, nombre: r.nombre, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    total_rows: rows.length,
    updated,
    created,
    skipped,
    failed,
    dry_run: dryRun,
    sample: results.slice(0, 30),
  });
}
