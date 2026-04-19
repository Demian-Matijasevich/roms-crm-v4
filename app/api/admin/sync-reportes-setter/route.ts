import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { google } from "googleapis";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";
const TAB = "'📋 Reportes Setter'";

function toInt(v: unknown): number {
  if (v == null) return 0;
  const n = parseInt(String(v).replace(/[,.\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function norm(s: string | null): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Parse flexible date formats (YYYY-MM-DD, DD/MM/YYYY, etc.)
function parseFecha(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const y = yy.length === 2 ? "20" + yy : yy;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "missing env" }, { status: 500 });
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A2:F2000`,
  });
  const rows = res.data.values || [];

  const sb = createServerClient();
  const { data: team } = await sb.from("team_members").select("id, nombre, is_setter").eq("is_setter", true);
  const setterByName = new Map((team || []).map((t) => [norm(t.nombre), t.id]));

  let created = 0, updated = 0, skipped = 0, failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const fecha = parseFecha(r[0]);
    const setterName = toStr(r[1]);
    if (!fecha || !setterName) { skipped++; continue; }

    const setter_id = setterByName.get(norm(setterName));
    if (!setter_id) {
      skipped++;
      results.push({ row: i + 2, setter: setterName, error: "setter_not_found" });
      continue;
    }

    const data = {
      setter_id,
      fecha,
      conversaciones_iniciadas: toInt(r[2]),
      respuestas_historias: toInt(r[3]),
      calendarios_enviados: toInt(r[4]),
      agendas_confirmadas: toStr(r[5]), // usamos "Notas" como agendas_confirmadas (la última col) o null
      origen_principal: [],
    };

    try {
      // Dedupe by setter_id + fecha (1 report per setter per day)
      const { data: existing } = await sb
        .from("daily_reports")
        .select("id")
        .eq("setter_id", setter_id)
        .eq("fecha", fecha)
        .maybeSingle();

      if (existing) {
        await sb.from("daily_reports").update(data).eq("id", existing.id);
        updated++;
      } else {
        await sb.from("daily_reports").insert(data);
        created++;
      }
      results.push({ row: i + 2, setter: setterName, fecha });
    } catch (err) {
      failed++;
      results.push({ row: i + 2, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    total_rows: rows.length,
    created,
    updated,
    skipped,
    failed,
    sample: results.slice(0, 30),
  });
}
