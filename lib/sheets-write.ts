import { google } from "googleapis";

const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";
const SHEET_NAME = "'📞 Registro Calls'";

type Row = Record<string, string | number | null | undefined>;

// Column mapping confirmed by check-row.ts earlier
const COLS = {
  nombre: "A",
  instagram: "B",
  fecha_llamada: "C",
  fecha_agenda: "D",
  setter: "E",
  closer: "F",
  estado: "G",
  se_presento: "H",
  calificado: "I",
  programa: "J",
  contexto_setter: "K",
  contexto_closer: "L",
  cash_dia_1: "M",
  cash_total: "N",
  ticket_total: "O",
  plan_pago: "P",
  pago_1: "Q",
  estado_pago_1: "R",
  fecha_pago_1: "S",
  pago_2: "T",
  estado_pago_2: "U",
  pago_3: "V",
  estado_pago_3: "W",
  saldo_pendiente: "X",
  metodo_pago: "Y",
  fuente: "Z",
  email: "AB",
  telefono: "AC",
  receptor: "AS",
};

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var not set");
  const creds = JSON.parse(raw);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function rowStr(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

/**
 * Upsert a lead into the Sheet.
 * If row number is unknown, appends a new row. Otherwise updates the existing row.
 * Returns the row index used.
 */
export async function upsertLeadToSheet(lead: {
  id: string;
  sheets_row_index: number | null;
  nombre: string | null;
  instagram: string | null;
  email: string | null;
  telefono: string | null;
  fecha_llamada: string | null;
  fecha_agendado: string | null;
  estado: string;
  programa_pitcheado: string | null;
  ticket_total: number;
  fuente: string | null;
  closer_nombre: string | null;
  setter_nombre: string | null;
  receptor: string | null;
}): Promise<number | null> {
  try {
    const sheets = getSheets();
    let row = lead.sheets_row_index;

    if (!row) {
      // Append new row: find next empty row by reading col A
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:A`,
      });
      row = (existing.data.values?.length || 0) + 1;
    }

    const estadoLabel = (() => {
      switch (lead.estado) {
        case "cerrado": return "Cerrado";
        case "adentro_seguimiento": return "Adentro en Seguimiento";
        case "no_cierre": return "No Cierre";
        case "no_show": return "No-Show";
        case "cancelada": return "Cancelada";
        case "seguimiento": return "En Seguimiento";
        case "reprogramada": return "Re-programada";
        case "no_calificado": return "No Calificado";
        case "pendiente": return "⏳ Pendiente";
        default: return lead.estado;
      }
    })();

    const cells: Row = {
      [COLS.nombre]: lead.nombre || "",
      [COLS.instagram]: lead.instagram || "",
      [COLS.fecha_llamada]: rowStr(lead.fecha_llamada ? new Date(lead.fecha_llamada) : null),
      [COLS.fecha_agenda]: rowStr(lead.fecha_agendado ? new Date(lead.fecha_agendado) : null),
      [COLS.setter]: lead.setter_nombre || "",
      [COLS.closer]: lead.closer_nombre || "",
      [COLS.estado]: estadoLabel,
      [COLS.programa]: lead.programa_pitcheado || "",
      [COLS.ticket_total]: lead.ticket_total || "",
      [COLS.email]: lead.email || "",
      [COLS.telefono]: lead.telefono || "",
      [COLS.fuente]: lead.fuente || "",
      [COLS.receptor]: lead.receptor || "",
    };

    const data = Object.entries(cells).map(([col, val]) => ({
      range: `${SHEET_NAME}!${col}${row}`,
      values: [[val ?? ""]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });

    return row;
  } catch (err) {
    console.error("[sheets-write] upsertLeadToSheet error:", err);
    return null;
  }
}
