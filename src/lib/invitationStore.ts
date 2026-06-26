/**
 * invitationStore.ts
 * ─────────────────────────────────────────────────────────────
 * Local storage store for Legal Library colleague invitations.
 * Each subscriber gets 3 invitations; the trial duration scales
 * with the subscription plan:
 *   - 3-month plan  → 30-day trial per invite
 *   - 6-month plan  → 60-day trial per invite
 *   - 12-month plan → 90-day trial per invite
 *
 * NOTE: This is a Demo/Frontend implementation. In production,
 * invitation codes are validated server-side.
 * ─────────────────────────────────────────────────────────────
 */

"use client";

// ── Types ──────────────────────────────────────────────────────────────────

export type InvitationStatus = "pending" | "used" | "expired";

export type LibraryPlanId = "lib-q1" | "lib-q2" | "lib-annual";

export interface Invitation {
  id: string;
  code: string;          // e.g. "NZM-INV-A3F8"
  link: string;          // full URL with ?invite=CODE
  status: InvitationStatus;
  recipientPhone?: string;
  trialDays: number;     // 30 | 60 | 90
  createdAt: string;     // ISO date string
  usedAt?: string;
  expiresAt: string;     // 1 year from creation (invitation itself expires)
}

export interface LibrarySubscription {
  planId: LibraryPlanId;
  planLabel: string;
  subscribedAt: string;
  expiresAt: string;
  invitations: Invitation[];
  trialDaysPerInvite: number;
}

export interface AcceptedInvitation {
  code: string;
  trialDays: number;
  acceptedAt: string;
  trialEndsAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SUBSCRIPTION_KEY = "nzamy_library_subscription_v1";
const ACCEPTED_KEY     = "nzamy_accepted_invitation_v1";
const BASE_URL         = "https://nezamy.sa";

/** Trial duration (days) per plan */
export const TRIAL_DAYS_BY_PLAN: Record<LibraryPlanId, number> = {
  "lib-q1":     30,
  "lib-q2":     60,
  "lib-annual": 90,
};

/** Plan labels */
export const PLAN_LABELS: Record<LibraryPlanId, string> = {
  "lib-q1":     "ربع سنوي (3 شهور)",
  "lib-q2":     "نصف سنوي (6 شهور)",
  "lib-annual": "سنوي (12 شهر)",
};

/** Default prices (editable by admin) */
export const PLAN_PRICES: Record<LibraryPlanId, { amount: string; period: string; originalAmount?: string }> = {
  "lib-q1":     { amount: "٣٠٠", period: "لـ ٣ أشهر", originalAmount: "٦٠٠" },
  "lib-q2":     { amount: "٥٥٠", period: "لـ ٦ أشهر", originalAmount: "١,٠٥٠" },
  "lib-annual": { amount: "١,٠٠٠", period: "سنوياً",  originalAmount: "٢,١٠٠" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "NZM-INV-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ── Subscription Store ─────────────────────────────────────────────────────

/**
 * Create (or reset) the subscriber's library subscription with 3 fresh invitations.
 */
export function createLibrarySubscription(planId: LibraryPlanId): LibrarySubscription {
  const now = new Date();
  const planDurationMonths: Record<LibraryPlanId, number> = {
    "lib-q1": 3, "lib-q2": 6, "lib-annual": 12,
  };
  const months = planDurationMonths[planId];
  const subExpiry = new Date(now);
  subExpiry.setMonth(subExpiry.getMonth() + months);

  const trialDays = TRIAL_DAYS_BY_PLAN[planId];
  const inviteExpiry = addDays(now, 365); // invitations valid for 1 year

  const invitations: Invitation[] = Array.from({ length: 3 }, () => {
    const code = generateCode();
    return {
      id:        crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
      code,
      link:      `${BASE_URL}/invite/${code}`,
      status:    "pending" as InvitationStatus,
      trialDays,
      createdAt: now.toISOString(),
      expiresAt: inviteExpiry.toISOString(),
    };
  });

  const subscription: LibrarySubscription = {
    planId,
    planLabel:            PLAN_LABELS[planId],
    subscribedAt:         now.toISOString(),
    expiresAt:            subExpiry.toISOString(),
    invitations,
    trialDaysPerInvite:   trialDays,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));
  }

  return subscription;
}

/**
 * Read the current subscriber's library subscription.
 */
export function getLibrarySubscription(): LibrarySubscription | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LibrarySubscription;
  } catch {
    return null;
  }
}

/**
 * Check whether the user has an active library subscription.
 */
export function hasActiveLibrarySubscription(): boolean {
  const sub = getLibrarySubscription();
  if (!sub) return false;
  return new Date(sub.expiresAt) > new Date();
}

/**
 * Get remaining pending invitations count.
 */
export function getRemainingInvitations(): number {
  const sub = getLibrarySubscription();
  if (!sub) return 0;
  return sub.invitations.filter(inv => inv.status === "pending").length;
}

/**
 * Mark an invitation as used (called when recipient completes registration).
 */
export function markInvitationUsed(code: string): boolean {
  const sub = getLibrarySubscription();
  if (!sub) return false;

  const inv = sub.invitations.find(i => i.code === code);
  if (!inv || inv.status !== "pending") return false;

  inv.status = "used";
  inv.usedAt = new Date().toISOString();

  localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(sub));
  return true;
}

// ── Accepted Invitation Store (for the invited friend) ─────────────────────

/**
 * Accept an invitation code (called on the /join page after registration).
 * Returns true if the code is valid and was accepted.
 */
export function acceptInvitation(code: string, trialDays: number): AcceptedInvitation | null {
  if (typeof window === "undefined") return null;

  const now = new Date();
  const trialEnds = addDays(now, trialDays);

  const accepted: AcceptedInvitation = {
    code,
    trialDays,
    acceptedAt:  now.toISOString(),
    trialEndsAt: trialEnds.toISOString(),
  };

  localStorage.setItem(ACCEPTED_KEY, JSON.stringify(accepted));

  // Also mark it used in the subscriber's store (best-effort)
  markInvitationUsed(code);

  // Dispatch event so other components update
  window.dispatchEvent(new CustomEvent("nzamy_invitation_accepted", { detail: accepted }));

  return accepted;
}

/**
 * Get the accepted invitation for the current user (invited friend).
 */
export function getAcceptedInvitation(): AcceptedInvitation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACCEPTED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AcceptedInvitation;
  } catch {
    return null;
  }
}

/**
 * Check whether the current user is on an active trial from an invitation.
 */
export function hasActiveTrial(): boolean {
  const inv = getAcceptedInvitation();
  if (!inv) return false;
  return new Date(inv.trialEndsAt) > new Date();
}

/**
 * Validate a raw invite code from URL params.
 * Returns trial days if valid, null if invalid format.
 * (Full validation is done server-side in production.)
 */
export function validateInviteCode(code: string): { valid: boolean; trialDays: number } {
  const isValid = /^NZM-INV-[A-Z0-9]{4}$/.test(code);
  // In demo: all valid codes → 30 days (real value would come from server)
  return { valid: isValid, trialDays: 30 };
}

/**
 * Mock database of lawyer licenses lookup by phone or name.
 */
export function getLawyerLicense(phone: string, name: string): string | null {
  const database: Record<string, string> = {
    "0541112222": "٤٣/١٠٢٥",
    "0563334444": "٤٥/٢٠٨٩",
    "0555555555": "٤١/٨٨٢",
  };
  
  const cleanPhone = phone.trim().replace(/\s+/g, "");
  if (database[cleanPhone]) return database[cleanPhone];
  
  const cleanName = name.trim().replace(/[أإآا]/g, "ا").replace(/[ةه]/g, "ه").replace(/[يى]/g, "ي");
  const entries = [
    { name: "محمد الشهري", license: "٤٣/١٠٢٥" },
    { name: "سارة الحربي", license: "٤٥/٢٠٨٩" },
    { name: "خالد العتيبي", license: "٤١/٨٨٢" }
  ];
  
  const found = entries.find(e => {
    const n = e.name.replace(/[أإآا]/g, "ا").replace(/[ةه]/g, "ه").replace(/[يى]/g, "ي");
    return n.includes(cleanName) || cleanName.includes(n);
  });
  
  return found ? found.license : null;
}

/**
 * Retrieve invitation record by its code from the subscriber's store.
 */
export function getInvitationByCode(code: string): Invitation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("nzamy_library_subscription_v1");
    if (!raw) return null;
    const sub = JSON.parse(raw) as LibrarySubscription;
    return sub.invitations.find(i => i.code.toUpperCase() === code.toUpperCase()) || null;
  } catch {
    return null;
  }
}

// ── Issue Reports Store ────────────────────────────────────────────────────

export interface AttachedFile {
  name: string;
  type: string;
  dataUrl: string;
  size: number;
}

export interface IssueReport {
  id: string;
  pageSlug: string;
  pageType: "law" | "precedent" | "book" | "order";
  description: string;
  screenshotDataUrl?: string;
  category?: "data_error" | "missing_data" | "add_data" | "other";
  attachedFiles?: AttachedFile[];
  whatsapp?: string;
  createdAt: string;
}

const REPORTS_KEY = "nzamy_library_issue_reports_v1";

export function submitIssueReport(
  report: Omit<IssueReport, "id" | "createdAt">
): IssueReport {
  const full: IssueReport = {
    ...report,
    id:        crypto.randomUUID?.() ?? String(Date.now()),
    createdAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const existing: IssueReport[] = (() => {
      try {
        return JSON.parse(localStorage.getItem(REPORTS_KEY) ?? "[]") as IssueReport[];
      } catch { return []; }
    })();
    existing.push(full);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(existing));
  }

  return full;
}
