import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import {
  enrichGraphRagStatusPayload,
  isMissingGraphRagSchema,
  parseAdminGraphRagAction,
} from "@/lib/ai/adminGraphRagCore";

/**
 * GET / POST `/api/v1/admin/graph-rag` — Admin Legal GraphRAG Control & Diagnostics.
 *
 * - GET: `requireStaff("read")` — returns live graph node/edge/vault counts,
 *   watchdog sync state, active HNSW model stats, and provider credential readiness
 *   (never exposes API keys). Gracefully returns `schemaMissing: true` before
 *   migration `20261110_10_library_graph_rag.sql` is applied.
 * - POST: `requireStaff("settings.write")` — switches active embedding model
 *   (auto-creates Partial HNSW index + $0 vault relink), triggers immediate
 *   watchdog sync, or toggles Fiqh vector indexing, recording an audit row via
 *   `logAdminAction` for every successful write.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;

  try {
    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("graph_rag_status");
    if (error) {
      if (isMissingGraphRagSchema(error.code, error.message)) {
        return NextResponse.json(enrichGraphRagStatusPayload(null, process.env), {
          headers: NO_STORE_HEADERS,
        });
      }
      console.error("[admin/graph-rag] status failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر قراءة حالة الجراف القانوني" }, { status: 503 });
    }

    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    return NextResponse.json(enrichGraphRagStatusPayload(raw, process.env), {
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    console.error("[admin/graph-rag] GET threw:", err);
    return NextResponse.json({ error: "تعذّر قراءة حالة الجراف القانوني" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireStaff("settings.write");
  if (!gate.ok) return gate.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "تعذّر قراءة بيانات الطلب" }, { status: 400 });
  }

  const parsed = parseAdminGraphRagAction(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const admin = await createServiceClient();
    const act = parsed.value;

    if (act.action === "switch_model") {
      const { data, error } = await admin.rpc("graph_rag_set_default_model", {
        p_model_id: act.modelId,
      });
      if (error) {
        if (isMissingGraphRagSchema(error.code, error.message)) {
          return NextResponse.json(
            { error: "مخطط الجراف غير مطبّق بعد — نفّذ ملف 20261110_10_library_graph_rag.sql أولاً" },
            { status: 503 },
          );
        }
        if ((error.message ?? "").includes("does not exist or is inactive")) {
          return NextResponse.json({ error: "نموذج التضمين المطلوب غير مفعّل أو غير مسجّل" }, { status: 400 });
        }
        console.error("[admin/graph-rag] switch_model failed:", error.code, error.message);
        return NextResponse.json({ error: "تعذّر تبديل نموذج التضمين" }, { status: 503 });
      }

      await logAdminAction({
        actorId: gate.userId,
        action: "graph_rag_model_switched",
        targetType: "graph_rag",
        targetId: act.modelId,
        after: data ?? { model_id: act.modelId },
        metadata: { model_id: act.modelId },
      });

      return NextResponse.json({ ok: true, result: data }, { headers: NO_STORE_HEADERS });
    }

    if (act.action === "trigger_sync") {
      const { data, error } = await admin.rpc("graph_rag_sync_control", {
        p_action: "mark_dirty_now",
        p_payload: { reason: "admin_ui" },
      });
      if (error) {
        if (isMissingGraphRagSchema(error.code, error.message)) {
          return NextResponse.json(
            { error: "مخطط الجراف غير مطبّق بعد — نفّذ ملف 20261110_10_library_graph_rag.sql أولاً" },
            { status: 503 },
          );
        }
        console.error("[admin/graph-rag] trigger_sync failed:", error.code, error.message);
        return NextResponse.json({ error: "تعذّر طلب المزامنة" }, { status: 503 });
      }

      await logAdminAction({
        actorId: gate.userId,
        action: "graph_rag_sync_triggered",
        targetType: "graph_rag",
        targetId: "sync_state",
        after: { dirty: true },
        metadata: { reason: "admin_ui" },
      });

      return NextResponse.json({ ok: true, result: data }, { headers: NO_STORE_HEADERS });
    }

    const { data, error } = await admin.rpc("graph_rag_sync_control", {
      p_action: "set_feqh_vectors",
      p_payload: { enabled: act.enabled },
    });
    if (error) {
      if (isMissingGraphRagSchema(error.code, error.message)) {
        return NextResponse.json(
          { error: "مخطط الجراف غير مطبّق بعد — نفّذ ملف 20261110_10_library_graph_rag.sql أولاً" },
          { status: 503 },
        );
      }
      console.error("[admin/graph-rag] set_feqh_vectors failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحديث إعداد متجهات الفقه" }, { status: 503 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "graph_rag_feqh_vectors_toggled",
      targetType: "graph_rag",
      targetId: "include_feqh_vectors",
      after: { include_feqh_vectors: act.enabled },
      metadata: { enabled: act.enabled },
    });

    return NextResponse.json({ ok: true, result: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error("[admin/graph-rag] POST threw:", err);
    return NextResponse.json({ error: "تعذّر تنفيذ الإجراء" }, { status: 503 });
  }
}
