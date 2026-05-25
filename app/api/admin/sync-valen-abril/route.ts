import { NextResponse } from "next/server";

// DEPRECATED 2026-05-25 — Endpoint hardcoded para April 2026 ya no necesario.
// La conexión con el Sheet de Valen fue removida.

export async function POST() {
  return NextResponse.json(
    { error: "Endpoint deshabilitado", message: "La sync con el Sheet de Valen fue removida." },
    { status: 410 }
  );
}
