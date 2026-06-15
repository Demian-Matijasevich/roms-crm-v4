/**
 * GET /api/cron/iclosed-resync
 *
 * Red de seguridad contra pérdida de webhooks iClosed. Pagina /v1/eventCalls,
 * matchea por email/teléfono con leads existentes y:
 *   - Asigna closer_id si era NULL (solo calls ≥mayo 2026).
 *   - Completa fecha_agendado si era NULL.
 *   - Crea lead nuevo si no existe (ni por email ni por teléfono).
 *
 * Idempotente: si ya hubo una corrida que metió todo, la próxima no hace nada.
 * Auth: ?secret=<CRON_SECRET>.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ICLOSED_BASE = "https://public.api.iclosed.io/v1";
const CUTOFF = "2026-05-01";

// Mapeo iClosed userId → team_members.id (mismo que scripts/iclosed-resync.mjs)
const ICLOSED_TO_TEAM: Record<number, string> = {
  31524: "3f3d78a8-7061-4e70-a085-043119344d7f",
  31525: "3e56c8d0-1eb9-45d1-9fb2-5f36caee431f",
  32163: "209839f4-5aca-4e74-a596-e2300f605bae",
  31526: "209839f4-5aca-4e74-a596-e2300f605bae",
  35139: "b1d54eb6-9698-4a91-973a-cdd097b8b876",
  31522: "48a85840-ce3b-46c6-bfdc-92f26b8eeb2a",
  31527: "1fa97581-745d-4097-bf2d-84a0650ccd63",
};

function normEmail(e: string | null | undefined): string {
  return String(e || "").trim().toLowerCase();
}
function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  return String(p).replace(/\D/g, "").replace(/^0+/, "");
}

type Call = {
  id: number;
  inviteeEmail?: string;
  inviteeName?: string;
  phoneNumber?: string;
  dateTimeUTC?: string;
  user?: { id?: number; firstName?: string; lastName?: string; email?: string } | null;
  utm?: Array<{ utmKey?: string; utmValue?: string }>;
};

async function fetchAllCalls(token: string): Promise<Call[]> {
  const all: Call[] = [];
  let page = 0;
  while (page < 12) {
    const r = await fetch(`${ICLOSED_BASE}/eventCalls?limit=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`iClosed page ${page}: HTTP ${r.status}`);
    const j = (await r.json()) as { data?: { eventCalls?: Call[] } };
    const calls = j?.data?.eventCalls || [];
    all.push(...calls);
    if (calls.length < 100) break;
    page++;
  }
  return all;
}

export async function GET(req: NextRequest) {
  // Auth: secret manual o header de Vercel cron interno.
  const ua = req.headers.get("user-agent") || "";
  const isVercelCron = ua.toLowerCase().includes("vercel-cron");
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (!isVercelCron && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "auth requerida" }, { status: 401 });
  }

  const iclosedToken = process.env.ICLOSED_API_TOKEN || "iclosed_aa34998e737c94c3228aa07a7c591bc0";
  const sb = createServerClient();

  // 1. Bajar todas las calls
  const calls = await fetchAllCalls(iclosedToken);

  // 2. Agrupar por email (último por dateTime gana)
  const byEmail = new Map<string, Call>();
  for (const c of calls) {
    const email = normEmail(c.inviteeEmail);
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev || (c.dateTimeUTC || "") > (prev.dateTimeUTC || "")) {
      byEmail.set(email, c);
    }
  }

  // 3. Traer leads del CRM
  const leadsByEmail = new Map<string, { id: string; closer_id: string | null; fecha_agendado: string | null }>();
  const leadsByPhone = new Map<string, { id: string; closer_id: string | null; fecha_agendado: string | null }>();
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("leads")
      .select("id, email, telefono, closer_id, fecha_agendado")
      .range(from, from + 999);
    if (error) throw error;
    for (const l of data || []) {
      const e = normEmail(l.email);
      if (e) leadsByEmail.set(e, { id: l.id, closer_id: l.closer_id, fecha_agendado: l.fecha_agendado });
      const p = normPhone(l.telefono);
      if (p && p.length >= 8) leadsByPhone.set(p, { id: l.id, closer_id: l.closer_id, fecha_agendado: l.fecha_agendado });
    }
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  // 4. Reconciliar
  type UpdateCloser = { id: string; closer_id: string };
  type UpdateFecha = { id: string; fecha_agendado: string };
  type CreateLead = Record<string, unknown>;
  const updCloser: UpdateCloser[] = [];
  const updFecha: UpdateFecha[] = [];
  const creates: CreateLead[] = [];
  let yaCorrecto = 0;
  let skipReasignar = 0;
  let skipViejo = 0;

  for (const [email, call] of byEmail) {
    const user = call.user;
    if (!user || !user.id) continue;
    const teamId = ICLOSED_TO_TEAM[user.id];
    if (!teamId) continue;

    const phone = normPhone(call.phoneNumber);
    let lead = leadsByEmail.get(email);
    if (!lead && phone && phone.length >= 8) lead = leadsByPhone.get(phone);

    if (lead) {
      const fecha = (call.dateTimeUTC || "").slice(0, 10);
      const esRecienteOMayo = fecha >= CUTOFF;
      if (lead.closer_id === teamId) {
        yaCorrecto++;
      } else if (lead.closer_id) {
        skipReasignar++;
      } else if (esRecienteOMayo) {
        updCloser.push({ id: lead.id, closer_id: teamId });
      } else {
        skipViejo++;
      }
      // Completar fecha_agendado si falta
      if (!lead.fecha_agendado && call.dateTimeUTC && esRecienteOMayo) {
        updFecha.push({ id: lead.id, fecha_agendado: call.dateTimeUTC });
      }
    } else {
      const fecha = (call.dateTimeUTC || "").slice(0, 10);
      if (!fecha || fecha < CUTOFF) { skipViejo++; continue; }
      const utm = (call.utm || []).reduce((acc: Record<string, string>, x) => {
        if (x.utmKey && x.utmKey.startsWith("utm_")) acc[x.utmKey] = x.utmValue || "";
        return acc;
      }, {});
      creates.push({
        nombre: call.inviteeName?.trim() || null,
        email,
        telefono: call.phoneNumber || null,
        fecha_agendado: call.dateTimeUTC,
        closer_id: teamId,
        estado: "pendiente",
        nicho: "general",
        fuente: (utm.utm_source || "").toLowerCase() === "inbound" ? "instagram" : "otro",
        utm_source: utm.utm_source || null,
        utm_medium: utm.utm_medium || null,
        utm_content: utm.utm_content || null,
        notas_internas: `[iClosed cron-resync ${new Date().toISOString().slice(0, 10)}]`,
      });
    }
  }

  // 5. Aplicar
  let updCloserOk = 0;
  for (const op of updCloser) {
    const { error } = await sb.from("leads").update({ closer_id: op.closer_id }).eq("id", op.id).is("closer_id", null);
    if (!error) updCloserOk++;
  }
  let updFechaOk = 0;
  for (const op of updFecha) {
    const { error } = await sb.from("leads").update({ fecha_agendado: op.fecha_agendado }).eq("id", op.id).is("fecha_agendado", null);
    if (!error) updFechaOk++;
  }
  let createsOk = 0;
  for (const op of creates) {
    const { error } = await sb.from("leads").insert(op);
    if (!error) createsOk++;
  }

  const total_changes = updCloserOk + updFechaOk + createsOk;
  return NextResponse.json({
    ok: true,
    calls_descargadas: calls.length,
    emails_unicos: byEmail.size,
    ya_correcto: yaCorrecto,
    skip_reasignar: skipReasignar,
    skip_viejo: skipViejo,
    updated_closer: updCloserOk,
    updated_fecha: updFechaOk,
    creates: createsOk,
    total_changes,
  });
}
