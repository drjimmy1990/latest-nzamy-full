# Owner Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every defect the owner found in his 16–19 August field test of the manual-fulfillment services, in the order that unblocks real use fastest.

**Architecture:** Nothing structural changes. The order pipeline (`service_requests` with `receiver='ai_workspace'`, the admin queue, entitlement-checked downloads, n8n dispatch) is built and works. This plan hardens the file-upload path, rebuilds the one client-facing screen that was never finished, and makes the admin queue usable for the person who actually runs it.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase, Tailwind, Framer Motion, Phosphor icons. Tests: `node --test` (Node 24 native TS), zero new dependencies.

**Predecessor:** `docs/superpowers/plans/2026-08-15-review-gate-and-three-services.md` (complete, merged at `bf8dc32`).

**Source of requirements:** `last_owner/last test/` — the owner's five-track plan (17 Aug), his technical report (16 Aug), and his test log (19 Aug). Every claim in those files was checked against the code before this plan was written. All were true.

## Global Constraints

- **No new npm dependencies.**
- **Next.js 16 uses `src/proxy.ts`, NOT `middleware.ts`.** Having both breaks `next build`. Route handlers receive `params` as a **Promise**.
- All user-facing copy is Arabic, RTL — including every API error message.
- `npm run test:unit` baseline is **73 pass / 0 fail, pristine output**. Never regress it.
- **One order-creation transport:** `createServiceOrder` → `apiMutate` → `POST /api/v1/service-requests`. A direct Supabase insert from the browser bypasses `CREATE_STATUS_ALLOWLIST` and the intake-attachment binding.
- **`documentId` traces to `attachments.id`, a Postgres `bigserial` that PostgREST serialises as a JSON _number_.** Coerce with `String(v)`. Never guard with `typeof v === 'string'`.
- **Never weaken these:** `attachment.request_id === order.id` gates every download; every refusal branch of a download route returns one byte-identical 404; admin routes use `createServiceClient()` behind `requireAdmin()`; `ai_workspace` orders stay out of the lawyer marketplace RLS clause.
- Side channels (`recordEvent`, `recordNotification`, `dispatchToN8n`) are best-effort and never break the primary write.
- **No copy may describe work the system does not do.** Every task in the predecessor plan that was sent back was sent back for this, and always in pre-existing strings the diff had not touched.
- **No control may remain on screen whose value cannot reach the payload.**

## Already done before this plan

- **The upload blocker is fixed** (`b334407`). `documentService.ts` built the storage key with a sanitiser that deliberately preserved the Arabic Unicode block and whitespace. Supabase carries that key in an HTTP header, which is ASCII-only, so every Arabic-named file was rejected. The key is now ASCII; `attachments.file_name` still stores the original name verbatim.
- **Storage was never full.** `scripts/storage-report.mjs` (read-only, same commit) measured **83.2 MB of a 1 GB quota** — `blog-covers` 614 objects / 83.1 MB, `documents` **1 object / 47 KB**. Nothing needs deleting. That one `documents` object, `appeal_brief.docx` (pure ASCII, 2026-08-17), is also proof the bucket's RLS policies are already applied, so `supabase/storage_policies_documents.sql` does **not** need running.

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `src/lib/services/fileValidation.ts` | Pure size/extension check, shared by every upload |
| `src/lib/services/fileValidation.test.ts` | Unit tests for the above |
| `src/lib/services/orderPrompt.ts` | Turn an order into a Markdown prompt for the admin |
| `src/lib/services/orderPrompt.test.ts` | Unit tests for the above |
| `src/app/ai/orders/[id]/_components/OrderTimeline.tsx` | Status stepper |
| `src/app/ai/orders/[id]/_components/OrderSummary.tsx` | What the client sent, rendered readably |
| `src/app/ai/orders/[id]/_components/OrderActions.tsx` | Cancel, back, contact |

**Modify:**

| Path | Change |
|---|---|
| `src/hooks/useOrderAttachments.ts` | Validate before upload |
| `src/components/contracts/steps/review/StepRUpload.tsx` | Drop its local duplicate of that check |
| `src/app/ai/orders/[id]/page.tsx` | Rebuild — currently 155 lines ending in one sentence |
| `src/app/dashboard/admin/service-orders/page.tsx` | Explicit deliver, keep-open on claim, two note fields, prompt export, badges |
| `src/app/api/v1/admin/service-orders/[id]/route.ts` | Accept `internalNotes` |
| `src/app/api/v1/service-requests/[id]/route.ts` | Strip `internalNotes` from the client's response |
| `src/constants/navigation.sidebars.legal.ts` | Add طلباتي الذكية to lawyer and firm |
| `src/constants/navigation.sidebars.ts` | Add طلباتي الذكية to client and business |
| `src/proxy.ts` | Protect the three remaining `/ai` service routes |
| `src/app/ai/wargaming/page.tsx` | File upload for نقض المذكرة |
| `src/app/ai/legal-opinion/_components/LetterWorkflow.tsx` | Real file upload |
| `src/hooks/useContractsState.ts` | Require party names |

---

## Task 1: One file-size and file-type check, for every service

The 20 MB / PDF / Word rule exists in exactly one place today — `StepRUpload.tsx:24-33`, contracts review mode. الصائغ, المحاكي and الرأي الفصل accept anything: a 200 MB video reaches Supabase before anyone objects. The check belongs in the hook that every service already calls.

**Files:**
- Create: `src/lib/services/fileValidation.ts`, `src/lib/services/fileValidation.test.ts`
- Modify: `src/hooks/useOrderAttachments.ts`, `src/components/contracts/steps/review/StepRUpload.tsx`

**Interfaces:**
- Produces: `validateUploadFile(file: { name: string; size: number }): string | null` — an Arabic error, or `null` when acceptable.
- Produces: `MAX_UPLOAD_BYTES`, `ALLOWED_UPLOAD_EXTENSIONS`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/services/fileValidation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUploadFile, MAX_UPLOAD_BYTES } from "./fileValidation.ts";

test("accepts a normal pdf with an Arabic name", () => {
  assert.equal(validateUploadFile({ name: "عقد.pdf", size: 1024 }), null);
});

test("accepts doc, docx, png, jpg, jpeg", () => {
  for (const n of ["a.doc", "a.docx", "a.png", "a.jpg", "a.jpeg"]) {
    assert.equal(validateUploadFile({ name: n, size: 10 }), null, n);
  }
});

test("rejects an unsupported extension and says so", () => {
  const msg = validateUploadFile({ name: "clip.mp4", size: 10 });
  assert.ok(msg && msg.includes("صيغة"));
});

test("rejects a file with no extension at all", () => {
  assert.ok(validateUploadFile({ name: "README", size: 10 }));
});

test("rejects a file over the ceiling", () => {
  const msg = validateUploadFile({ name: "big.pdf", size: MAX_UPLOAD_BYTES + 1 });
  assert.ok(msg && msg.includes("الحجم"));
});

test("accepts a file exactly at the ceiling", () => {
  assert.equal(validateUploadFile({ name: "edge.pdf", size: MAX_UPLOAD_BYTES }), null);
});

test("rejects an empty file — a zero-byte upload is always a mistake", () => {
  assert.ok(validateUploadFile({ name: "empty.pdf", size: 0 }));
});

test("extension matching is case-insensitive", () => {
  assert.equal(validateUploadFile({ name: "SCAN.PDF", size: 10 }), null);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './fileValidation.ts'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/services/fileValidation.ts
/**
 * One place that decides whether a file may be uploaded. Every service goes
 * through useOrderAttachments, so putting the rule here is what makes it true
 * everywhere instead of only in contracts review mode.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf", "doc", "docx", "png", "jpg", "jpeg",
] as const;

export function validateUploadFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!ext || !(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    return "صيغة الملف غير مدعومة — المسموح: PDF أو Word أو صورة.";
  }
  if (file.size <= 0) {
    return "الملف فارغ — اختر ملفاً يحتوي على محتوى.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "حجم الملف يتجاوز الحد الأقصى (٢٠ ميجابايت).";
  }
  return null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run test:unit`
Expected: PASS — 73 previous plus 8 new = 81.

- [ ] **Step 5: Enforce it in the hook**

In `src/hooks/useOrderAttachments.ts`, reject before touching the network — at the very top of `attachFile`, ahead of `setUploading(true)`:

```ts
import { validateUploadFile } from "@/lib/services/fileValidation";

  async function attachFile(file: File): Promise<OrderAttachment> {
    setAttachError("");
    // Refuse locally before spending a round trip, and before any caller's
    // optimistic filename has to be reverted.
    const rejection = validateUploadFile(file);
    if (rejection) {
      setAttachError(rejection);
      throw new Error("file_rejected");
    }
    setUploading(true);
    // ... unchanged from here
```

`attachErrorMessageAr` must not overwrite the specific reason with its generic fallback. Add the token to its known list:

```ts
  if (raw === "file_rejected") {
    // attachFile already set the precise Arabic reason before throwing;
    // returning "" leaves that message in place instead of replacing it.
    return "";
  }
```

**Read the callers before relying on that.** `attachFile` throws, and callers catch and revert their optimistic filename. Confirm none of them writes `attachError` itself in the catch, and say what you found.

- [ ] **Step 6: Remove the duplicate**

`StepRUpload.tsx:24-33` declares `MAX_FILE_SIZE` and its own extension regex. Delete both and let the hook's rejection surface through `attachError`, which the component already renders. Confirm it does render `attachError` — read it, do not assume.

- [ ] **Step 7: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report what a client sees, in each of the four services, when they pick a 50 MB file and when they pick a `.mp4`.

- [ ] **Step 8: Commit**

```bash
git commit -m "fix(upload): one size and type check, enforced for every service"
```

---

## Task 2: Admin — an explicit deliver button, and stop closing the panel on استلام

Two defects in one file, both about the same moment in the admin's day.

**Deliver fires on file selection.** `page.tsx:232-242` — the file input's `onChange` calls `deliver(o, f)` directly. There is no confirmation and no deliver button anywhere. Picking the wrong file in the browser dialog delivers it to the client, fires the WhatsApp notification, and cannot be undone.

**The panel closes on claim.** `act()` at `:71` runs `setOpen(null)` on every successful action, including `claim`. Pressing استلام therefore closes the panel that holds the upload field, and the admin must press التفاصيل again on the same row.

**Files:**
- Modify: `src/app/dashboard/admin/service-orders/page.tsx`

- [ ] **Step 1: Keep the panel open when claiming**

Claiming does not finish work on an order — it starts it. Give `act()` a flag:

```ts
  async function act(id: string, payload: Record<string, unknown>, opts: { keepOpen?: boolean } = {}) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/v1/admin/service-orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "فشل الإجراء");
      else {
        // Claim starts work on an order; deliver and cancel finish it. Only the
        // finishing actions should collapse the panel — closing it on claim
        // hides the upload field the admin pressed استلام to reach.
        if (!opts.keepOpen) { setOpen(null); setNotes(""); }
        await load();
      }
    } catch {
      setErr("تعذّر تنفيذ الإجراء. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }
```

Both claim call sites (`:208` and `:224`) pass `{ keepOpen: true }`.

**Watch the reload.** `load()` replaces `orders` with fresh objects, while `open` holds an object rather than an id. The panel is rendered by `open?.id === o.id`, so it stays open — but anything read off `open` directly is now stale. Read the component and confirm whether `open` is used for anything beyond that identity comparison. If it is, key the panel on an id instead, and say so.

- [ ] **Step 2: Hold the chosen file instead of delivering it**

Add state beside `notes`:

```ts
  const [pendingFile, setPendingFile] = useState<File | null>(null);
```

Reset it wherever `notes` is reset — in `toggleOpen` and in `act`'s success branch — for exactly the reason the existing comment at `:113-118` gives about `notes`: this is page-level state shared by every card, so a file staged on order A must never survive into order B.

The input stops delivering and starts staging:

```tsx
<input type="file" disabled={busy}
  onChange={(e) => {
    const f = e.target.files?.[0] ?? null;
    // Reset so re-picking the same file after an error still fires onChange.
    e.target.value = "";
    setPendingFile(f);
  }}
  className={`block text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`} />

{pendingFile && (
  <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
    الملف المختار: <span className="font-semibold">{pendingFile.name}</span>
    {" "}({Math.max(1, Math.round(pendingFile.size / 1024))} كيلوبايت)
  </p>
)}

<button
  disabled={busy || !pendingFile}
  onClick={() => { if (pendingFile) deliver(o, pendingFile); }}
  className="w-full rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-40">
  اعتماد وتسليم المستند للعميل
</button>
```

Nothing is delivered until that button is pressed.

- [ ] **Step 3: Apply the same validation the client gets**

Import `validateUploadFile` from Task 1 and reject at staging time, so an admin cannot deliver a 200 MB file either:

```ts
    const rejection = f ? validateUploadFile(f) : null;
    if (rejection) { setErr(rejection); setPendingFile(null); return; }
```

- [ ] **Step 4: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report, step by step, what now happens between pressing استلام and the client receiving the file — and confirm no path delivers without the button.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(admin): deliver on an explicit button, and keep the panel open on claim"
```

---

## Task 3: Admin — a note for the client and a note for the team, kept apart

One `notes` textarea currently serves as both the delivery note to the client and the cancellation reason. The owner wants a private field the client never sees.

**Files:**
- Modify: `src/app/dashboard/admin/service-orders/page.tsx`, `src/app/api/v1/admin/service-orders/[id]/route.ts`, `src/app/api/v1/service-requests/[id]/route.ts`

**Interfaces:**
- Produces: `metadata.internalNotes: string` — written by admins, never returned to a non-admin caller.

- [ ] **Step 1: Read the admin route before changing it**

Open `src/app/api/v1/admin/service-orders/[id]/route.ts`, find where the `deliver` action merges into `metadata`, and note the exact shape. Your change adds one key alongside `deliverable`; it must not clobber `intake` or `attachments`.

- [ ] **Step 2: Accept `internalNotes` on the admin route**

Add it to the `deliver` and `cancel` branches, stored as a plain string under `metadata.internalNotes`, defaulting to `""` when absent. The route sits behind `requireAdmin()`, so no extra authorization is needed — **confirm that by reading the guard rather than assuming it.**

- [ ] **Step 3: Two fields in the UI**

Rename the existing textarea's placeholder so its audience is unmistakable, and add the private one beneath it:

```tsx
<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
  placeholder="ملاحظات تظهر للعميل مع المستند (اختياري)" className={...} />

<textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2}
  placeholder="ملاحظة داخلية للفريق — لا يراها العميل (اختياري)" className={...} />
```

Reset `internalNotes` everywhere `notes` is reset, for the same shared-state reason.

- [ ] **Step 4: Prove the client cannot read it**

The client loads its order through `GET /api/v1/service-requests/[id]`, which returns `metadata`. **Adding the key is therefore not enough on its own.** Read that route, and if it returns metadata wholesale, strip `internalNotes` for non-admin callers. Say exactly where you stripped it.

This step is the point of the task. A "private" note the client can read in the network tab is worse than no note at all.

- [ ] **Step 5: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

Paste in your report the exact JSON a client receives for an order that carries an internal note.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(admin): private team notes, kept out of the client's response"
```

---

## Task 4: Admin — a readable brief instead of raw JSON, and a one-click AI prompt

`page.tsx:171-174` renders `JSON.stringify(o.metadata?.intake, null, 2)` in a `<pre>`. For a legal-opinion order that is a nested object with seven possible shapes. The admin has to read JSON to find out what the client asked for.

**Files:**
- Create: `src/lib/services/orderPrompt.ts`, `src/lib/services/orderPrompt.test.ts`
- Modify: `src/app/dashboard/admin/service-orders/page.tsx`

**Interfaces:**
- Produces: `buildOrderPrompt(order: { title: string; description: string; metadata: Record<string, unknown> }): string` — a Markdown document.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/services/orderPrompt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderPrompt } from "./orderPrompt.ts";

const base = {
  title: "مذكرة دعوى — عمالي",
  description: "نزاع على مستحقات نهاية الخدمة",
  metadata: {
    serviceTitleAr: "الصائغ القانوني",
    intake: { service: "draft", clientRole: "plaintiff", caseText: "و".repeat(40) },
    attachments: [{ documentId: 7, name: "عقد.pdf", size: 2048 }],
  },
};

test("starts with the service and the title", () => {
  const md = buildOrderPrompt(base);
  assert.ok(md.includes("الصائغ القانوني"));
  assert.ok(md.includes("مذكرة دعوى — عمالي"));
});

test("renders intake fields as readable lines, not JSON braces", () => {
  const md = buildOrderPrompt(base);
  assert.ok(md.includes("caseText") || md.includes("و".repeat(10)));
  assert.ok(!md.includes('{"service"'));
});

test("lists attachments by name", () => {
  assert.ok(buildOrderPrompt(base).includes("عقد.pdf"));
});

test("a numeric documentId does not break rendering", () => {
  // attachments.id is a Postgres bigserial and arrives as a JSON number.
  assert.ok(buildOrderPrompt(base).includes("عقد.pdf"));
});

test("survives an order with no intake at all", () => {
  const md = buildOrderPrompt({ title: "t", description: "d", metadata: {} });
  assert.equal(typeof md, "string");
  assert.ok(md.length > 0);
});

test("never emits the internal team note", () => {
  const md = buildOrderPrompt({
    ...base,
    metadata: { ...base.metadata, internalNotes: "لا ترسل هذا" },
  });
  assert.ok(!md.includes("لا ترسل هذا"));
});

test("nested intake objects are flattened, not stringified", () => {
  const md = buildOrderPrompt({
    ...base,
    metadata: { ...base.metadata, intake: { service: "contracts", parties: { one: { fullName: "محمد" } } } },
  });
  assert.ok(md.includes("محمد"));
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Walk the intake object recursively, emitting `- key: value` lines and indenting nested objects. Arrays of primitives join with `، `. Skip `internalNotes` and skip `deliverable`. Keep it under 60 lines; this is a formatter, not a template engine.

```ts
// src/lib/services/orderPrompt.ts
/**
 * Turn one order into a Markdown brief the admin can read — or paste into an
 * AI assistant — instead of reading raw JSON off the screen.
 *
 * Never includes metadata.internalNotes: that field exists precisely because
 * some notes are not for anyone outside the team, and pasting this document
 * into a third-party assistant is one of its intended uses.
 */
function renderValue(v: unknown, depth: number): string[] {
  const pad = "  ".repeat(depth);
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) {
    if (v.length === 0) return [];
    if (v.every((x) => typeof x !== "object")) return [`${pad}${v.join("، ")}`];
    return v.flatMap((x) => renderValue(x, depth));
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, val]) => {
      const rendered = renderValue(val, depth + 1);
      if (rendered.length === 0) return [];
      if (rendered.length === 1 && !rendered[0].includes("\n")) {
        return [`${pad}- **${k}:** ${rendered[0].trim()}`];
      }
      return [`${pad}- **${k}:**`, ...rendered];
    });
  }
  return [`${pad}${String(v)}`];
}

export function buildOrderPrompt(order: {
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}): string {
  const md = order.metadata ?? {};
  const intake = (md.intake as Record<string, unknown> | undefined) ?? {};
  const attachments = Array.isArray(md.attachments) ? md.attachments : [];

  const lines: string[] = [
    `# ${md.serviceTitleAr ?? "طلب خدمة"} — ${order.title}`,
    "",
    "## وصف الطلب",
    order.description || "—",
    "",
    "## بيانات العميل المُدخلة",
    ...renderValue(intake, 0),
  ];

  if (attachments.length > 0) {
    lines.push("", "## المرفقات");
    for (const a of attachments as Array<{ name?: string; size?: number }>) {
      const kb = a.size ? ` (${Math.max(1, Math.round(a.size / 1024))} كيلوبايت)` : "";
      lines.push(`- ${a.name ?? "مرفق"}${kb}`);
    }
  }

  lines.push(
    "",
    "---",
    "*هذه البيانات كما أدخلها العميل. الصياغة النهائية مسؤولية الفريق.*",
  );
  return lines.join("\n");
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run test:unit`
Expected: PASS — 81 previous plus 7 new = 88.

- [ ] **Step 5: Replace the JSON block in the UI**

Render `buildOrderPrompt(o)` inside the existing `<pre>` instead of `JSON.stringify`, and add two buttons above it:

```tsx
<div className="flex gap-2">
  <button onClick={() => navigator.clipboard.writeText(buildOrderPrompt(o))}
    className="rounded-xl border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-500">
    نسخ ملخص الطلب
  </button>
  <button onClick={() => downloadPrompt(o)}
    className={`rounded-xl border px-3 py-1.5 text-[11px] font-bold ${
      isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
    تنزيل ملف .md
  </button>
</div>
```

`downloadPrompt` builds a Blob and clicks an object URL:

```ts
  function downloadPrompt(o: AdminOrder) {
    const blob = new Blob([buildOrderPrompt(o)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-${o.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
```

`navigator.clipboard` is unavailable on insecure origins. Wrap the copy in a `try/catch` and set `err` to an Arabic message on failure rather than letting the button look dead.

- [ ] **Step 6: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

Paste in your report the rendered Markdown for one order of each of the four service types.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(admin): readable order brief and a copyable prompt instead of raw JSON"
```

---

## Task 5: Admin — show who the client is and which service they ordered

The API **already returns what is needed.** `src/app/api/v1/admin/service-orders/route.ts:41` selects `id, display_name, email, phone, user_type`. The page's `AdminOrder` interface (`:10-14`) simply omits `user_type`, so it is fetched and thrown away.

**Files:**
- Modify: `src/app/dashboard/admin/service-orders/page.tsx`

- [ ] **Step 1: Widen the type**

```ts
  profile: { display_name?: string; email?: string; phone?: string; user_type?: string } | null;
```

- [ ] **Step 2: Add the two badges**

Account type, from `profile.user_type`, and service, from `metadata.service`. Map to Arabic labels and colours:

```tsx
const ACCOUNT_BADGE: Record<string, { label: string; cls: string }> = {
  lawyer:     { label: "محامٍ",        cls: "bg-emerald-500/10 text-emerald-500" },
  firm:       { label: "مكتب محاماة",  cls: "bg-emerald-500/10 text-emerald-500" },
  individual: { label: "عميل فرد",     cls: "bg-sky-500/10 text-sky-500" },
  corporate:  { label: "منشأة تجارية", cls: "bg-amber-500/10 text-amber-600" },
  micro:      { label: "منشأة صغيرة",  cls: "bg-amber-500/10 text-amber-600" },
  government: { label: "جهة حكومية",   cls: "bg-violet-500/10 text-violet-500" },
  ngo:        { label: "جهة غير ربحية", cls: "bg-violet-500/10 text-violet-500" },
};

const SERVICE_BADGE: Record<string, string> = {
  draft: "الصائغ", contracts: "العقود", wargaming: "المحاكاة", legal_opinion: "الرأي الفصل",
};
```

Render both beside the client's name at `:158-161`. An unknown `user_type` renders no badge rather than an empty grey pill — check that before shipping.

- [ ] **Step 3: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State which `user_type` values exist in `profiles`' CHECK constraint (`supabase/migrations/20260603_phase1_001_profiles.sql:32`) and confirm your map covers every one, or say which you deliberately left unmapped.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): account-type and service badges on the order queue"
```

---

## Task 6: Rebuild the client's order page

`src/app/ai/orders/[id]/page.tsx` is 155 lines and, for any order that is not yet delivered, its entire content is one sentence: *طلبك قيد التنفيذ لدى فريق نظامي*. No order number, no record of what the client sent, no attachment list, no way back. This is the screen a client lands on immediately after paying attention to a long form, and it tells them nothing.

The delivered and cancelled branches already work and are well-commented. **Keep them.** This task adds everything that is missing around them.

**Files:**
- Create: `src/app/ai/orders/[id]/_components/OrderTimeline.tsx`, `OrderSummary.tsx`
- Modify: `src/app/ai/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `ServiceOrder`, `ORDER_STATUS_AR` from `src/lib/services/serviceOrders.ts`
- Consumes: `buildOrderPrompt` is **not** used here — the client sees a formatted summary, not a prompt.
- Produces: `<OrderTimeline status={order.status} />`, `<OrderSummary order={order} />`

- [ ] **Step 1: The header — a reference the client can quote**

Above the existing title, show the order id with a copy button. The id is already the primary key; do not invent a second numbering scheme.

```tsx
<div className="flex items-center gap-2">
  <span className={`text-[11px] font-mono ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>#{order.id}</span>
  <button onClick={copyId} className="text-[11px] font-semibold text-[#0B3D2E]">
    {idCopied ? "تم النسخ ✓" : "نسخ رقم الطلب"}
  </button>
</div>
```

Wrap `navigator.clipboard.writeText` in `try/catch` — it throws on insecure origins.

- [ ] **Step 2: The timeline**

Four states, derived from `order.status`. `pending_assignment` → sent; `assigned` and `in_review` → in progress; `completed` → ready; `cancelled` renders the existing cancelled panel instead of a timeline.

```tsx
// _components/OrderTimeline.tsx
const STAGES = [
  { key: "sent",     label: "تم الإرسال" },
  { key: "working",  label: "قيد التدقيق والصياغة" },
  { key: "ready",    label: "جاهز للتحميل" },
] as const;

export function OrderTimeline({ status, isDark }: { status: string; isDark: boolean }) {
  const reached =
    status === "completed" ? 3 :
    status === "assigned" || status === "in_review" ? 2 : 1;
  return (
    <div className="flex items-center gap-2" dir="rtl">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold ${
            i < reached ? "bg-[#0B3D2E] text-white"
                        : isDark ? "bg-white/5 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>
            {i < reached ? "✓" : i + 1}
          </div>
          <span className={`text-[11px] ${i < reached
            ? isDark ? "text-zinc-200" : "text-zinc-800"
            : isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</span>
          {i < STAGES.length - 1 && <div className={`h-px w-6 ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />}
        </div>
      ))}
    </div>
  );
}
```

**Add the delivery-time card — the owner ruled on this explicitly.** It was raised with him that nothing in the system enforces the window, and that the predecessor plan removed exactly this claim from `BetaReviewGate` for that reason. He reaffirmed it. So it ships, worded as an expectation rather than a guarantee:

```tsx
<p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
  متوسط وقت التسليم المتوقع: خلال ٤ – ٢٤ ساعة
</p>
```

Two rules on it, both load-bearing:
- Show it **only** while the order is still open — `pending_assignment`, `assigned`, `in_review`. On a delivered or cancelled order it is noise at best and a contradiction at worst.
- Say **متوسط** (average/expected), never a promise verb. The Arabic must not read as a commitment the platform cannot keep.

- [ ] **Step 3: The summary — what the client actually sent**

`metadata.intake` differs per service, so render it generically rather than writing four bespoke layouts: iterate the object, skip empty values, and give each key an Arabic label from a lookup with a sensible fallback to the raw key. Reuse the shape of `renderValue` from Task 4 if it fits, but **do not import `buildOrderPrompt`** — that output is written for an admin, not a client.

Include the attachment list, with each file's name and size. These are the client's own files, so a download link is legitimate — the route `GET /api/v1/service-requests/[id]/attachments/[attachmentId]` already authorises the requester. Confirm that by reading the route before wiring the link.

- [ ] **Step 4: The actions**

Back to `/ai/orders`, always. Contact support, always — reuse whatever WhatsApp number the codebase already uses; do not invent one, and if there is only a placeholder, say so rather than shipping a dead link.

- [ ] **Step 5: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State in your report what the page renders for each of the five statuses, and confirm the delivered and cancelled branches behave exactly as before.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(orders): a real order page — reference, timeline, what you sent, your files"
```

---

## Task 7: Let the client cancel a pending order

The server already permits this. `src/app/api/v1/service-requests/[id]/route.ts:208` reads `permitted = isRequester && targetStatus === "cancelled"` for `receiver === 'ai_workspace'`. **Only the button is missing.**

**Files:**
- Create: `src/app/ai/orders/[id]/_components/OrderActions.tsx`
- Modify: `src/app/ai/orders/[id]/page.tsx`

- [ ] **Step 1: Read the route and confirm the exact contract**

Before writing the call, read `src/app/api/v1/service-requests/[id]/route.ts` around `:183-210` and record: the HTTP method, the exact body key the handler reads for the new status, and which statuses it will accept a transition *from*. Put those findings in your report. The client must not be offered a cancel button for an order the server will refuse to cancel.

- [ ] **Step 2: Show the button only when it will work**

Render it only for the statuses your Step 1 reading proved are cancellable — at minimum `pending_assignment`. If the server also permits cancelling an `assigned`/`in_review` order, say so and include it; if it does not, hide the button once work has started, and tell the client why in one line.

- [ ] **Step 3: Confirm before sending**

An accidental cancel loses the client's work. Use a two-press confirm in the component rather than `window.confirm`, which is unstyled and untranslatable:

```tsx
{confirming ? (
  <div className="flex gap-2">
    <button onClick={doCancel} disabled={busy}
      className="rounded-xl bg-red-600 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
      تأكيد الإلغاء
    </button>
    <button onClick={() => setConfirming(false)}
      className={`rounded-xl border px-4 py-2 text-[12px] font-bold ${
        isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
      تراجع
    </button>
  </div>
) : (
  <button onClick={() => setConfirming(true)}
    className="rounded-xl border border-red-500/30 px-4 py-2 text-[12px] font-bold text-red-500">
    إلغاء الطلب
  </button>
)}
```

On success, reload the order rather than assuming the new state — the page already has a `load()` function.

- [ ] **Step 4: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State what the client sees on success and on a server refusal, and confirm the refusal message is Arabic.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(orders): let a client cancel an order the server already allowed them to cancel"
```

---

## Task 8: Put طلباتي الذكية in the sidebar

There is no link to `/ai/orders` anywhere in the navigation. A client who closes the tab after submitting has no route back to their own orders.

**Files:**
- Modify: `src/constants/navigation.sidebars.legal.ts`, `src/constants/navigation.sidebars.ts`

- [ ] **Step 1: Find every sidebar that lists the AI services**

`LAWYER_SIDEBAR`, `LAWYER_SIDEBAR_LITE` and `FIRM_SIDEBAR` are in `navigation.sidebars.legal.ts`; the client, business, government, ngo and micro sidebars are in `navigation.sidebars.ts`. **Enumerate them yourself** and report the list — do not trust this sentence, it was written from a partial grep.

- [ ] **Step 2: Add the entry to every sidebar that offers at least one of the four services**

Match the existing entry shape exactly:

```ts
{ label: "طلباتي الذكية", labelEn: "My AI Orders", href: "/ai/orders", icon: "Tray", divider: true },
```

Place it directly after the last of the four service entries in each group, so it reads as their destination. Use an icon that already appears in the file's icon map — check the map before choosing, and say which icon you used and why it was safe.

A sidebar that lists none of the four services does not get the link. Say which ones you skipped.

- [ ] **Step 3: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

List every sidebar you touched and every one you deliberately did not.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(nav): a way back to your own AI orders"
```

---

## Task 9: Protect the three remaining service routes

`/ai/legal-opinion` was added to `src/proxy.ts`'s PROTECTED list in `6cf395b`. The other three were deliberately left out of that task's scope, pending the owner's decision. **He has now asked for it** — his technical report's pending-decision 3 recommends exactly this.

Today a visitor with no account can walk `/ai/draft`, `/ai/contracts` or `/ai/wargaming` end to end and is only refused at the final submit, after filling in everything.

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Add the three entries**

```ts
const PROTECTED = [
  "/dashboard",
  "/ai/settings",
  "/ai/vault",
  "/ai/secretary",
  "/ai/fee-calculator",
  "/ai/report-generator",
  "/ai/tracker",
  "/ai/legal-opinion",
  "/ai/draft",
  "/ai/contracts",
  "/ai/wargaming",
  "/settings",
  "/notifications",
  "/onboarding",
];
```

- [ ] **Step 2: Check for prefix collisions**

`PROTECTED` is matched with `startsWith`. Enumerate every route under `/ai/` that begins with `draft`, `contracts` or `wargaming` and confirm none is caught unintentionally. The A0 task did this for `legal-opinion` and found `/ai/legal-translate` and `/ai/gov/legal-opinion-drafter` were safe — do the same work here and show it.

- [ ] **Step 3: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State what an unauthenticated visitor now receives for each of the three routes, traced through `proxy.ts` — and note whether the `isSupabaseMode` gate changes that answer.

Confirm **no `middleware.ts` was created**.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(auth): protect the three remaining AI service routes"
```

---

## Task 10: A file upload for نقض المذكرة

The critique target in المحاكي asks the client to supply the memo to be attacked. The predecessor plan gave it a textarea, because the validator specified `memoText: string`. The owner's field test found that clients have the memo as a PDF, not as text they can paste.

**Files:**
- Modify: `src/app/ai/wargaming/page.tsx`, `src/lib/services/orderIntake.wargaming.ts`, `src/lib/services/orderIntake.wargaming.test.ts`

- [ ] **Step 1: Write the failing test — either input satisfies the requirement**

```ts
test("critique target is satisfied by an attachment instead of memoText", () => {
  const r = validateWargamingIntake({
    ...validBase,
    targets: ["critique"],
    memoText: "",
    attachments: [{ documentId: 12, name: "memo.pdf", size: 900 }],
  });
  assert.equal(r.ok, true);
});

test("critique target with neither memoText nor an attachment is rejected", () => {
  const r = validateWargamingIntake({
    ...validBase, targets: ["critique"], memoText: "", attachments: [],
  });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run test:unit`
Expected: the first test FAILS — the validator currently requires `memoText` regardless of attachments.

- [ ] **Step 3: Relax the rule to "one or the other"**

Change the critique branch so it is satisfied by a non-empty `memoText` **or** at least one attachment. Keep the Arabic error, but reword it to name both ways of satisfying it.

- [ ] **Step 4: Add the upload to the UI**

The page already uses `useOrderAttachments()` (added in `f4ac825`) for the case-file dropzone. Reuse the same hook instance for the memo — do **not** add a second one, or the two sets of attachments will not merge into one payload. Show the file input beside the textarea, both only when the critique target is selected, with one line making clear either is enough.

- [ ] **Step 5: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State what the admin receives when the client supplies a file, when they type text, and when they do both.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(wargaming): accept the memo as a file, not only as pasted text"
```

---

## Task 11: Real file uploads in the letter flow

`LetterWorkflow.tsx`'s "attachments" are free-text labels typed into an `<input>` — there is no `<input type="file">` anywhere in the file. The payload names them `letter.attachmentLabels` precisely so they cannot be mistaken for files. The owner now wants real ones.

**Files:**
- Modify: `src/app/ai/legal-opinion/_components/LetterWorkflow.tsx`

- [ ] **Step 1: Add the hook**

`LetterWorkflow` is self-contained and has its own submit path. Add `useOrderAttachments()` inside it and pass the result into `createServiceOrder`'s `attachments` argument, which currently receives `[]`.

- [ ] **Step 2: Keep the labels, and keep them distinguishable**

The label list is genuinely useful — a client may want to name an enclosure they will bring in person. **Keep both**, under two clearly different headings, and keep the payload keys distinct: `letter.attachmentLabels` for the typed names, and the standard top-level `attachments` for real files.

Do not silently merge them. An admin must be able to tell which enclosures exist as files and which are only named.

- [ ] **Step 3: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State what the admin receives for a letter order carrying two typed labels and one real file.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(legal-opinion): real file uploads in the letter flow, alongside named enclosures"
```

---

## Task 12: Require the contract parties

`useContractsState.ts`'s `canProceed()` has no gate on the `parties` step, so a client can submit a drafting order with both party names blank. The submit recap flags them amber, which was the deliberate compromise while the decision sat with the owner. **He has now asked for the validation** — his technical report's pending-decision 2.

**Files:**
- Modify: `src/hooks/useContractsState.ts`, `src/lib/services/orderIntake.contracts.ts`, `src/lib/services/orderIntake.contracts.test.ts`

- [ ] **Step 1: Write the failing validator test**

```ts
test("draft mode rejects an intake with no party names", () => {
  const r = validateContractsIntake({
    ...validDraftBase,
    parties: { one: {}, two: {} },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("الأطراف")));
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run test:unit`

- [ ] **Step 3: Implement in the validator first**

A party is named when it carries a non-empty `fullName`, `companyName` or `entityName` — the three shapes `PartyData` supports (`src/components/contracts/types.ts:33-42`). Read that type and cover every shape it allows; a rule that only checks `fullName` silently rejects every company contract.

- [ ] **Step 4: Gate the step too**

Add the matching check to `canProceed()` for `step === "parties"`, so the client is stopped at the form rather than at submit. The two rules must agree exactly — a wizard stricter than the validator blocks legitimate orders; a validator stricter than the wizard produces the dead-end the owner already reported elsewhere.

- [ ] **Step 5: Verify**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`, `npm run build`.

State what happens on the simple path and on the detailed path, and confirm the amber warning on the submit recap is now unreachable for the blank case — or say why it is still worth keeping.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(contracts): require the parties before a drafting order can be sent"
```

---

## Task 13: Update the owner's QA checklist

Every change above alters what the owner will see when he re-runs his test. `DEPLOY_AND_SMOKETEST_RUNBOOK.md` currently tells him to reopen التفاصيل after استلام (Task 2 removes that need) and does not mention the deliver button, the cancel button, the new order page, or the sidebar link.

**Files:**
- Modify: `DEPLOY_AND_SMOKETEST_RUNBOOK.md`

- [ ] **Step 1: Correct the rows this plan invalidates**

Six rows tell the admin to reopen the details panel. After Task 2 that is wrong. Find them by reading, not by trusting this count.

- [ ] **Step 2: Add rows for what is new**

One row each for: the explicit deliver button refusing to fire until a file is staged; the internal note being invisible to the client; the order page showing the reference number and the client's own attachments; the cancel button; the sidebar link; and an oversized file being refused in a service other than contracts review.

- [ ] **Step 3: Verify every label against source**

The previous checklist task was sent back for two rows that named a control the UI did not render. Read the code for every label you write.

- [ ] **Step 4: Verify and commit**

Run: `rm -rf .next/dev && npx tsc --noEmit`, `npm run test:unit`. You change no source file, so skip the build. `git status` must show one file.

```bash
git commit -m "test: refresh the owner checklist for the review-fix round"
```

---

## Deferred — deliberately not in this plan

- **«مراجعة مذكرة» as a paid service.** The owner's track 4 asks to un-hide the memo-review card and wire it to the order pipeline. That is a **fifth service**, not a repair: it needs its own intake shape, its own validator, its own admin handling, and a pricing decision. It deserves its own plan and should not be smuggled into a fix round.
- **Separating the client experience from the lawyer experience.** The owner's test log flags that some screens blur the two. Real and worth doing, but it is a design decision about which screens each account type should see, not an implementation task. It needs a decision session before any code.
- **n8n privacy trimming.** Still the owner's open choice from 15 August: whether the webhook keeps carrying full case facts. Unchanged by this plan.
- **The wargaming tier mismatch.** Header says "MAX فقط", `access-control.ts:68` gates at `pro`. Cosmetic, pre-existing, still awaiting a decision on which end is wrong.
- **Extracting the duplicated `submitErrorMessageAr`.** Now five copies across `useDraftState`, `wargaming/page.tsx`, `useContractsState`, `legal-opinion/page.tsx` and `LetterWorkflow`. Worth one shared helper, but it touches five files across every service and belongs in its own tidy-up.

## Self-review

**Spec coverage.** The owner's five tracks map as: track 1 → done before this plan plus Task 1; track 2 → Tasks 6 and 7; track 3 → Tasks 2, 3, 4 and 5; track 4 → deferred with a stated reason; track 5 → Task 8, minus the activity-log entry. His three pending decisions map to Tasks 12, 9 and 2. His five stated priorities map to Tasks 6, 4, 2, 10 and 11.

**Two gaps I am naming rather than hiding:**
1. **The activity-log integration** (his track 5, part 2 — logging an AI order into `/dashboard/lawyer/activity`) has no task. I could not verify how that page sources its events without reading further, and inventing a task from a guess is how plans go wrong. It needs one recon pass first.
2. **The audio player for voice attachments** (his track 3, part 5) has no task. Dictation now writes text into form fields; it does not produce an audio file, so there is nothing to play. If he wants recordings stored, that is a new capability, not a display change — worth telling him plainly.
