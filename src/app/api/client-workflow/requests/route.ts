import { NextRequest, NextResponse } from "next/server";
import {
  hasWorkflowBackendConfig,
  insertRequest,
  listRequests,
} from "../_supabase";

export async function GET(request: NextRequest) {
  if (!hasWorkflowBackendConfig()) {
    return NextResponse.json({ error: "Supabase workflow backend is not configured." }, { status: 501 });
  }

  const receiver = request.nextUrl.searchParams.get("receiver") ?? undefined;
  const requesterUserId = request.nextUrl.searchParams.get("requesterUserId") ?? undefined;
  const requests = await listRequests({ receiver, requesterUserId });
  return NextResponse.json(requests);
}

export async function POST(request: NextRequest) {
  if (!hasWorkflowBackendConfig()) {
    return NextResponse.json({ error: "Supabase workflow backend is not configured." }, { status: 501 });
  }

  const body = await request.json();
  const saved = await insertRequest(body);
  return NextResponse.json(saved, { status: 201 });
}
