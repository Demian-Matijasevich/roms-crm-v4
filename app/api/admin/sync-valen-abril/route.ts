import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

// Missing April sales per Valen's finanzas Sheet (2026-04)
const MISSING_SALES: Array<{
  nombre: string;
  monto: number;
  fecha: string;
  metodo: string;
  receptor: string;
  programa: string;
  concepto: string;
}> = [
  { nombre: "Iker Quesada", monto: 23900, fecha: "2026-04-14", metodo: "transferencia", receptor: "JUANMA", programa: "omnipresencia", concepto: "primer cuota" },
  { nombre: "Rafael Porras", monto: 10000, fecha: "2026-04-14", metodo: "transferencia", receptor: "JUANMA", programa: "consultoria", concepto: "primer cuota" },
  { nombre: "Mauricio y Tony Zagan", monto: 25000, fecha: "2026-04-15", metodo: "binance", receptor: "JUANMA", programa: "multicuentas", concepto: "primer cuota" },
  { nombre: "Moni Bega", monto: 3760, fecha: "2026-04-17", metodo: "transferencia", receptor: "JUANMA", programa: "omnipresencia", concepto: "fee" },
];

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = createServerClient();

  const { data: valen } = await sb.from("team_members").select("id").eq("nombre", "Valentino").single();
  const valenId = valen?.id;

  const results: unknown[] = [];
  for (const s of MISSING_SALES) {
    try {
      // Find lead by name
      const needle = norm(s.nombre).split(" ").filter((w) => w.length > 2);
      const { data: leads } = await sb.from("leads").select("id, nombre, estado, ticket_total").range(0, 4999);
      const match = (leads || []).find((l) => {
        const ln = norm(l.nombre || "");
        return needle.every((w) => ln.includes(w));
      });

      let leadId = match?.id;
      if (!leadId) {
        // Create lead
        const { data: ins, error: insErr } = await sb.from("leads").insert({
          nombre: s.nombre,
          estado: "cerrado",
          closer_id: valenId,
          fecha_llamada: s.fecha,
          fecha_agendado: s.fecha,
          ticket_total: s.monto,
          programa_pitcheado: s.programa,
          fuente: "otro",
        }).select("id").single();
        if (insErr) { results.push({ nombre: s.nombre, error: insErr.message }); continue; }
        leadId = ins?.id;
        if (leadId) results.push({ nombre: s.nombre, action: "lead_created", leadId });
      } else {
        // Update lead to cerrado if not already
        if (match.estado !== "cerrado" && match.estado !== "adentro_seguimiento") {
          await sb.from("leads").update({ estado: "cerrado", closer_id: valenId, programa_pitcheado: s.programa, ticket_total: s.monto, fecha_llamada: s.fecha, fecha_agendado: s.fecha }).eq("id", leadId);
        } else if (!match.ticket_total || match.ticket_total < s.monto) {
          await sb.from("leads").update({ ticket_total: s.monto, programa_pitcheado: s.programa }).eq("id", leadId);
        }
        results.push({ nombre: s.nombre, action: "lead_updated", leadId });
      }

      // Check if payment already exists (by lead_id + monto)
      const { data: existingPay } = await sb.from("payments").select("id,fecha_pago")
        .eq("lead_id", leadId)
        .eq("monto_usd", s.monto)
        .maybeSingle();

      if (existingPay) {
        // Update fecha if missing
        if (!existingPay.fecha_pago) {
          await sb.from("payments").update({ fecha_pago: s.fecha, metodo_pago: s.metodo, receptor: s.receptor }).eq("id", existingPay.id);
        }
        results.push({ nombre: s.nombre, payment: "already_exists" });
      } else {
        const { error: payErr } = await sb.from("payments").insert({
          lead_id: leadId,
          client_id: null,
          renewal_id: null,
          numero_cuota: 1,
          monto_usd: s.monto,
          monto_ars: 0,
          fecha_pago: s.fecha,
          fecha_vencimiento: null,
          estado: "pagado",
          metodo_pago: s.metodo,
          receptor: s.receptor,
          comprobante_url: null,
          cobrador_id: null,
          verificado: false,
          es_renovacion: false,
        });
        if (payErr) { results.push({ nombre: s.nombre, payment_error: payErr.message }); continue; }
        results.push({ nombre: s.nombre, payment: "created", monto: s.monto, fecha: s.fecha });
      }
    } catch (err) {
      results.push({ nombre: s.nombre, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ ok: true, total: MISSING_SALES.length, results });
}
