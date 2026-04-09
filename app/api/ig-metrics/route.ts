import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createIgMetric } from "@/lib/queries/ig-metrics";
import { igMetricsSchema } from "@/lib/schemas/ig-metrics";

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const parsed = igMetricsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const metric = await createIgMetric(parsed.data);
    return NextResponse.json(metric, { status: 201 });
  } catch (err) {
    console.error("[POST /api/ig-metrics]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
