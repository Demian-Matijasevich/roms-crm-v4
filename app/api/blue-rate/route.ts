/**
 * GET /api/blue-rate?dates=2026-06-30,2026-07-10,...
 * Devuelve cotizaciones del blue venta para las fechas pedidas.
 * Fuente: api.argentinadatos.com (histórico). Cache en memoria del proceso.
 *
 * Uso: componente de comisiones para convertir ARS → USD con la cotización del día del pago.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new Map<string, number>();

async function fetchBlue(dateISO: string): Promise<number | null> {
  if (cache.has(dateISO)) return cache.get(dateISO)!;
  // Intentar hasta 4 días atrás (por fines de semana / feriados)
  const [y, m, d] = dateISO.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  for (let back = 0; back <= 4; back++) {
    const t = new Date(target);
    t.setUTCDate(t.getUTCDate() - back);
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(t.getUTCDate()).padStart(2, "0");
    const url = `https://api.argentinadatos.com/v1/cotizaciones/dolares/blue/${yy}/${mm}/${dd}`;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 roms-crm" },
        next: { revalidate: 3600 },
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { venta?: number };
      const v = Number(j.venta || 0);
      if (v > 0) {
        cache.set(dateISO, v);
        return v;
      }
    } catch {
      // continuar
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const datesParam = url.searchParams.get("dates");
  if (!datesParam) {
    return NextResponse.json({ error: "Falta ?dates=YYYY-MM-DD,..." }, { status: 400 });
  }
  const dates = datesParam.split(",").map((s) => s.trim()).filter(Boolean);
  const results: Record<string, number | null> = {};
  await Promise.all(
    dates.map(async (date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        results[date] = null;
        return;
      }
      results[date] = await fetchBlue(date);
    })
  );
  return NextResponse.json({ rates: results, source: "api.argentinadatos.com (blue venta)" });
}
