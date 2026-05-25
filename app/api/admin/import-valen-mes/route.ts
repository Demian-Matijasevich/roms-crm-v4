import { NextResponse } from "next/server";

// DEPRECATED 2026-05-25 — Sacamos la conexión con el Sheet de Valen.
// La carga de leads/pagos ahora va exclusivamente por la app
// (form/llamada, /api/llamadas, /api/pagos, /prospectos).

export async function POST() {
  return NextResponse.json(
    {
      error: "Endpoint deshabilitado",
      message: "La sync desde el Sheet de Valen fue removida. Cargá los leads y pagos directamente desde la app.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Endpoint deshabilitado",
      message: "La sync desde el Sheet de Valen fue removida. Cargá los leads y pagos directamente desde la app.",
    },
    { status: 410 }
  );
}
