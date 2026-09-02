"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, User, Robot, Ticket, Money, Star, Eye,
  LockSimple, Crown, ChatCircle, ShieldCheck, Clock,
  CheckCircle, Warning, Globe, DeviceMobile, Desktop,
  SignIn, SignOut, CreditCard, ChartLine, Scales,
  ArrowSquareOut, Envelope, Prohibit, UserSwitch,
  Plus, Minus, SpinnerGap, CaretDown,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import {
  DB_USER_TYPES,
  isAssignableUserType,
  isDbUserType,
  type DbUserType,
} from "@/lib/auth/userTypes";
import {
  SECTOR_ROW_BY_USER_TYPE,
  isClaimableDbUserType,
} from "@/lib/auth/accountTypeClaim";

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface SubscriptionPlan {
  id: string;
  name_ar: string;
  name_en: string;
  tier: string;
  price_monthly: number;
  price_yearly: number;
}

interface Subscription {
  id: string;
  status: string;
  tier: string;
  billing_cycle: string;
  current_period_end: string;
  auto_renew: boolean;
  plan_id: string;
  created_at: string;
  subscription_plans?: SubscriptionPlan;
}

interface CreditTransaction {
  id: string;
  amount: number;
  kind: string;
  description: string;
  balance_after: number;
  created_at: string;
}

interface UserData {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  user_type: string;
  status: string;
  city: string;
  verified_at: string | null;
  created_at: string;
  last_sign_in_at: string;
  subscription: Subscription | null;
  subscription_history: Subscription[];
  lawyer_profile: Record<string, unknown> | null;
  credit_transactions: CreditTransaction[];
  credit_balance: number;
}

/**
 * Arabic label for every `profiles.user_type` value.
 *
 * Typed as a total `Record<DbUserType, string>` rather than the
 * `Record<string,string>` this used to be: the old map listed only seven of the
 * nine types and silently omitted `government` and `ngo`, so a government or
 * NGO account rendered the raw English value in the page header and in the
 * account-type row of the security card. A total record makes a missing label a
 * compile error. (Both of those are in this file. No line number is cited for
 * them: they move whenever anything above them is edited, which is how the
 * previous numbers here went stale.)
 *
 * Scope: this is **this page's** vocabulary for `profiles.user_type`, and it is
 * the right vocabulary for a sentence about the account. It is the wrong one for
 * a sentence about the admin verification queue, which names a row from its own
 * maps and agrees with this one on «محامي» alone — see `QUEUE_ROW_NAMING` below
 * before quoting any of these labels in a sentence about that list.
 */
const ROLE_MAP: Record<DbUserType, string> = {
  individual: "عميل فرد",
  lawyer: "محامي",
  firm: "مكتب محاماة",
  corporate: "شركة",
  micro: "منشأة صغيرة",
  provider: "مزود خدمة",
  government: "جهة حكومية",
  ngo: "منظمة غير ربحية",
  admin: "مسؤول",
};

/** The Arabic label for a stored type, or the raw value if it is not one of the nine. */
function roleLabel(userType: string): string {
  return (ROLE_MAP as Record<string, string>)[userType] ?? userType;
}

/**
 * One line of the manual-steps panel.
 *
 * `code` holds table and column identifiers. They are rendered in their own
 * `dir="ltr"` element rather than inline in the Arabic sentence: an identifier
 * list carries neutrals — parentheses and commas — and in an RTL paragraph the
 * bidi algorithm puts them on the wrong side, so a copied
 * `government_profiles(owner_user_id, entity_name_ar)` would paste back
 * mangled. This copy exists to be pasted into a SQL editor, so it has to
 * survive the trip.
 */
type SectorNote = { text: string; code?: string };

/** The sector row a type needs: which table, and the column holding the user id. */
type SectorRowRef = { table: string; ownerColumn: "user_id" | "owner_user_id" };

/**
 * The sector row a given type needs, or `null` when it needs none.
 *
 * Table and owner column are read from `SECTOR_ROW_BY_USER_TYPE`
 * (src/lib/auth/accountTypeClaim.ts) rather than restated here, so for every
 * type served by that lookup they cannot drift from the ones the onboarding
 * claim provisions. `provider` and `admin` are handled by the two explicit
 * branches below instead. No line number is cited into that file: it is under
 * change.
 */
function sectorRowFor(t: DbUserType): SectorRowRef | null {
  // `provider_profiles` is owned by `user_id`
  // (supabase/migrations/20260603_phase1_001_profiles.sql:157-160).
  //
  // This branch runs BEFORE the lookup, so it wins over any `provider` entry
  // the map holds. It is kept only so this page states the right manual steps
  // whatever accountTypeClaim.ts currently says about `provider`: an admin can
  // set that type from the control below either way, and a page that silently
  // answered «this type needs no sector row» would be worse than one duplicated
  // constant. Once that file settles, delete this branch and let the lookup
  // serve `provider`, so the two cannot disagree about the table.
  if (t === "provider") return { table: "provider_profiles", ownerColumn: "user_id" };
  // Never offered by this control; see `handleChangeUserType`.
  if (t === "admin") return null;
  if (!isClaimableDbUserType(t)) return null;
  const spec = SECTOR_ROW_BY_USER_TYPE[t];
  return spec ? { table: spec.table, ownerColumn: spec.ownerColumn } : null;
}

/**
 * Per type, the columns of its sector table that are NOT NULL **with no
 * default** — i.e. the ones an INSERT must carry or it fails with 23502.
 *
 * Deliberately narrower than `SectorRowSpec.columns`, which also lists columns
 * the signup trigger merely chooses to set (`name_en`, `is_accepting_clients`,
 * `business_name`) along with the placeholder values it uses. Those values are
 * signup's stand-ins, not requirements; printing them here would tell the admin
 * to paste «جهة جديدة» into a production row.
 *
 * Verified column by column against the migrations:
 *   lawyer_profiles      — every NOT NULL column either has a default or is the
 *                          PK, so `user_id` alone inserts cleanly. The six
 *                          columns carrying no default (license_number,
 *                          license_expiry, bar_association, hourly_rate,
 *                          credit_package, credit_expiry) are all nullable
 *                          (20260603_phase1_001_profiles.sql:92-115)
 *   provider_profiles    — sub_role, NOT NULL + CHECK, no default (…:159-160)
 *   micro_profiles       — business_name is `not null default ''` (…:217), so
 *                          the user id alone inserts cleanly
 *   firm_profiles        — name_ar (20260603_phase1_002_entities.sql:38)
 *   business_profiles    — company_name_ar (…:221)
 *   government_profiles  — entity_name_ar, entity_type (…:400-406)
 *   ngo_profiles         — org_name_ar, org_type (…:570-573)
 */
const REQUIRED_SECTOR_COLUMNS: Record<DbUserType, readonly string[]> = {
  individual: [],
  lawyer: [],
  provider: ["sub_role"],
  micro: [],
  firm: ["name_ar"],
  corporate: ["company_name_ar"],
  government: ["entity_name_ar", "entity_type"],
  ngo: ["org_name_ar", "org_type"],
  admin: [],
};

/**
 * Columns whose value is constrained by a CHECK, with the allowed values.
 * An admin cannot guess these, and a wrong one fails the insert.
 */
const SECTOR_ENUM_HINT: Partial<Record<DbUserType, { column: string; values: string }>> = {
  provider: {
    column: "sub_role",
    values: "notary | arbitrator | bailiff",
  },
  government: {
    column: "entity_type",
    values: "court | prosecution | ministry | authority | commission | municipality | other",
  },
  ngo: {
    column: "org_type",
    values: "charity | waqf | foundation | campaign | association | other",
  },
};

/**
 * The only three tables the admin verification queue is built from —
 * src/app/api/v1/admin/verifications/route.ts:52, :69 and :86. There is no
 * fourth branch, so `business_profiles`, `micro_profiles`,
 * `government_profiles` and `ngo_profiles` never feed that queue at all.
 *
 * A tuple rather than a `readonly string[]`, so `VerificationQueueTable` below
 * is the union of exactly these three and `QUEUE_ROW_NAMING` is a total record
 * over it — a queue table with no naming entry is then a compile error rather
 * than a sentence that quotes nothing.
 */
const VERIFICATION_QUEUE_TABLES = [
  "lawyer_profiles",
  "provider_profiles",
  "firm_profiles",
] as const;

type VerificationQueueTable = (typeof VERIFICATION_QUEUE_TABLES)[number];

/** Which of the three queue tables this row lives in, or `null` for the rest. */
function queueTableFor(row: SectorRowRef | null): VerificationQueueTable | null {
  if (!row) return null;
  return VERIFICATION_QUEUE_TABLES.find((t) => t === row.table) ?? null;
}

function feedsVerificationQueue(row: SectorRowRef | null): boolean {
  return queueTableFor(row) !== null;
}

/**
 * How the verification queue NAMES a row. Keyed by table, not by user type, and
 * that is the whole point: the queue's label follows the row's table, not this
 * page's `ROLE_MAP`.
 *
 * The API gives every row a `type` derived from where it came from — `"lawyer"`
 * for a `lawyer_profiles` row and `"firm"` for a `firm_profiles` one, but for a
 * `provider_profiles` row it is that row's own `sub_role`
 * (src/app/api/v1/admin/verifications/route.ts:120, :137 and :154). The string
 * `"provider"` is never produced, so no screen can show «مزود خدمة» for one.
 * Both screens that render this list label the row from that `type`: the
 * «المجتمع» tab of the admin console through `TYPE_LABELS`
 * (src/app/dashboard/admin/tabs/CommunityTab.tsx:6-12, used at :173) and
 * «تحقق المزودين» through `TYPE_CFG`
 * (src/app/dashboard/admin/provider-verification/page.tsx:22-28, used at :331,
 * reached from src/components/admin/AdminSidebar.tsx:28, which fetches through
 * `getVerificationRequests` in src/lib/services/adminService.ts:88).
 *
 * Of this page's labels only «محامي» survives that trip unchanged. A firm is
 * «شركة محاماة» on both screens where this page says «مكتب محاماة»; and the two
 * screens do not even agree with each other about the provider kinds
 * («موثّق/محكّم/معقّب» against «مكتب توثيق/محكم/منفذ أحكام»), so for a provider
 * row there is no single label that could be quoted truthfully. What is quoted
 * for it instead is the one identifier that cannot drift and that the admin is
 * the person typing in: the `sub_role` value itself.
 *
 * Two fields because the same fragment is read in two frames — «يظل معروضًا
 * فيها …» and «ولا يظهر فيها …» — and the "not as «مزود خدمة»" aside that reads
 * correctly in the first turns into a double negative in the second.
 */
const QUEUE_ROW_NAMING: Record<
  VerificationQueueTable,
  { readonly listedAs: string; readonly absentAs: string }
> = {
  lawyer_profiles: { listedAs: "بوصفه «محامي»", absentAs: "بوصفه «محامي»" },
  firm_profiles: { listedAs: "بوصفه «شركة محاماة»", absentAs: "بوصفه «شركة محاماة»" },
  provider_profiles: {
    listedAs: "باسم التخصص المخزَّن في العمود sub_role — لا بوصفه «مزود خدمة» —",
    absentAs: "باسم التخصص الذي يحمله العمود sub_role",
  },
};

/**
 * What the admin has to do about the row the NEW type needs.
 *
 * This request — a PATCH /api/v1/admin/users/[id] whose body carries only
 * `user_type` — writes `profiles` and nothing else
 * (src/app/api/v1/admin/users/[id]/route.ts:195-200). The route has exactly one
 * other write, the suspension branch at :210-226, which updates `subscriptions`
 * and then auth metadata; a `user_type` body never reaches it, because that
 * branch is gated on `body.status === "suspended"`. The sector rows are
 * created by the signup trigger `handle_new_user`, which is `AFTER INSERT ON
 * auth.users` — it does not fire on a profile update. So changing someone's
 * type never creates the row that type needs.
 *
 * The consequence is NOT uniform across types, and saying it were would be
 * false: the verification queue reads exactly three tables (see
 * `VERIFICATION_QUEUE_TABLES`), so a missing row blocks verification for
 * lawyer, firm and provider only. For corporate, micro, government and ngo the
 * queue has no branch reading their tables, so creating the row does not put
 * them in it — each of those says what its row actually does instead.
 */
function newSectorRowNotes(t: DbUserType): SectorNote[] {
  const row = sectorRowFor(t);
  if (!row) {
    return [{ text: "هذا النوع لا يحتاج إلى صف قطاع، فلا خطوة يدوية من هذه الناحية." }];
  }

  const required = REQUIRED_SECTOR_COLUMNS[t];
  const notes: SectorNote[] = [];

  // The colon has to be the last thing before the identifier list, so the
  // remark about the remaining columns is its own line rather than wedged
  // between the colon and the code block it introduces.
  notes.push({
    text:
      "الصف الجديد لن يُنشأ تلقائيًا: هذا الإجراء يكتب في جدول profiles فقط، وينشئ مُشغّل التسجيل صفوف القطاع لحظة إنشاء الحساب لا عند تعديله. " +
      "أنشئ الصف يدويًا من قاعدة البيانات؛ الأعمدة الإلزامية التي لا قيمة افتراضية لها هي:",
    code: `${row.table}(${[row.ownerColumn, ...required].join(", ")})`,
  });
  notes.push({
    text:
      required.length === 0
        ? t === "micro"
          ? "وبقية الأعمدة لها قيم افتراضية، فمعرّف المستخدم وحده يكفي لنجاح الإدراج — غير أن business_name قيمته الافتراضية نص فارغ، فالأفضل تعبئته باسم النشاط."
          : "وبقية الأعمدة لها قيم افتراضية، فمعرّف المستخدم وحده يكفي لنجاح الإدراج."
        : "وبقية الأعمدة لها قيم افتراضية. ضع في الأعمدة أعلاه القيم الحقيقية لهذا الحساب، لا قيمًا مؤقتة.",
  });

  const hint = SECTOR_ENUM_HINT[t];
  if (hint) {
    notes.push({
      text: `وقيم العمود ${hint.column} محصورة بقيد في قاعدة البيانات، وأي قيمة غيرها تُرفض:`,
      code: hint.values,
    });
  }

  if (feedsVerificationQueue(row)) {
    notes.push({
      // Scoped to the queue on purpose. An unqualified «لن يمكن توثيقه» would
      // be contradicted by a button on this very page: «تحقق من الحساب»,
      // in the header actions above, calls `handleVerify`, which PATCHes
      // `{verified: true}` and writes
      // `profiles.verified_at` — and it succeeds whether or not a sector row
      // exists. Two different things both read as «توثيق» in Arabic, so the
      // note names which one it is talking about.
      text:
        "وقائمة طلبات التوثيق تُبنى من هذا الجدول، فقبل إنشاء الصف لن يظهر الحساب فيها ولن يمكن توثيقه من هناك. " +
        "وزر «تحقق من الحساب» أعلى الصفحة شيء آخر: يضبط حقلًا في profiles ولا يُغني عن توثيق القطاع." +
        (t === "lawyer"
          ? " ودليل المحامين العام يشترط وجود الصف موثّقًا كذلك، فلن يظهر فيه قبل ذلك."
          : ""),
    });
  } else {
    notes.push({
      text:
        "وقائمة طلبات التوثيق لا تقرأ هذا الجدول أصلًا، فلن يظهر الحساب فيها سواء أنشأت الصف أو لم تنشئه. " +
        "الجداول الثلاثة التي تُبنى منها القائمة هي:",
      code: VERIFICATION_QUEUE_TABLES.join(", "),
    });
    if (t === "corporate") {
      notes.push({
        text: "ولوحة الشركات لدى المسؤول تُبنى من business_profiles، فلن تظهر الشركة فيها قبل إنشاء الصف.",
      });
    } else if (t === "micro") {
      notes.push({
        text: "وبيانات ملف الحساب تقرأ micro_profiles حين يكون النوع «منشأة صغيرة»، فتعود فارغة قبل إنشاء الصف.",
      });
    } else {
      notes.push({
        text: "وإنشاء الصف يجعل بيانات الحساب مطابقة لما كان التسجيل سيُنشئه له.",
      });
    }
  }

  return notes;
}

/**
 * What happens to the row the OLD type had — which nothing in this change
 * deletes.
 *
 * The same one-table write that fails to create the new row also fails to
 * remove the old one, and for the three queue-fed tables the leftover is not
 * inert: src/app/api/v1/admin/verifications/route.ts:52 selects from
 * `lawyer_profiles` with no `user_type` filter, and its `status` param defaults
 * to `'all'` (:41) while the admin tab sends no status at all on its default
 * filter (src/app/dashboard/admin/tabs/CommunityTab.tsx:22,33). So no
 * `verification_status` value hides a stale row from the default view —
 * deleting it is the only way out, which is why the note says so and also says
 * what deleting costs.
 */
function oldSectorRowNotes(fromType: DbUserType): SectorNote[] {
  const row = sectorRowFor(fromType);
  if (!row) return [];

  const notes: SectorNote[] = [
    {
      // Not «وصف القطاع القديم» — with the wāw attached, that reads as "the
      // description of the old sector" before it reads as "and the row".
      text: "أما صف القطاع القديم فلا يُحذف: الإجراء يكتب في profiles فقط، فيبقى صف هذا الحساب كما هو بعد التغيير — وهو الصف الذي يطابق معرّف المستخدم المعروض أدناه في:",
      code: `${row.table}.${row.ownerColumn}`,
    },
  ];

  const queueTable = queueTableFor(row);
  if (queueTable) {
    notes.push({
      // The label is the queue's, never `roleLabel` — this sentence sends the
      // admin to look for a row in a list that names it from its own map. See
      // `QUEUE_ROW_NAMING`.
      text:
        `وقائمة طلبات التوثيق تقرأ هذا الجدول دون النظر إلى نوع الحساب، وفلترها الافتراضي هو «الكل»، ` +
        `فسيظل الحساب معروضًا فيها ${QUEUE_ROW_NAMING[queueTable].listedAs} وقابلًا للتوثيق هناك. ` +
        `ولا توجد حالة توثيق تُخفيه؛ إخراجه من القائمة يتطلب حذف الصف يدويًا، وحذفه يمحو ما فيه (بيانات الترخيص وحالة التوثيق وما تعلّق بهما).` +
        (fromType === "lawyer"
          ? " أما دليل المحامين العام فغير متأثر: فهو يشترط أن يكون نوع الحساب «محامي»، فيسقط الحساب منه فور التغيير."
          : ""),
    });
    if (queueTable === "provider_profiles") {
      // The one type whose queue label is not a constant, so the fragment above
      // could not quote it. Both screens' wordings are given, because they
      // differ from each other — see `QUEUE_ROW_NAMING`.
      //
      // Deliberately promises nothing about searching: both search boxes match
      // on name and id only, never on the type
      // (src/app/api/v1/admin/verifications/route.ts:168-172 for the server
      // filter, and src/app/dashboard/admin/provider-verification/page.tsx:122-125
      // for the KYC page's own client-side one). Neither screen sends the `type`
      // param the route also supports (:173-175).
      notes.push({
        text:
          "وتسمية صف مزود الخدمة في تلك القائمة تأتي من قيمة sub_role لا من نوع الحساب، وصياغتها العربية تختلف بين الشاشتين: " +
          "«موثّق» أو «محكّم» أو «معقّب» في صفحة «تحقق المزودين»، و«مكتب توثيق» أو «محكم» أو «منفذ أحكام» في تبويب «المجتمع». " +
          "وعبارة «مزود خدمة» لا تظهر في أيٍّ منهما.",
      });
    }
  } else if (fromType === "corporate") {
    notes.push({
      text: "ولوحة الشركات لدى المسؤول تُبنى من business_profiles دون النظر إلى نوع الحساب، فستظل الشركة معروضة فيها حتى يُحذف الصف يدويًا.",
    });
  } else {
    notes.push({
      text: "وقائمة طلبات التوثيق لا تقرأ هذا الجدول، فبقاء الصف لا يُدرج الحساب فيها.",
    });
  }

  return notes;
}

/**
 * The complete manual-steps panel for a change from one type to another:
 * the row the new type lacks, the row the old type leaves behind, and — when
 * both types are queue-fed — the one sentence that reconciles them.
 */
function sectorRowNotes(fromType: string, toType: string): SectorNote[] {
  // Narrowed rather than cast. The only source of these values is the stored
  // profile and the <select> below, whose options are DB values — but a value
  // that is not one of the nine must not fall through to a sentence claiming
  // anything about a type this page knows nothing about.
  if (!isDbUserType(toType)) return [];
  const notes = [...newSectorRowNotes(toType)];
  if (isDbUserType(fromType)) {
    notes.push(...oldSectorRowNotes(fromType));
    const fromQueueTable = queueTableFor(sectorRowFor(fromType));
    const toQueueTable = queueTableFor(sectorRowFor(toType));
    if (fromType !== toType && fromQueueTable !== null && toQueueTable !== null) {
      notes.push({
        // Both halves are the QUEUE's names for the two rows, not this page's
        // names for the two types. `listedAs` and `absentAs` differ for a
        // provider so each half reads in its own frame — see `QUEUE_ROW_NAMING`.
        text:
          `والحصيلة: يظل الحساب في قائمة طلبات التوثيق ${QUEUE_ROW_NAMING[fromQueueTable].listedAs} بسبب الصف القديم، ` +
          `ولا يظهر فيها ${QUEUE_ROW_NAMING[toQueueTable].absentAs} لغياب الصف الجديد، إلى أن تُعالَج الحالتان يدويًا.`,
      });
    }
  }
  return notes;
}

/**
 * Arabic failure text for a PATCH status.
 *
 * Deliberately does NOT surface the server's `error` field, which the sibling
 * handlers on this page do. That route returns `updateError.message` — the raw
 * Postgres string, in English — for any database failure
 * (src/app/api/v1/admin/users/[id]/route.ts:202-207), while every other branch
 * returns Arabic. Passing it through would put English on screen on exactly the
 * interesting case (a CHECK-constraint rejection), so the Arabic is authored
 * here instead. Every branch says the change was not saved, so a failure is
 * never mistaken for a partial one.
 */
function userTypeErrorFor(status: number): string {
  if (status === 401) return "انتهت الجلسة — يرجى تسجيل الدخول من جديد. لم يُحفظ أي تغيير.";
  if (status === 403) return "غير مصرح — صلاحيات المسؤول مطلوبة. لم يُحفظ أي تغيير.";
  if (status === 404) return "المستخدم غير موجود. لم يُحفظ أي تغيير.";
  if (status === 400) return "بيانات غير صالحة. لم يُحفظ أي تغيير.";
  return "تعذّر تغيير نوع الحساب. لم يُحفظ أي تغيير.";
}

const TIER_MAP: Record<string,string> = {
  free: "مجاني",
  ai: "الذكية",
  pro: "الاحترافية",
  corp: "المؤسسية",
  max: "الحد الأقصى",
};

const STATUS_MAP: Record<string,{label:string;cls:string}> = {
  active: { label:"نشط", cls:"bg-emerald-500/15 border border-emerald-500/30 text-emerald-400" },
  suspended: { label:"معلّق", cls:"bg-red-500/15 border border-red-500/30 text-red-400" },
  pending: { label:"بانتظار التحقق", cls:"bg-amber-500/15 border border-amber-500/30 text-amber-400" },
  trial: { label:"تجربة مجانية", cls:"bg-blue-500/15 border border-blue-500/30 text-blue-400" },
  inactive: { label:"غير نشط", cls:"bg-zinc-500/15 border border-zinc-500/30 text-zinc-400" },
};

function mapStatus(subStatus?: string, verifiedAt?: string | null): string {
  if (subStatus === "suspended") return "suspended";
  if (subStatus === "trialing" || subStatus === "trial") return "trial";
  if (!verifiedAt) return "pending";
  return "active";
}

type Tab = "activity"|"subscription"|"ai"|"tickets"|"security";

/* ── Skeleton ──────────────────────────────────────────────────────────────── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-700/30 ${className}`} />;
}

/* ── Sector-row notes ──────────────────────────────────────────────────────── */
/**
 * Renders the manual-steps list. Used in two places with the same markup —
 * the confirmation panel before the write, and the success message after it —
 * so the admin reads the identical instruction at both moments.
 */
function SectorNotes({ notes, tone }: { notes: SectorNote[]; tone: string }) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {notes.map((n, i) => (
        <div key={i}>
          <p className={`text-[11px] leading-6 ${tone}`}>{n.text}</p>
          {n.code && (
            // `dir="ltr"` so the parentheses and commas of an identifier list
            // are not reordered by the surrounding RTL context. This string is
            // meant to be copied into a SQL editor.
            //
            // Its colours are fixed rather than inherited from `tone`. This is
            // the one thing on the card that has to be read character by
            // character, and it appears inside three differently tinted
            // containers (amber confirmation, emerald success, red failure) in
            // both themes; `bg-black/20` + `text-current` gave emerald-on-grey
            // over a light card, which is not readable enough for a string
            // being retyped into a SQL editor.
            <code
              dir="ltr"
              className="mt-1 block w-full overflow-x-auto rounded-lg bg-zinc-900 px-2 py-1 text-left font-mono text-[10px] text-zinc-100"
            >
              {n.code}
            </code>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function UserProfilePage() {
  const { isDark } = useTheme();
  const params = useParams();
  const userId = params.id as string;

  const [tab, setTab] = useState<Tab>("activity");
  const [impersonating, setImpersonating] = useState(false);

  /* ── Data state ────────────────────────────────────────────────────────── */
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Subscription actions state ────────────────────────────────────────── */
  const [changingPlan, setChangingPlan] = useState(false);
  const [selectedTier, setSelectedTier] = useState("");
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [planActionMsg, setPlanActionMsg] = useState<{type:"ok"|"err";text:string}|null>(null);

  /* ── Credits state ─────────────────────────────────────────────────────── */
  const [showCredits, setShowCredits] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDesc, setCreditDesc] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMsg, setCreditMsg] = useState<{type:"ok"|"err";text:string}|null>(null);

  /* ── Account-type state ────────────────────────────────────────────────── */
  // `typeConfirming` is the second step: picking a type arms the change, it does
  // not perform it. This is a permissions change, so it gets an explicit
  // confirmation that names both types and the manual step that follows.
  const [changingType, setChangingType] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [typeConfirming, setTypeConfirming] = useState(false);
  const [typeLoading, setTypeLoading] = useState(false);
  // `notes` carries the manual steps as separate lines rather than one long
  // string, because the success block renders the same list the confirmation
  // panel showed — and the confirmation panel is gone by then. Concatenating
  // them into `text` would put the complete instruction only on the screen that
  // disappears at the moment the admin needs to act on it.
  const [typeMsg, setTypeMsg] = useState<{type:"ok"|"err";text:string;notes?:SectorNote[]}|null>(null);

  const resetTypeChange = useCallback(() => {
    setChangingType(false);
    setSelectedType("");
    setTypeConfirming(false);
  }, []);

  /* ── Fetch user data ───────────────────────────────────────────────────── */
  const fetchUser = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "حدث خطأ");
      setUserData(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  /* ── Tab query param effect ────────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as Tab;
      if (tabParam && ["activity", "subscription", "ai", "tickets", "security"].includes(tabParam)) {
        setTab(tabParam);
      }
    }
  }, []);

  /* ── Status actions handlers ───────────────────────────────────────────── */
  const [actionLoading, setActionLoading] = useState(false);

  const handleVerify = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: true }),
      });
      if (!res.ok) throw new Error("فشل توثيق الحساب");
      fetchUser();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!confirm("هل أنت متأكد من تعليق الحساب؟ سيتم إلغاء أي اشتراك نشط.")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      });
      if (!res.ok) throw new Error("فشل تعليق الحساب");
      fetchUser();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: true }),
      });
      if (!res.ok) throw new Error("فشل تفعيل الحساب");
      fetchUser();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Change account type handler ───────────────────────────────────────── */
  /**
   * Corrects a user's `profiles.user_type`.
   *
   * This is the remedy behind the onboarding claim's refusal message. The claim
   * is one-time by design (src/lib/auth/accountTypeClaim.ts) and tells the user
   * «للتغيير، يرجى التواصل مع الدعم» — support being د. محمد, who until now had
   * no way to do it. The write goes through PATCH /api/v1/admin/users/[id],
   * which is admin-gated (route.ts:150-161) and uses the service client, so the
   * `trg_lock_user_type` trigger lets it through: that trigger returns NEW
   * unconditionally when `auth.uid() IS NULL`
   * (supabase/migrations/20260716_security_hardening.sql:132-134), which is the
   * case for a service-role connection.
   *
   * Both `admin` guards below live here, in code, rather than relying on which
   * options the <select> happens to contain — the dropdown's contents are a UI
   * detail, and the route itself validates nothing at all (route.ts:182-184
   * writes `body.user_type` straight through).
   */
  const handleChangeUserType = async () => {
    if (!U || !selectedType) return;

    // Guard 1 — nobody is promoted to `admin` from this console.
    // `isAssignableUserType` is the project's existing predicate for exactly
    // this and returns false for `admin` (src/lib/auth/userTypes.ts; no line
    // cited, that file is under change too).
    if (!isAssignableUserType(selectedType)) {
      setTypeMsg({ type: "err", text: "لا يمكن تعيين نوع «مسؤول» من هذه الصفحة. لم يُحفظ أي تغيير." });
      return;
    }

    // Guard 2 — and nobody is demoted OUT of `admin` from it either. One of the
    // live accounts is the admin; demoting it here, including by an admin
    // viewing their own page, would remove the only account that can reach this
    // console, and the sole recovery is a manual database edit.
    if (U.user_type === "admin") {
      setTypeMsg({ type: "err", text: "لا يمكن تغيير نوع حساب المسؤول من هذه الصفحة. لم يُحفظ أي تغيير." });
      return;
    }

    if (selectedType === U.user_type) return;

    setTypeLoading(true);
    setTypeMsg(null);
    const fromLabel = roleLabel(U.user_type);
    const toLabel = roleLabel(selectedType);
    // Snapshot the manual steps BEFORE the write, for the same reason
    // `fromLabel` is snapshotted: `fetchUser()` below replaces `U.user_type`
    // with the new value, so computing the old-row half afterwards would
    // describe the new type's table instead of the one left behind.
    const notes = sectorRowNotes(U.user_type, selectedType);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_type: selectedType }),
      });
      if (!res.ok) {
        setTypeMsg({ type: "err", text: userTypeErrorFor(res.status) });
        return;
      }
      // The manual steps ride along with the success text, because this is the
      // moment the admin can still act on them — and the confirmation panel
      // that showed them a second ago is about to be torn down.
      setTypeMsg({
        type: "ok",
        text:
          `تم تغيير نوع الحساب من «${fromLabel}» إلى «${toLabel}».` +
          (notes.length > 0 ? " وما تبقّى خطوات يدوية في قاعدة البيانات:" : ""),
        notes,
      });
      resetTypeChange();
      fetchUser(); // refresh
    } catch {
      // A thrown fetch is a transport failure; its message is English, so it is
      // not surfaced.
      setTypeMsg({ type: "err", text: "تعذّر الاتصال بالخادم. لم يُحفظ أي تغيير." });
    } finally {
      setTypeLoading(false);
    }
  };

  /* ── Create subscription handler ─────────────────────────────────────────── */
  const handleCreateSubscription = async () => {
    if (!selectedTier || !userId) return;
    setPlanActionLoading(true);
    setPlanActionMsg(null);
    try {
      const res = await fetch("/api/v1/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          tier: selectedTier,
          billing_cycle: "monthly",
          period_months: 12
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل إنشاء الاشتراك");
      setPlanActionMsg({ type: "ok", text: json.message || "تم تعيين الاشتراك بنجاح" });
      setChangingPlan(false);
      setSelectedTier("");
      fetchUser(); // refresh
    } catch (err: unknown) {
      setPlanActionMsg({ type: "err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally {
      setPlanActionLoading(false);
    }
  };

  /* ── Change plan handler ───────────────────────────────────────────────── */
  const handleChangePlan = async () => {
    if (!userData?.subscription?.id || !selectedTier) return;
    setPlanActionLoading(true);
    setPlanActionMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/subscriptions/${userData.subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedTier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل تحديث الباقة");
      setPlanActionMsg({ type:"ok", text: json.message || "تم تحديث الباقة بنجاح" });
      setChangingPlan(false);
      setSelectedTier("");
      fetchUser(); // refresh
    } catch (err: unknown) {
      setPlanActionMsg({ type:"err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally {
      setPlanActionLoading(false);
    }
  };

  /* ── Grant credits handler ─────────────────────────────────────────────── */
  const handleGrantCredits = async () => {
    const amt = parseInt(creditAmount, 10);
    if (!amt || !creditDesc.trim() || !userId) return;
    setCreditLoading(true);
    setCreditMsg(null);
    try {
      const res = await fetch("/api/v1/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, amount: amt, description: creditDesc }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل تعديل الرصيد");
      setCreditMsg({ type:"ok", text: json.message || "تم تعديل الرصيد بنجاح" });
      setCreditAmount("");
      setCreditDesc("");
      setShowCredits(false);
      fetchUser(); // refresh
    } catch (err: unknown) {
      setCreditMsg({ type:"err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally {
      setCreditLoading(false);
    }
  };
  /* ── Derived values ────────────────────────────────────────────────────── */
  const U = userData;
  const activeSub = U?.subscription;
  const subHistory = U?.subscription_history ?? [];
  const creditTxns = U?.credit_transactions ?? [];
  const statusInfo = U ? (STATUS_MAP[mapStatus(activeSub?.status, U.verified_at)] ?? STATUS_MAP.inactive) : STATUS_MAP.inactive;

  // The last fallback is reached only when `activeSub` is null — i.e. the
  // account has no subscription row at all — and it used to print «مجاني».
  // That is a different fact from being on the free plan, and on this platform
  // it is most accounts: it claimed someone had been placed on a plan when
  // nothing had been written for them. The list this page opens from
  // (src/app/dashboard/admin/users/page.tsx) draws the same distinction as
  // «بدون اشتراك»; the two screens are one click apart and must not disagree
  // about the same account. The three steps above it are unchanged and stay in
  // order: the plan's own name_ar, then the tier map, then the raw tier — never
  // a default for a tier that exists but is unrecognised.
  const planLabel = activeSub?.subscription_plans?.name_ar
    ?? TIER_MAP[activeSub?.tier ?? ""] ?? activeSub?.tier ?? "بدون اشتراك";

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const TABS:{id:Tab;label:string;icon:React.ElementType}[] = [
    { id:"activity", label:"النشاط", icon:Clock },
    { id:"subscription", label:"الاشتراك", icon:CreditCard },
    { id:"ai", label:"استخدام AI", icon:Robot },
    { id:"tickets", label:"تذاكر الدعم", icon:Ticket },
    { id:"security", label:"الأمان", icon:ShieldCheck },
  ];

  /* ── Loading State ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        {/* KPI skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_,i) => (
            <div key={i} className={`${card} p-4 flex items-center gap-3`}>
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-full rounded-xl" />
        {/* Content skeleton */}
        <div className={`${card} p-5 space-y-4`}>
          {[...Array(5)].map((_,i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Error State ───────────────────────────────────────────────────────── */
  if (error || !U) {
    return (
      <div className="max-w-6xl mx-auto" dir="rtl">
        <div className={`${card} p-10 text-center space-y-4`}>
          <Warning size={40} weight="duotone" className="text-red-400 mx-auto" />
          <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            {error || "المستخدم غير موجود"}
          </p>
          <Link href="/dashboard/admin/users"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold ${isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"} transition-colors`}>
            <ArrowLeft size={14} /> العودة لقائمة المستخدمين
          </Link>
        </div>
      </div>
    );
  }

  /* ── Helpers for display ───────────────────────────────────────────────── */
  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("ar-SA", { year:"numeric", month:"long", day:"numeric" }); }
    catch { return d; }
  };

  const timeAgo = (d: string | null | undefined) => {
    if (!d) return "—";
    try {
      const diff = Date.now() - new Date(d).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "الآن";
      if (mins < 60) return `منذ ${mins} دق`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `منذ ${hours} ساعة`;

      const days = Math.floor(hours / 24);
      return `منذ ${days} يوم`;
    } catch {
      return "—";
    }
  };

  /* ── Build activity from credit transactions ───────────────────────────── */
  const ACTIVITY = creditTxns.slice(0, 10).map(tx => ({
    action: tx.description || (tx.amount > 0 ? `إضافة ${tx.amount} رصيد` : `خصم ${Math.abs(tx.amount)} رصيد`),
    time: timeAgo(tx.created_at),
    type: tx.kind === "admin_adjustment" ? "pay" as const : "ai" as const,
  }));

  /* ── Build payments from subscription history ──────────────────────────── */
  const PAYMENTS = subHistory.map(s => ({
    date: formatDate(s.created_at),
    amount: s.subscription_plans?.price_monthly ?? 0,
    status: s.status,
    tier: s.subscription_plans?.name_ar ?? s.tier,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">

      {/* Impersonation Banner */}
      {impersonating && (
        <motion.div initial={{y:-40,opacity:0}} animate={{y:0,opacity:1}}
          className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white flex items-center justify-center gap-3 py-2.5 text-[13px] font-bold shadow-lg">
          <UserSwitch size={16} weight="bold"/>
          أنت تتصفح المنصة كـ {U.full_name ?? U.email} — كل الإجراءات مسجلة
          <button onClick={()=>setImpersonating(false)}
            className="mr-4 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] font-bold transition-colors">
            إنهاء الانتحال
          </button>
        </motion.div>
      )}

      {/* Back + Header */}
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/users"
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${isDark?"bg-zinc-800 text-zinc-400 hover:bg-zinc-700":"bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
            <ArrowLeft size={16}/>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className={`text-xl font-bold ${isDark?"text-white":"text-slate-800"}`}>{U.full_name ?? U.email}</h1>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
                {statusInfo.label}
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{planLabel}</span>
            </div>
            <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>
              {roleLabel(U.user_type)} · {U.email} · {U.id.slice(0,8)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {actionLoading ? (
            <SpinnerGap size={14} className="animate-spin text-zinc-400" />
          ) : (
            <>
              <button onClick={()=>setImpersonating(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-colors">
                <SignIn size={13}/> تصفح كمستخدم
              </button>
              <button onClick={() => { setTab("subscription"); setChangingPlan(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors">
                <Crown size={13}/> ترقية الباقة
              </button>
              {mapStatus(activeSub?.status, U.verified_at) === "pending" && (
                <button onClick={handleVerify}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                  <ShieldCheck size={13}/> تحقق من الحساب
                </button>
              )}
              {mapStatus(activeSub?.status, U.verified_at) === "active" && (
                <button onClick={handleSuspend}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                  <Prohibit size={13}/> تعليق الحساب
                </button>
              )}
              {mapStatus(activeSub?.status, U.verified_at) === "suspended" && (
                <button onClick={handleReactivate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                  <CheckCircle size={13}/> تفعيل الحساب
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"رصيد الكريدت", val:`${(U.credit_balance ?? 0).toLocaleString("ar-SA")}`, icon:Money, c:"text-emerald-400" },
          { label:"المعاملات", val:(creditTxns.length).toLocaleString("ar-SA"), icon:Robot, c:"text-purple-400" },
          { label:"الاشتراكات", val:subHistory.length.toString(), icon:Ticket, c:"text-orange-400" },
          { label:"الباقة", val:planLabel, icon:Star, c:"text-[#C8A762]" },
        ].map((k,i)=>(
          <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
            className={`${card} p-4 flex items-center gap-3`}>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark?"bg-white/[0.04]":"bg-slate-50"} ${k.c}`}>
              <k.icon size={18} weight="duotone"/>
            </div>
            <div>
              <p className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
              <p className={`text-[18px] font-bold ${k.c}`}>{k.val}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className={`flex items-center gap-1 border-b ${isDark?"border-white/[0.06]":"border-slate-100"} pb-0.5`}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-t-xl transition-all ${
              tab===t.id
                ? isDark?"text-white border-b-2 border-[#C8A762]":"text-slate-800 border-b-2 border-[#0B3D2E]"
                : isDark?"text-zinc-600 hover:text-zinc-400":"text-slate-400 hover:text-slate-600"
            }`}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab==="activity" && (
        <motion.div key="act" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>سجل النشاط</p>
          {ACTIVITY.length === 0 ? (
            <p className={`text-[12px] text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا يوجد نشاط مسجل</p>
          ) : (
          <div className="space-y-0">
            {ACTIVITY.map((a,i)=>(
              <motion.div key={i} initial={{opacity:0,x:8}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}}
                className={`flex items-center gap-3 py-3 ${i<ACTIVITY.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  a.type==="ai"?"bg-purple-500/10 text-purple-400":
                  a.type==="pay"?"bg-emerald-500/10 text-emerald-400":
                  "bg-zinc-500/10 text-zinc-400"
                }`}>
                  {a.type==="ai"?<Robot size={14}/>:a.type==="pay"?<Money size={14}/>:
                   <Eye size={14}/>}
                </div>
                <p className={`flex-1 text-[12px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{a.action}</p>
                <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{a.time}</span>
              </motion.div>
            ))}
          </div>
          )}
        </motion.div>
      )}

      {tab==="subscription" && (
        <motion.div key="sub" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          {/* Subscription Details */}
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>تفاصيل الاشتراك</p>
            {activeSub ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-5">
                  {[
                    { label:"الباقة الحالية", val:`${activeSub.subscription_plans?.name_ar ?? activeSub.tier} — ${activeSub.subscription_plans?.price_monthly ?? 0} ر.س/${activeSub.billing_cycle === "yearly" ? "سنة" : "شهر"}` },
                    { label:"تاريخ التجديد", val: formatDate(activeSub.current_period_end) },
                    { label:"دورة الفوترة", val: activeSub.billing_cycle === "yearly" ? "سنوي" : "شهري" },
                  ].map((r,i)=>(
                    <div key={i}>
                      <p className={`text-[10px] mb-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</p>
                      <p className={`text-[13px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{r.val}</p>
                    </div>
                  ))}
                </div>

                {/* Action messages */}
                {planActionMsg && (
                  <div className={`mb-3 text-[11px] font-bold px-3 py-2 rounded-xl ${planActionMsg.type === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {planActionMsg.text}
                  </div>
                )}

                {/* Change Plan */}
                <div className="flex items-center gap-2 flex-wrap">
                  {!changingPlan ? (
                    <button onClick={() => { setChangingPlan(true); setPlanActionMsg(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors">
                      <Crown size={13}/> تغيير الباقة
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select value={selectedTier} onChange={e => setSelectedTier(e.target.value)}
                          className={`appearance-none pl-7 pr-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                            isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-700"
                          }`}>
                          <option value="">اختر الباقة</option>
                          {["free","ai","pro","corp","max"].filter(t => t !== activeSub.tier).map(t => (
                            <option key={t} value={t}>{TIER_MAP[t] ?? t}</option>
                          ))}
                        </select>
                        <CaretDown size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                      </div>
                      <button onClick={handleChangePlan} disabled={!selectedTier || planActionLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40">
                        {planActionLoading ? <SpinnerGap size={13} className="animate-spin"/> : <CheckCircle size={13}/>} تأكيد
                      </button>
                      <button onClick={() => { setChangingPlan(false); setSelectedTier(""); setPlanActionMsg(null); }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                        إلغاء
                      </button>
                    </div>
                  )}

                  {/* Grant Credits */}
                  {!showCredits ? (
                    <button onClick={() => { setShowCredits(true); setCreditMsg(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-colors">
                      <Plus size={13}/> منح رصيد
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}
                        placeholder="الكمية (+ أو -)" className={`w-28 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                          isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600" : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400"
                        }`} />
                      <input type="text" value={creditDesc} onChange={e => setCreditDesc(e.target.value)}
                        placeholder="السبب" className={`w-40 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                          isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600" : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400"
                        }`} />
                      <button onClick={handleGrantCredits} disabled={!creditAmount || !creditDesc.trim() || creditLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40">
                        {creditLoading ? <SpinnerGap size={13} className="animate-spin"/> : <CheckCircle size={13}/>} تأكيد
                      </button>
                      <button onClick={() => { setShowCredits(false); setCreditAmount(""); setCreditDesc(""); setCreditMsg(null); }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>

                {creditMsg && (
                  <div className={`mt-3 text-[11px] font-bold px-3 py-2 rounded-xl ${creditMsg.type === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {creditMsg.text}
                  </div>
                )}

                {/* Credit balance */}
                <div className={`mt-4 pt-3 border-t ${isDark ? "border-white/[0.04]" : "border-slate-50"} flex items-center gap-2`}>
                  <Money size={14} className="text-emerald-400"/>
                  <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>رصيد الكريدت الحالي:</span>
                  <span className="text-[13px] font-bold text-emerald-400">{(U.credit_balance ?? 0).toLocaleString("ar-SA")}</span>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  لا يوجد اشتراك نشط لهذا الحساب.
                </p>
                {planActionMsg && (
                  <div className={`mb-3 text-[11px] font-bold px-3 py-2 rounded-xl ${planActionMsg.type === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {planActionMsg.text}
                  </div>
                )}
                {!changingPlan ? (
                  <button onClick={() => { setChangingPlan(true); setPlanActionMsg(null); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                    <Plus size={13}/> تعيين باقة جديدة للمستخدم
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <div className="relative">
                      <select value={selectedTier} onChange={e => setSelectedTier(e.target.value)}
                        className={`appearance-none pl-7 pr-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                          isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}>
                        <option value="">اختر الباقة</option>
                        {["free","ai","pro","corp","max"].map(t => (
                          <option key={t} value={t}>{TIER_MAP[t] ?? t}</option>
                        ))}
                      </select>
                      <CaretDown size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                    </div>
                    <button onClick={handleCreateSubscription} disabled={!selectedTier || planActionLoading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40">
                      {planActionLoading ? <SpinnerGap size={13} className="animate-spin"/> : <CheckCircle size={13}/>} تأكيد
                    </button>
                    <button onClick={() => { setChangingPlan(false); setSelectedTier(""); setPlanActionMsg(null); }}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                      إلغاء
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>سجل الاشتراكات</p>
            {PAYMENTS.length === 0 ? (
              <p className={`text-[12px] text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا يوجد سجل اشتراكات</p>
            ) : (
              PAYMENTS.map((p,i)=>(
                <div key={i} className={`flex items-center justify-between py-2.5 ${i<PAYMENTS.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                  <span className={`text-[12px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{p.date}</span>
                  <span className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{p.tier}</span>
                  <span className={`text-[12px] font-bold ${isDark?"text-white":"text-slate-700"}`}>{p.amount} ر.س</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    p.status === "active" ? "text-emerald-400 bg-emerald-500/10" :
                    p.status === "cancelled" ? "text-red-400 bg-red-500/10" :
                    "text-zinc-400 bg-zinc-500/10"
                  }`}>
                    {p.status === "active" ? "نشط" : p.status === "cancelled" ? "ملغي" : p.status === "expired" ? "منتهي" : p.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {tab==="ai" && (
        <motion.div key="ai" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-5 ${isDark?"text-white":"text-slate-800"}`}>آخر معاملات الرصيد</p>
          {creditTxns.length === 0 ? (
            <p className={`text-[12px] text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد معاملات</p>
          ) : (
          <div className="space-y-4">
            {creditTxns.map((tx,i)=>(
              <div key={tx.id || i}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className={`text-[12px] font-semibold ${isDark?"text-zinc-300":"text-slate-600"}`}>
                    {tx.description || tx.kind}
                  </p>
                  <span className={`text-[11px] font-bold ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("ar-SA")} رصيد
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{timeAgo(tx.created_at)}</span>
                  <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>الرصيد بعد: {tx.balance_after?.toLocaleString("ar-SA") ?? "—"}</span>
                </div>
                {i < creditTxns.length - 1 && <div className={`mt-3 border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`}/>}
              </div>
            ))}
          </div>
          )}
        </motion.div>
      )}

      {tab==="tickets" && (
        <motion.div key="tix" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>تذاكر الدعم</p>
          {[
            { id:"#١٢٨", title:"مشكلة في تصدير PDF", status:"open", date:"منذ أسبوع" },
            { id:"#١٠٤", title:"طلب ترقية باقة", status:"closed", date:"منذ شهر" },
            { id:"#٨٩", title:"استفسار عن حاسبة الأتعاب", status:"closed", date:"منذ شهرين" },
          ].map((t,i)=>(
            <div key={i} className={`flex items-center gap-3 py-3 ${i<2?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
              <Ticket size={14} className={t.status==="open"?"text-orange-400":"text-zinc-500"}/>
              <p className={`flex-1 text-[12px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{t.title}</p>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                t.status==="open"?"bg-orange-500/10 border-orange-500/20 text-orange-400":"bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
              }`}>{t.status==="open"?"مفتوح":"مغلق"}</span>
              <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{t.date}</span>
            </div>
          ))}
        </motion.div>
      )}

      {tab==="security" && (
        <motion.div key="sec" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>معلومات الحساب</p>
            {[
              { label:"تاريخ التسجيل", val: formatDate(U.created_at) },
              { label:"آخر تسجيل دخول", val: U.last_sign_in_at ? timeAgo(U.last_sign_in_at) : "—" },
              { label:"البريد الإلكتروني", val: U.email },
              { label:"رقم الهاتف", val: U.phone || "غير مسجل" },
              { label:"المدينة", val: U.city || "غير محدد" },
            ].map((r,i)=>(
              <div key={i} className={`flex items-center justify-between py-2.5 ${i<4?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <span className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</span>
                <span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{r.val}</span>
              </div>
            ))}
          </div>
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>معلومات الأمان</p>

            {/* ── Account type — read-out plus the control that corrects it ──── */}
            <div className={`flex items-center justify-between py-2.5 border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`}>
              <span className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>نوع الحساب</span>
              <div className="flex items-center gap-1.5">
                <CheckCircle size={12} weight="fill" className="text-emerald-400"/>
                <span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{roleLabel(U.user_type)}</span>
              </div>
            </div>

            {/* Outcome of the last attempt — success and failure both say what
                happened, and a success repeats the manual steps in full, since
                the confirmation panel that carried them has been torn down. */}
            {typeMsg && (
              <div className={`mt-3 text-[11px] px-3 py-2 rounded-xl leading-6 space-y-2 ${typeMsg.type === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                <p className="font-bold">{typeMsg.text}</p>
                {typeMsg.notes && <SectorNotes notes={typeMsg.notes} tone="text-current" />}
              </div>
            )}

            {U.user_type === "admin" ? (
              /* No control is offered for the admin account — in either
                 direction. Rendering a disabled button would leave a control on
                 screen whose action cannot succeed, so the reason is stated
                 instead. */
              <p className={`mt-3 text-[11px] leading-6 ${isDark?"text-zinc-500":"text-slate-400"}`}>
                نوع حساب المسؤول لا يُغيَّر من هذه الصفحة، لا إليه ولا منه. التغيير يتم من قاعدة البيانات مباشرة.
              </p>
            ) : (
              <div className="mt-3">
                {!changingType ? (
                  <button onClick={() => { setChangingType(true); setTypeMsg(null); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors">
                    <UserSwitch size={13}/> تغيير نوع الحساب
                  </button>
                ) : !typeConfirming ? (
                  /* Step 1 — pick the new type. */
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
                        className={`appearance-none pl-7 pr-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                          isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}>
                        <option value="">اختر النوع الجديد</option>
                        {/* `admin` is filtered by `isAssignableUserType`, not by
                            hand; the current type is filtered so the control is
                            never offered as a no-op. The submit handler repeats
                            both checks — this list is convenience, not the guard. */}
                        {DB_USER_TYPES
                          .filter(t => isAssignableUserType(t) && t !== U.user_type)
                          .map(t => <option key={t} value={t}>{ROLE_MAP[t]}</option>)}
                      </select>
                      <CaretDown size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                    </div>
                    <button onClick={() => setTypeConfirming(true)} disabled={!selectedType}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40">
                      متابعة
                    </button>
                    <button onClick={() => { resetTypeChange(); setTypeMsg(null); }}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                      إلغاء
                    </button>
                  </div>
                ) : (
                  /* Step 2 — confirm. Names both types and every manual step
                     this change does NOT perform, in both directions. */
                  <div className={`rounded-xl border p-3 space-y-2.5 ${isDark ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-amber-300/50 bg-amber-50"}`}>
                    <p className={`flex items-center gap-1.5 text-[11px] font-bold ${isDark?"text-amber-400":"text-amber-700"}`}>
                      <Warning size={13} weight="fill"/> تأكيد تغيير نوع الحساب
                    </p>
                    <p className={`text-[11px] leading-6 ${isDark?"text-zinc-300":"text-slate-600"}`}>
                      سيتغيّر نوع الحساب من «{roleLabel(U.user_type)}» إلى «{roleLabel(selectedType)}». هذا تغيير في الصلاحيات: يتغيّر معه مسار لوحة التحكم وما يستطيع صاحب الحساب الوصول إليه.
                    </p>
                    {/* The manual steps, stated BEFORE the write. Both halves:
                        the row the new type will lack, and the row the old type
                        leaves behind. */}
                    <SectorNotes
                      notes={sectorRowNotes(U.user_type, selectedType)}
                      tone={isDark ? "text-amber-300/90" : "text-amber-800"}
                    />
                    <p className={`text-[11px] leading-6 ${isDark?"text-zinc-400":"text-slate-500"}`}>
                      لا يقوم هذا الإجراء بأي من الخطوات أعلاه؛ هي عليك بعد التأكيد.
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <button onClick={handleChangeUserType} disabled={typeLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40">
                        {typeLoading ? <SpinnerGap size={13} className="animate-spin"/> : <CheckCircle size={13}/>} تأكيد التغيير
                      </button>
                      <button onClick={() => setTypeConfirming(false)} disabled={typeLoading}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-40 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                        رجوع
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── The remaining security rows ────────────────────────────────── */}
            <div className={`mt-3 border-t ${isDark?"border-white/[0.04]":"border-slate-50"}`}>
              {[
                { label:"حالة الحساب", val: statusInfo.label, ok: U.status === "active" },
                { label:"معرف المستخدم", val: U.id, ok:true },
              ].map((r,i)=>(
                <div key={i} className={`flex items-center justify-between py-2.5 ${i<1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                  <span className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</span>
                  <div className="flex items-center gap-1.5">
                    {r.ok?<CheckCircle size={12} weight="fill" className="text-emerald-400"/>:<Warning size={12} weight="fill" className="text-amber-400"/>}
                    <span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{r.val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
