import { google } from "googleapis";

const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";
const SHEET_NAME = "'📞 Registro Calls'";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const creds = JSON.parse(raw);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export interface SheetRow {
  row: number; // 1-indexed row number
  nombre: string;
  instagram: string | null;
  fecha_llamada: string | null;
  fecha_agendado: string | null;
  setter: string | null;
  closer: string | null;
  estado: string | null;
  se_presento: string | null;
  calificado: string | null;
  programa: string | null;
  cash_dia_1: number;
  cash_total: number;
  ticket_total: number;
  plan_pago: string | null;
  pago_1: number;
  estado_pago_1: string | null;
  fecha_pago_1: string | null;
  pago_2: number;
  estado_pago_2: string | null;
  pago_3: number;
  estado_pago_3: string | null;
  saldo_pendiente: number;
  metodo_pago: string | null;
  fuente: string | null;
  email: string | null;
  telefono: string | null;
  fecha_pago_2: string | null;
  fecha_pago_3: string | null;
  receptor: string | null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Reads all rows from the Registro Calls sheet. Returns rows with data (nombre non-empty). */
export async function readRegistroCalls(): Promise<SheetRow[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:BB2000`,
  });
  const values = res.data.values || [];
  const rows: SheetRow[] = [];
  values.forEach((r, idx) => {
    const nombre = toStr(r[0]);
    if (!nombre) return;
    rows.push({
      row: idx + 2,
      nombre,
      instagram: toStr(r[1]),
      fecha_llamada: toStr(r[2]),
      fecha_agendado: toStr(r[3]),
      setter: toStr(r[4]),
      closer: toStr(r[5]),
      estado: toStr(r[6]),
      se_presento: toStr(r[7]),
      calificado: toStr(r[8]),
      programa: toStr(r[9]),
      cash_dia_1: toNum(r[12]),
      cash_total: toNum(r[13]),
      ticket_total: toNum(r[14]),
      plan_pago: toStr(r[15]),
      pago_1: toNum(r[16]),
      estado_pago_1: toStr(r[17]),
      fecha_pago_1: toStr(r[18]),
      pago_2: toNum(r[19]),
      estado_pago_2: toStr(r[20]),
      pago_3: toNum(r[21]),
      estado_pago_3: toStr(r[22]),
      saldo_pendiente: toNum(r[23]),
      metodo_pago: toStr(r[24]),
      fuente: toStr(r[25]),
      email: toStr(r[27]),
      telefono: toStr(r[28]),
      fecha_pago_2: toStr(r[42]),
      fecha_pago_3: toStr(r[43]),
      receptor: toStr(r[44]),
    });
  });
  return rows;
}

export function mapSheetEstadoToEnum(estado: string | null): string {
  const s = (estado || "").toLowerCase();
  if (s.includes("cerrado")) return "cerrado";
  if (s.includes("adentro")) return "adentro_seguimiento";
  if (s.includes("no cierre") || s.includes("no-cierre")) return "no_cierre";
  if (s.includes("no show") || s.includes("no-show")) return "no_show";
  if (s.includes("cancel")) return "cancelada";
  if (s.includes("re-program") || s.includes("reprogram")) return "reprogramada";
  if (s.includes("seguimiento")) return "seguimiento";
  if (s.includes("no calificado")) return "no_calificado";
  return "pendiente";
}
