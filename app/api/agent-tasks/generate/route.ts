import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateTasks } from "@/lib/task-generator";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Allow admin users OR requests with service role key (for n8n)
  const serviceKey = request.headers.get("x-service-key")?.trim();
  const authBearer = request.headers.get("authorization")?.replace("Bearer ", "").trim();
  const token = serviceKey || authBearer;
  const isServiceCall = token === process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!isServiceCall) {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
  }

  try {
    const result = await generateTasks();
    return NextResponse.json({
      success: true,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
