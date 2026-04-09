import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { agentTaskUpdateSchema } from "@/lib/schemas";
import { updateAgentTask } from "@/lib/queries/agent-tasks";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const parsed = agentTaskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateAgentTask(id, parsed.data);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
