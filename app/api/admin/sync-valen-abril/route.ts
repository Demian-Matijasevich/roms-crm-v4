import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

interface MissingSale {
  nombre: string;
  monto: number;
  fecha: string;
  metodo: string;
  receptor: string;
  programa: "omnipresencia" | "multicuentas" | "consultoria";
  concepto: string;
}

const MISSING_SALES: MissingSale[] = [
  { nombre: "Iker Quesada", monto: 23900, fecha: "2026-04-14", metodo: "transferencia", receptor: "JUANMA", programa: "omnipresencia", concepto: "primer cuota" },
  { nombre: "Rafael Porras", monto: 10000, fecha: "2026-04-14", metodo: "transferencia", receptor: "JUANMA", programa: "consultoria", concepto: "primer cuota" },
  { nombre: "Mauricio y Tony Zagan", monto: 25000, fecha: "2026-04-15", metodo: "binance", receptor: "JUANMA", programa: "multicuentas", concepto: "primer cuota" },
  { nombre: "Moni Bega", monto: 3760, fecha: "2026-04-17", metodo: "transferencia", receptor: "JUANMA", programa: "omnipresencia", concepto: "fee" },
];

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();

  // Get Valen's id
  const { data: valen } = await sb.from("team_members").select("id").eq("nombre", "Valentino").maybeSingle();
  const valenId: string | null = valen?.id ?? null;

  const results: Array<Record<string, unknown>> = [];

  for (const s of MISSING_SALES) {
    try {
      const needle = norm(s.nombre).split(" ").filter((w) => w.length > 2);
      const { data: leads } = await sb.from("leads").select("id, nombre, estado, ticket_total").range(0, 4999);
      const match = (leads || []).find((l) => {
        const ln = norm(l.nombre || "");
        return needle.every((w) => ln.includes(w));
      }) as { id: string; nombre: string; estado: string; ticket_total: number } | undefined;

      let leadId: string | null = match?.id ?? null;

      if (!leadId) {
        // Create new lead
        const payload: Record<string, unknown> = {
          nombre: s.nombre,
          estado: "cerrado",
          fecha_llamada: s.fecha,
          fecha_agendado: s.fecha,
          ticket_total: s.monto,
          programa_pitcheado: s.programa,
          fuente: "otro",
        };
        if (valenId) payload.closer_id = valenId;

        const { data: ins, error: insErr } = await sb.from("leads").insert(payload).select("id").single();
        if (insErr) {
          results.push({ nombre: s.nombre, error: `lead_create: ${insErr.message}` });
          continue;
        }
        leadId = ins?.id ?? null;
        results.push({ nombre: s.nombre, action: "lead_created", leadId });
      } else if (match) {
        const updatePayload: Record<string, unknown> = {};
        if (match.estado !== "cerrado" && match.estado !== "adentro_seguimiento") {
          updatePayload.estado = "cerrado";
          if (valenId) updatePayload.closer_id = valenId;
          updatePayload.programa_pitcheado = s.programa;
          updatePayload.ticket_total = s.monto;
          updatePayload.fecha_llamada = s.fecha;
          updatePayload.fecha_agendado = s.fecha;
        } else if (!match.ticket_total || match.ticket_total < s.monto) {
          updatePayload.ticket_total = s.monto;
          updatePayload.programa_pitcheado = s.programa;
        }
        if (Object.keys(updatePayload).length > 0) {
          await sb.from("leads").update(updatePayload).eq("id", leadId);
        }
        results.push({ nombre: s.nombre, action: "lead_updated", leadId });
      }

      // Check existing payment for this lead + monto
      if (leadId) {
        const { data: existingPays } = await sb
          .from("payments")
          .select("id, fecha_pago")
          .eq("lead_id", leadId)
          .eq("monto_usd", s.monto)
          .limit(1);
        const existingPay = existingPays?.[0];

        if (existingPay) {
          if (!existingPay.fecha_pago) {
            await sb.from("payments").update({ fecha_pago: s.fecha, metodo_pago: s.metodo, receptor: s.receptor }).eq("id", existingPay.id);
          }
          results.push({ nombre: s.nombre, payment: "already_exists" });
        } else {
          const payInsert: Record<string, unknown> = {
            lead_id: leadId,
            numero_cuota: 1,
            monto_usd: s.monto,
            monto_ars: 0,
            fecha_pago: s.fecha,
            estado: "pagado",
            metodo_pago: s.metodo,
            receptor: s.receptor,
            es_renovacion: false,
            verificado: false,
          };
          const { error: payErr } = await sb.from("payments").insert(payInsert);
          if (payErr) {
            results.push({ nombre: s.nombre, payment_error: payErr.message });
          } else {
            results.push({ nombre: s.nombre, payment: "created", monto: s.monto, fecha: s.fecha });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ nombre: s.nombre, error: msg });
    }
  }

  return NextResponse.json({ ok: true, total: MISSING_SALES.length, results });
}
