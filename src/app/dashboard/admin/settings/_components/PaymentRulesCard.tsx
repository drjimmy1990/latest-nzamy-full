"use client";

/**
 * PaymentRulesCard — the admin's editor for the payment rules the owner set
 * on 18 Nov 2026 (batch l8 payref). Every number is a platform_settings row
 * written through PATCH /api/v1/admin/settings, which validates and audits
 * each write; nothing here is a code constant:
 *   - min_topup_by_account_type   (l12, owner Q87: individual 100, every other type 500)
 *   - topup_bonus_pct             (l12, owner Q88a / ١٦٢: bonus % per pack, 0 by default)
 *   - founder_bonus_rule          (l12, ١٥٢: founder discount vs bonus — the higher only by default)
 *   - ai_draft_prices             (l12, owner N6: the legal drafter's price per kind)
 *   - founder_topup_discount_bps  (the founder's top-up discount rate, 1500 = 15 %)
 *   - founder_topup_discount_expires (how long it runs: the membership year by default)
 *   - firm_extra_seat_price_sar   (٥٣: stored only, never sold or shown publicly)
 *   - founder_renewal             (l11, register 55 / founder terms ٤: the
 *                                  renewal price and its switch; OFF, no price)
 * A key with no row shows the code default and says so.
 */

import { useEffect, useState } from "react";
import { CreditCard, FloppyDisk, SpinnerGap } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { DEFAULT_MIN_TOPUP_SAR, MIN_TOPUP_KEY } from "@/lib/points/pointsSettings";
import {
  FOUNDER_DISCOUNT_DEFAULT_BPS,
  FOUNDER_DISCOUNT_DEFAULT_MONTHS,
  FOUNDER_DISCOUNT_EXPIRES_KEY,
  FOUNDER_DISCOUNT_SETTING_KEY,
  founderDiscountWindowFromSetting,
} from "@/lib/payments/founderDiscount";
import { FIRM_EXTRA_SEAT_PRICE_KEY, FIRM_PLAN_SEATS, firmExtraSeatPriceSar } from "@/lib/pricing/firmSeats";
import { FOUNDER_RENEWAL_KEY, FOUNDER_RENEWAL_NOTICE_DAYS, parseFounderRenewal } from "@/lib/membership/founderRenewal";
import {
  FOUNDER_BONUS_RULE_KEY,
  parseFounderBonusMode,
  parseTopupBonus,
  TOPUP_BONUS_KEY,
  TOPUP_BONUS_PACK_IDS,
  type FounderBonusMode,
} from "@/lib/payments/topupBonus";
import { DRAFT_KIND_IDS, DRAFT_KINDS, DRAFT_PRICES_KEY, parseDraftPrices } from "@/lib/ai/draftKinds";

/** «شحن ٥٠٠» for "topup-500" (the admin list only). */
function packLabel(id: string): string {
  const n = Number(id.replace("topup-", ""));
  return `شحن ${Number.isFinite(n) ? n.toLocaleString("ar-SA") : id}`;
}

const TYPE_LABELS: ReadonlyArray<[string, string]> = [
  ["lawyer", "محامٍ"],
  ["firm", "مكتب / شركة محاماة"],
  ["individual", "فرد"],
  ["corporate", "منشأة"],
  ["micro", "منشأة صغيرة"],
  ["government", "جهة حكومية"],
  ["ngo", "جهة غير ربحية"],
  ["provider", "مقدّم خدمة"],
];

type Status = { key: string; ok: boolean; text: string } | null;

async function patchSetting(key: string, value: unknown): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) return { ok: true, text: "حُفظ، ويسري فوراً." };
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ، حاول مرة أخرى." };
  } catch {
    return { ok: false, text: "تعذّر الحفظ، حاول مرة أخرى." };
  }
}

export function PaymentRulesCard() {
  const { isDark } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState<Record<string, boolean>>({});
  const [minTopup, setMinTopup] = useState<Record<string, string>>({});
  const [bpsPct, setBpsPct] = useState(String(FOUNDER_DISCOUNT_DEFAULT_BPS / 100));
  const [mode, setMode] = useState<"months" | "until">("months");
  const [months, setMonths] = useState(String(FOUNDER_DISCOUNT_DEFAULT_MONTHS));
  const [until, setUntil] = useState("");
  const [seatPrice, setSeatPrice] = useState("");
  const [renewOn, setRenewOn] = useState(false);
  const [renewPrice, setRenewPrice] = useState("");
  const [bonus, setBonus] = useState<Record<string, string>>({});
  const [bonusMode, setBonusMode] = useState<FounderBonusMode>("higher_only");
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: Record<string, unknown> } | null) => {
        if (cancelled) return;
        const s = body?.data ?? {};
        setStored({
          [MIN_TOPUP_KEY]: s[MIN_TOPUP_KEY] !== undefined,
          [FOUNDER_DISCOUNT_SETTING_KEY]: s[FOUNDER_DISCOUNT_SETTING_KEY] !== undefined,
          [FOUNDER_DISCOUNT_EXPIRES_KEY]: s[FOUNDER_DISCOUNT_EXPIRES_KEY] !== undefined,
          [FIRM_EXTRA_SEAT_PRICE_KEY]: s[FIRM_EXTRA_SEAT_PRICE_KEY] !== undefined,
          [FOUNDER_RENEWAL_KEY]: s[FOUNDER_RENEWAL_KEY] !== undefined,
          [TOPUP_BONUS_KEY]: s[TOPUP_BONUS_KEY] !== undefined,
          [FOUNDER_BONUS_RULE_KEY]: s[FOUNDER_BONUS_RULE_KEY] !== undefined,
          [DRAFT_PRICES_KEY]: s[DRAFT_PRICES_KEY] !== undefined,
        });
        const bonusMap = parseTopupBonus(s[TOPUP_BONUS_KEY]);
        setBonus(Object.fromEntries(TOPUP_BONUS_PACK_IDS.map((id) => [id, String(bonusMap[id] ?? 0)])));
        setBonusMode(parseFounderBonusMode(s[FOUNDER_BONUS_RULE_KEY]));
        const prices = parseDraftPrices(s[DRAFT_PRICES_KEY]);
        setDraftPrices(Object.fromEntries(DRAFT_KIND_IDS.map((k) => [k, String(prices[k])])));
        const map = (s[MIN_TOPUP_KEY] && typeof s[MIN_TOPUP_KEY] === "object" ? s[MIN_TOPUP_KEY] : DEFAULT_MIN_TOPUP_SAR) as Record<string, unknown>;
        setMinTopup(Object.fromEntries(TYPE_LABELS.map(([t]) => [t, typeof map[t] === "number" ? String(map[t]) : ""])));
        const bps = s[FOUNDER_DISCOUNT_SETTING_KEY];
        if (typeof bps === "number") setBpsPct(String(bps / 100));
        const w = founderDiscountWindowFromSetting(s[FOUNDER_DISCOUNT_EXPIRES_KEY]);
        if (w.kind === "until") {
          setMode("until");
          setUntil(w.day);
        } else {
          setMode("months");
          setMonths(String(w.months));
        }
        const price = firmExtraSeatPriceSar(s[FIRM_EXTRA_SEAT_PRICE_KEY]);
        setSeatPrice(price === null ? "" : String(price));
        const renewal = parseFounderRenewal(s[FOUNDER_RENEWAL_KEY]);
        setRenewOn(renewal.enabled);
        setRenewPrice(renewal.priceHalalas === null ? "" : String(renewal.priceHalalas / 100));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(key: string, value: unknown) {
    setSaving(key);
    const r = await patchSetting(key, value);
    setStatus({ key, ...r });
    if (r.ok) setStored((p) => ({ ...p, [key]: true }));
    setSaving(null);
  }

  const whole = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

  function saveMinTopup() {
    const value: Record<string, number> = {};
    for (const [t] of TYPE_LABELS) {
      const raw = minTopup[t]?.trim() ?? "";
      if (raw === "") continue; // an empty field: no minimum for that type
      const n = whole(raw);
      if (n === null) {
        setStatus({ key: MIN_TOPUP_KEY, ok: false, text: "أدخل أعداداً صحيحة بالريال، أو اترك الحقل فارغاً لنوع بلا حد أدنى." });
        return;
      }
      value[t] = n;
    }
    void save(MIN_TOPUP_KEY, value);
  }

  function saveRate() {
    const pct = Number(bpsPct.trim());
    if (!Number.isFinite(pct)) {
      setStatus({ key: FOUNDER_DISCOUNT_SETTING_KEY, ok: false, text: "أدخل نسبة بين 0 و100." });
      return;
    }
    void save(FOUNDER_DISCOUNT_SETTING_KEY, Math.round(pct * 100));
  }

  function saveWindow() {
    if (mode === "until") {
      void save(FOUNDER_DISCOUNT_EXPIRES_KEY, { until: until.trim() });
      return;
    }
    const n = whole(months);
    void save(FOUNDER_DISCOUNT_EXPIRES_KEY, { months_after_activation: n ?? -1 });
  }

  function saveRenewal() {
    const raw = renewPrice.trim();
    void save(FOUNDER_RENEWAL_KEY, { enabled: renewOn, price_sar: raw === "" ? null : (whole(raw) ?? -1) });
  }

  function saveBonus() {
    const value: Record<string, number> = {};
    for (const id of TOPUP_BONUS_PACK_IDS) {
      const raw = bonus[id]?.trim() ?? "";
      const n = raw === "" ? 0 : whole(raw);
      if (n === null || n > 100) {
        setStatus({ key: TOPUP_BONUS_KEY, ok: false, text: "أدخل نسبة صحيحة بين 0 و100 لكل حزمة." });
        return;
      }
      value[id] = n;
    }
    void save(TOPUP_BONUS_KEY, value);
  }

  function saveDraftPrices() {
    const value: Record<string, number> = {};
    for (const k of DRAFT_KIND_IDS) {
      const n = whole(draftPrices[k] ?? "");
      if (n === null || n < 1) {
        setStatus({ key: DRAFT_PRICES_KEY, ok: false, text: "أدخل سعراً صحيحاً بالنقاط (١ فأكثر) لكل نوع." });
        return;
      }
      value[k] = n;
    }
    void save(DRAFT_PRICES_KEY, value);
  }

  function saveSeatPrice() {
    const raw = seatPrice.trim();
    void save(FIRM_EXTRA_SEAT_PRICE_KEY, { sar: raw === "" ? null : (whole(raw) ?? -1) });
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const label = `text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`;
  const hint = `text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`;
  const input = `w-24 rounded-xl border px-3 py-2 text-sm font-mono outline-none ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`;
  const btn =
    "inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-[#C8A762] disabled:opacity-60";
  const note = (key: string) =>
    status?.key === key ? (
      <p className={`mt-2 text-xs font-bold ${status.ok ? (isDark ? "text-emerald-400" : "text-emerald-700") : isDark ? "text-rose-400" : "text-rose-700"}`}>
        {status.text}
      </p>
    ) : null;
  const notStored = (key: string) =>
    loaded && !stored[key] ? <span className={`ms-2 ${hint}`}>(القيمة الافتراضية — لم تُحفظ بعد)</span> : null;
  const saveButton = (key: string, onClick: () => void) => (
    <button type="button" className={btn} disabled={!loaded || saving !== null} onClick={onClick}>
      {saving === key ? <SpinnerGap size={14} className="animate-spin" /> : <FloppyDisk size={14} />}
      حفظ
    </button>
  );

  return (
    <div className={`${card} overflow-hidden`} id="payment-rules">
      <div className={`flex items-center gap-3 border-b px-6 py-4 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        <div className={`rounded-xl p-2 ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
          <CreditCard size={18} weight="duotone" />
        </div>
        <div>
          <h2 className={`text-base font-black ${isDark ? "text-white" : "text-gray-900"}`}>قواعد الشحن وخصم المؤسس</h2>
          <p className={hint}>تُطبَّق في الخادم عند الدفع، ويُسجَّل كل تعديل في سجل الإدارة.</p>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <section>
          <p className={label}>
            الحد الأدنى للشحن لكل نوع حساب (ريال قبل الخصم والضريبة){notStored(MIN_TOPUP_KEY)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TYPE_LABELS.map(([t, name]) => (
              <label key={t} className={`flex flex-col gap-1 ${hint}`}>
                {name}
                <input
                  className={input}
                  inputMode="numeric"
                  value={minTopup[t] ?? ""}
                  onChange={(e) => setMinTopup((p) => ({ ...p, [t]: e.target.value }))}
                  aria-label={`الحد الأدنى للشحن: ${name}`}
                />
              </label>
            ))}
          </div>
          <p className={`mt-2 ${hint}`}>الحقل الفارغ يعني: لا حد أدنى لهذا النوع غير حزم الشحن المعروضة له.</p>
          <div className="mt-3">{saveButton(MIN_TOPUP_KEY, saveMinTopup)}</div>
          {note(MIN_TOPUP_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>النقاط الإضافية على حزم الشحن (٪ من نقاط الحزمة){notStored(TOPUP_BONUS_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            قرار المالك (٢٠ نوفمبر): أُلغي جدول الشحن الحملي، فكل حزمة تعطي نقاطاً بقدر سعرها (النقطة = ريال قبل الضريبة) ما لم تُضبط هنا نسبة إضافية.
            تُحسب النسبة عند الدفع وتُثبَّت في الطلب، فلا يغيّر تعديلها ما دُفع قبله. اتركها صفراً حتى يعتمد المالك جدولاً بديلاً.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TOPUP_BONUS_PACK_IDS.map((id) => (
              <label key={id} className={`flex flex-col gap-1 ${hint}`}>
                {packLabel(id)}
                <input
                  className={input}
                  inputMode="numeric"
                  value={bonus[id] ?? ""}
                  onChange={(e) => setBonus((p) => ({ ...p, [id]: e.target.value }))}
                  aria-label={`النقاط الإضافية: ${packLabel(id)}`}
                />
              </label>
            ))}
          </div>
          <div className="mt-3">{saveButton(TOPUP_BONUS_KEY, saveBonus)}</div>
          {note(TOPUP_BONUS_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>خصم المؤسس مع النقاط الإضافية على الشحن{notStored(FOUNDER_BONUS_RULE_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            إذا اجتمع للعضو المؤسس على حزمة واحدة خصم المؤسس ونقاط إضافية: «الأعلى فقط» يعطيه الأكبر قيمةً منهما (النقطة = ريال)، وعند التساوي الخصم؛
            و«الاثنان معاً» يعطيه كليهما.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`flex items-center gap-2 ${hint}`}>
              <input type="radio" name="founder-bonus-mode" checked={bonusMode === "higher_only"} onChange={() => setBonusMode("higher_only")} />
              الأعلى فقط
            </label>
            <label className={`flex items-center gap-2 ${hint}`}>
              <input type="radio" name="founder-bonus-mode" checked={bonusMode === "both"} onChange={() => setBonusMode("both")} />
              الاثنان معاً
            </label>
            {saveButton(FOUNDER_BONUS_RULE_KEY, () => void save(FOUNDER_BONUS_RULE_KEY, { mode: bonusMode }))}
          </div>
          {note(FOUNDER_BONUS_RULE_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>أسعار الصائغ القانوني لكل نوع (نقاط){notStored(DRAFT_PRICES_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            تُخصم مرة واحدة على التحليل، والصياغة بعده مجانية. يرى المحامي السعر الجديد في الصائغ فور الحفظ. صفحة الأسعار العامة تعرض المدى من
            الأسعار المعتمدة في الكود، فإن غيّرت هنا فاطلب تحديثها معه.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DRAFT_KIND_IDS.map((k) => (
              <label key={k} className={`flex flex-col gap-1 ${hint}`}>
                {DRAFT_KINDS[k].label}
                <input
                  className={input}
                  inputMode="numeric"
                  value={draftPrices[k] ?? ""}
                  onChange={(e) => setDraftPrices((p) => ({ ...p, [k]: e.target.value }))}
                  aria-label={`سعر ${DRAFT_KINDS[k].label}`}
                />
              </label>
            ))}
          </div>
          <div className="mt-3">{saveButton(DRAFT_PRICES_KEY, saveDraftPrices)}</div>
          {note(DRAFT_PRICES_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>نسبة خصم العضو المؤسس على شحن النقاط وعلى أي باقة أو اشتراك مكتبة (٪){notStored(FOUNDER_DISCOUNT_SETTING_KEY)}</p>
          <div className="mt-3 flex items-center gap-3">
            <input className={input} inputMode="decimal" value={bpsPct} onChange={(e) => setBpsPct(e.target.value)} aria-label="نسبة خصم المؤسس" />
            {saveButton(FOUNDER_DISCOUNT_SETTING_KEY, saveRate)}
          </div>
          {note(FOUNDER_DISCOUNT_SETTING_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>مدة خصم المؤسس (founder_topup_discount_expires){notStored(FOUNDER_DISCOUNT_EXPIRES_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            قرار المالك (السجل ١٤ البنود ٢٩ و٣٢ و٥٥): الخصم على الشحن وعلى أي باقة ما دام اشتراك المؤسس السنوي سارياً، أي سنة العضوية من التفعيل (١٢ شهراً) حتى يُبنى التجديد. وإن غيّرتها فحدّث نص شروط باقة المؤسس معها.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`flex items-center gap-2 ${hint}`}>
              <input type="radio" name="founder-discount-mode" checked={mode === "months"} onChange={() => setMode("months")} />
              أشهر من تفعيل العضوية
            </label>
            <input className={input} inputMode="numeric" value={months} disabled={mode !== "months"} onChange={(e) => setMonths(e.target.value)} aria-label="عدد الأشهر من التفعيل" />
            <label className={`flex items-center gap-2 ${hint}`}>
              <input type="radio" name="founder-discount-mode" checked={mode === "until"} onChange={() => setMode("until")} />
              حتى تاريخ ثابت لكل المؤسسين
            </label>
            <input
              type="date"
              className={`${input} w-40`}
              value={until}
              disabled={mode !== "until"}
              onChange={(e) => setUntil(e.target.value)}
              aria-label="آخر يوم للخصم"
            />
            {saveButton(FOUNDER_DISCOUNT_EXPIRES_KEY, saveWindow)}
          </div>
          {note(FOUNDER_DISCOUNT_EXPIRES_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>سعر المقعد الإضافي للمكاتب (ريال قبل الضريبة){notStored(FIRM_EXTRA_SEAT_PRICE_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            المقاعد المشمولة: {FIRM_PLAN_SEATS["firm-basic"]} لمكتب المحاماة و{FIRM_PLAN_SEATS["firm-enterprise"]} لشركة المحاماة. هذا السعر يُحفظ فقط ولا يُعرض
            علناً ولا يُباع عبر الموقع؛ اتركه فارغاً حتى يحدده المالك.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input className={input} inputMode="numeric" value={seatPrice} onChange={(e) => setSeatPrice(e.target.value)} aria-label="سعر المقعد الإضافي" />
            {saveButton(FIRM_EXTRA_SEAT_PRICE_KEY, saveSeatPrice)}
          </div>
          {note(FIRM_EXTRA_SEAT_PRICE_KEY)}
        </section>

        <section className={`border-t pt-6 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <p className={label}>تجديد باقة المحامي المؤسس (ريال قبل الضريبة){notStored(FOUNDER_RENEWAL_KEY)}</p>
          <p className={`mt-1 ${hint}`}>
            شروط باقة المؤسس (البند ٤): التجديد بالسعر المعلن وقتها، ويُعلَن قبل نهاية سنة العضوية بـ{FOUNDER_RENEWAL_NOTICE_DAYS.toLocaleString("ar-SA")} يوماً،
            ويُخصم منه خصم المؤسس (السجل ١٤ البند ٥٥). عند التفعيل مع سعر يُرسَل لكل عضو مؤسس تنتهي سنته خلال المدة إشعار في حسابه ورسالة بريد مرة واحدة.
            لا يُباع التجديد عبر الموقع بعد. اتركه موقوفاً بلا سعر حتى يحدده المالك.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`flex items-center gap-2 ${hint}`}>
              <input type="checkbox" checked={renewOn} onChange={(e) => setRenewOn(e.target.checked)} />
              إعلان سعر التجديد
            </label>
            <input className={input} inputMode="numeric" value={renewPrice} onChange={(e) => setRenewPrice(e.target.value)} aria-label="سعر تجديد باقة المؤسس" />
            {saveButton(FOUNDER_RENEWAL_KEY, saveRenewal)}
          </div>
          {note(FOUNDER_RENEWAL_KEY)}
        </section>
      </div>
    </div>
  );
}
