import { NextRequest, NextResponse } from "next/server";
import { hasWorkflowBackendConfig, patchRequest } from "../../_supabase";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasWorkflowBackendConfig()) {
    return NextResponse.json({ error: "Supabase workflow backend is not configured." }, { status: 501 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const updated = await patchRequest(id, body.patch ?? {}, body.auditEvent, body.by);
  return NextResponse.json(updated);
}
