/**
 * staffMfaServer.ts — the server half of mandatory two-step sign-in for staff
 * (owner item 18, batch l7). The rule itself is pure: ./staffMfa.ts.
 *
 *   staffMfaGate(supabase, user)   requireAdmin / requireStaff / assertRole
 *                                  call it for an admin. It decodes the aal
 *                                  claim of the access token the request
 *                                  carries (bearer header or the cookie
 *                                  session) — the same token getUser() just
 *                                  had GoTrue accept — and reads the factors
 *                                  from that getUser() answer. No query.
 *   recordStaffLogin(...)          the new-login alert: one row per GoTrue
 *                                  session (public.admin_login_seen,
 *                                  20261127_50), and on the FIRST sight of a
 *                                  session an e-mail to the staff member with
 *                                  the time, an approximate device and the IP.
 *                                  Env-gated by sendEmail (no key → nothing).
 *                                  Never throws.
 */
import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveClientIp } from "@/lib/rateLimit";
import { sendEmail, renderEmailAr } from "@/lib/email/sendEmail";
import {
  aalFromAccessToken,
  adminMfaMode,
  describeDevice,
  hasVerifiedFactor,
  sessionIdFromAccessToken,
  staffMfaDecision,
  type StaffMfaDecision,
} from "@/lib/auth/staffMfa";

const LOG = "[staffMfa]";

/** The access token this request is authenticated with, or null. */
export async function currentAccessToken(supabase: SupabaseClient): Promise<string | null> {
  try {
    const h = await headers();
    const auth = h.get("authorization");
    if (auth && auth.trim().toLowerCase().startsWith("bearer ")) {
      const t = auth.trim().slice(7).trim();
      if (t) return t;
    }
  } catch {
    // outside a request: fall through to the cookie session
  }
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** The MFA decision for a STAFF user GoTrue has just returned from getUser(). */
export async function staffMfaGate(
  supabase: SupabaseClient,
  user: User,
  accessToken?: string | null,
): Promise<StaffMfaDecision> {
  const token = accessToken !== undefined ? accessToken : await currentAccessToken(supabase);
  return staffMfaDecision({
    hasVerifiedFactor: hasVerifiedFactor(user),
    aal: aalFromAccessToken(token),
    mode: adminMfaMode(process.env),
  });
}

// Sessions this process has already recorded: the backstop in requireAdmin
// runs on every admin API call and must not cost a round trip each time.
const seenSessions = new Set<string>();
const SEEN_CAP = 5000;

function riyadhTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
      timeZone: "Asia/Riyadh",
      dateStyle: "full",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Records a staff sign-in and, the first time a GoTrue session is seen, sends
 * the alert e-mail. `trigger` says where it was seen (for the row only).
 */
export async function recordStaffLogin(input: {
  user: User;
  accessToken: string | null;
  trigger: "login" | "admin_api";
}): Promise<void> {
  try {
    const sessionId = sessionIdFromAccessToken(input.accessToken);
    if (!sessionId || seenSessions.has(sessionId)) return;

    let ip = "unknown";
    let device = "جهاز غير معروف";
    try {
      const h = await headers();
      ip = resolveClientIp((name) => h.get(name));
      device = describeDevice(h.get("user-agent"));
    } catch {
      // outside a request
    }

    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("admin_login_seen", {
      p_user: input.user.id,
      p_session: sessionId,
      p_ip: ip.slice(0, 64),
      p_device: device.slice(0, 80),
      p_trigger: input.trigger,
    });
    if (error) {
      // 20261127_50 not run yet (PGRST202 / 42883): no alert, said once per call site.
      console.error(`${LOG} admin_login_seen failed:`, error.code, error.message);
      return;
    }
    if (seenSessions.size >= SEEN_CAP) seenSessions.clear();
    seenSessions.add(sessionId);
    if (data !== true) return; // already recorded by another process

    const email = input.user.email;
    if (!email) return;
    const when = riyadhTime(new Date());
    const { html, text } = renderEmailAr({
      heading: "تسجيل دخول جديد إلى حساب الإدارة في نظامي",
      paragraphs: [
        "سُجِّل دخول جديد إلى حسابك الإداري في منصة نظامي.",
        "إن كان هذا أنت فلا حاجة لأي إجراء. وإن لم يكن أنت فغيّر كلمة المرور فوراً، وأعد إنشاء رموز الاحتياط من صفحة التحقق بخطوتين، وأبلغ مسؤول المنصة.",
      ],
      details: [
        ["الوقت (الرياض)", when],
        ["الجهاز التقريبي", device],
        ["عنوان IP", ip === "unknown" ? null : ip],
      ],
      footer: ["أُرسلت هذه الرسالة تلقائياً لأن الحساب حساب إدارة، ولا يمكن إيقافها."],
    });
    const sent = await sendEmail({
      to: email,
      subject: "تنبيه: تسجيل دخول جديد إلى حساب الإدارة",
      text,
      html,
      tag: "admin_new_login",
      idempotencyKey: `admin-login-${sessionId}`,
    });
    if (sent === "failed") console.error(`${LOG} new-login alert e-mail failed`);
  } catch (err) {
    console.error(`${LOG} recordStaffLogin threw:`, err instanceof Error ? err.message : err);
  }
}

/** A plain e-mail to the staff member about a security change on the account. */
export async function sendStaffSecurityNotice(
  email: string | null | undefined,
  heading: string,
  paragraph: string,
): Promise<void> {
  if (!email) return;
  try {
    let device = "جهاز غير معروف";
    let ip: string | null = null;
    try {
      const h = await headers();
      device = describeDevice(h.get("user-agent"));
      const r = resolveClientIp((name) => h.get(name));
      ip = r === "unknown" ? null : r;
    } catch {
      // outside a request
    }
    const { html, text } = renderEmailAr({
      heading,
      paragraphs: [paragraph, "إن لم تكن أنت فغيّر كلمة المرور فوراً وأبلغ مسؤول المنصة."],
      details: [
        ["الوقت (الرياض)", riyadhTime(new Date())],
        ["الجهاز التقريبي", device],
        ["عنوان IP", ip],
      ],
      footer: ["أُرسلت هذه الرسالة تلقائياً لأن الحساب حساب إدارة."],
    });
    await sendEmail({ to: email, subject: heading, text, html, tag: "admin_mfa_change" });
  } catch (err) {
    console.error(`${LOG} security notice threw:`, err instanceof Error ? err.message : err);
  }
}
