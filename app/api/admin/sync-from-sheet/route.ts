import { NextResponse } from "next/server";

// DEPRECATED 2026-05-25 — La carga de leads/pagos pasa exclusivamente por
// la app. No se importa más desde Google Sheets (Sheet de Valen ni otros).
// Sync hacia el Sheet (DB→Sheet) sigue activa via lib/sheet-sync.

export async function POST() {
  return NextResponse.json(
    {
      error: "Endpoint deshabilitado",
      message: "La sync desde Google Sheets fue removida. Cargá los datos directo en la app.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Endpoint deshabilitado",
      message: "La sync desde Google Sheets fue removida. Cargá los datos directo en la app.",
    },
    { status: 410 }
  );
}
