-- =============================================================================
-- 🏛️ ترقية مخطط المكتبة القانونية المنقّحة (Ratified Schema Migration)
-- مواءمة جدول الأنظمة الرئيسي (library.laws) مع جريدة أم القرى ومحرك النفاذ
-- =============================================================================
-- الإصدار: 2.0 (منقّحة ومعتمدة بعد مداولات المجلس التقنية مع كلود وانتيجرافتي)
-- التاريخ: ١١ سبتمبر ٢٠٢٦
-- الاعتماد: متوافقة 100% مع قياسات الـ 10,968 ملفاً والمحلل الفعلي nzamy_working
-- =============================================================================

BEGIN;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. ضمان وجود أعمدة التواريخ الميلادية (دمج هجرة 20260824 للاكتفاء الذاتي) ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- ك-12 (2026-08-24): تفعيل أعمدة التواريخ الميلادية لتمكين الحساب الزمني الدقيق

ALTER TABLE library.laws
  ADD COLUMN IF NOT EXISTS publication_date_gregorian DATE,
  ADD COLUMN IF NOT EXISTS effective_date_gregorian   DATE,
  ADD COLUMN IF NOT EXISTS effective_date_note        TEXT;

COMMENT ON COLUMN library.laws.publication_date_gregorian IS 'تاريخ النشر الميلادي المعتمد والمطابق لأم القرى';
COMMENT ON COLUMN library.laws.effective_date_gregorian IS 'تاريخ النفاذ والسريان الميلادي المحسوب بدقة';
COMMENT ON COLUMN library.laws.effective_date_note IS 'المستند الحسابي وملاحظة كيفية احتساب مهلة النفاذ';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. إضافة حقول الجريدة الرسمية وتتبع الإحلال (بدون قيود كاسرة)              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE library.laws
  -- أ. بيانات جريدة أم القرى الرسمية
  ADD COLUMN IF NOT EXISTS gazette_issue_number       VARCHAR(50),   -- رقم العدد: مثلاً '5157' أو 'العدد (5157)'
  ADD COLUMN IF NOT EXISTS gazette_publication_date   DATE,          -- تاريخ النشر الميلادي بالجريدة
  ADD COLUMN IF NOT EXISTS gazette_url                TEXT,          -- رابط وثيقة النشر في أم القرى أو الخزنة
  
  -- ب. بيانات وضوابط النفاذ التشريعي (Enactment Mechanics)
  ADD COLUMN IF NOT EXISTS enactment_period_days      INT DEFAULT 0, -- مهلة النفاذ بالأيام (مثلاً 180 يوماً)
  ADD COLUMN IF NOT EXISTS enactment_clause_text      TEXT,          -- نص مادة النفاذ الحرفي من أصل النظام
  ADD COLUMN IF NOT EXISTS enactment_article_number   VARCHAR(50),   -- رقم مادة النفاذ (مثلاً: 'المادة الأخيرة' أو 'المادة 720')
  
  -- ج. تتبع الإحلال والأنظمة السابقة (Supersession Tracking)
  -- تنبيه معماري: لا نضع REFERENCES library.laws(slug) لأن البيانات الحالية تحوي نصوصاً حرة
  -- واستشهادات بمحاضر جلسات ومراسيم، ولأن الترتيب الطوبولوجي للبذر لا يضمن إدخال السلف قبل الخلف.
  ADD COLUMN IF NOT EXISTS supersedes_law_ref         TEXT,          -- النص الحرفي للإحلال كما يرد من المصدر
  ADD COLUMN IF NOT EXISTS supersedes_law_slug        VARCHAR(200),  -- slug النظام السابق (حقل حر بلا قيد مفتاح أجنبي)
  ADD COLUMN IF NOT EXISTS supersedes_law_title       TEXT;          -- اسم/عنوان النظام السابق الملغى

COMMENT ON COLUMN library.laws.gazette_issue_number IS 'رقم عدد جريدة أم القرى الرسمية المنشور فيه النظام';
COMMENT ON COLUMN library.laws.gazette_publication_date IS 'تاريخ نشر عدد جريدة أم القرى الميلادي';
COMMENT ON COLUMN library.laws.gazette_url IS 'الرابط المباشر للعدد أو وثيقة النشر الرسمية';
COMMENT ON COLUMN library.laws.enactment_period_days IS 'مدة مهلة السريان بالأيام المنصوص عليها في مادة النفاذ';
COMMENT ON COLUMN library.laws.enactment_clause_text IS 'النص الحرفي لمادة النفاذ في النظام';
COMMENT ON COLUMN library.laws.enactment_article_number IS 'رقم مادة النفاذ في النظام';
COMMENT ON COLUMN library.laws.supersedes_law_ref IS 'المرجع الحرفي للإحلال من الديباجة أو مواد النظام السابقة';
COMMENT ON COLUMN library.laws.supersedes_law_slug IS 'معرف النظام القديم (slug) دون إلزام بعلاقة مفتاح أجنبي';
COMMENT ON COLUMN library.laws.supersedes_law_title IS 'عنوان النظام السابق الذي حل محله هذا النظام';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. ضبط قيد حالات النظام (مطابقة تامة لـ schema_manifest.json v1.4)         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- القيد يطابق القيم السبع المعتمدة رسمياً في enums.status وقاعدة "الغياب يُعلَن ولا يُملأ"
-- تم استبعاد 'superseded' لأنها تُطبّع تلقائياً إلى 'repealed' في status_normalization_map.
-- واستبعاد 'merged_into_parent' لأنها خاصة بسجل الأدوات المدمجة ويتم تخطيها في المحلل قبل جدول laws.

ALTER TABLE library.laws DROP CONSTRAINT IF EXISTS chk_laws_status_lifecycle;

ALTER TABLE library.laws
  ADD CONSTRAINT chk_laws_status_lifecycle 
  CHECK (status IN (
    'active',                          -- سارٍ ونافذ
    'partially_active',                -- سارٍ جزئياً
    'deferred_effective',              -- مقرر النفاذ مستقبلاً (يعمل عليه العداد التنازلي)
    'issued_publication_unverified',   -- صدر ونُشر ولم يتم التحقق من سريانه
    'suspended',                       -- موقوف مؤقتاً
    'repealed',                        -- ملغى
    'status_undeclared'                -- حالة غير معلنة صراحة في المتن (تمنع سقوط الـ 118 نظاماً)
  ));


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. الفيو الديناميكي لحساب الأيام المتبقية لحظياً (Pure Computed View)      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- الحل المعماري الصافي: يحسب الحالة والأيام المتبقية في زمن الاستعلام بدقة السيرفر
-- دون إجراء أي عمليات كتابة على الجداول، صوناً لمبدأ المصدر الواحد (Markdown SSOT).
-- تم شمل كافة الحقول الجديدة لدعم تكامل الواجهة الأمامية (EnactmentCountdownWidget).

CREATE OR REPLACE VIEW library.v_laws_enactment_status AS
SELECT 
    l.slug,
    l.title,
    l.title_en,
    l.section_code,
    l.section_name,
    l.issuing_instrument,
    l.publication_date_hijri,
    l.publication_date_gregorian,
    l.effective_date_hijri,
    l.effective_date_gregorian,
    l.effective_date_note,
    l.gazette_issue_number,
    l.gazette_publication_date,
    l.gazette_url,
    l.enactment_period_days,
    l.enactment_clause_text,
    l.enactment_article_number,
    l.supersedes_law_ref,
    l.supersedes_law_slug,
    l.supersedes_law_title,
    -- الحالة المحسوبة ديناميكياً بدقة لحظية:
    CASE 
        WHEN l.effective_date_gregorian IS NOT NULL AND l.effective_date_gregorian > CURRENT_DATE 
             THEN 'deferred_effective'
        WHEN l.status = 'deferred_effective' AND l.effective_date_gregorian <= CURRENT_DATE 
             THEN 'active'
        ELSE l.status 
    END AS computed_status,
    -- الأيام المتبقية حتى النفاذ (صفر إن كان سارياً بالفعل):
    GREATEST(0, (COALESCE(l.effective_date_gregorian, CURRENT_DATE) - CURRENT_DATE)) AS days_remaining,
    -- مؤشر إظهار شريط العداد التنازلي في الواجهة:
    CASE 
        WHEN l.effective_date_gregorian IS NOT NULL AND l.effective_date_gregorian > CURRENT_DATE 
             THEN TRUE 
        ELSE FALSE 
    END AS is_countdown_active
FROM library.laws l;

COMMENT ON VIEW library.v_laws_enactment_status IS 
'فيو ديناميكي فوري يحسب حالة السريان والأيام المتبقية للنفاذ بناءً على تاريخ السيرفر اللحظي دون المساس بـ SSOT';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. إلغاء دالة الكتابة التلقائية (fn_auto_activate) درءاً للتعارض المعماري   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- تم إلغاء دالة fn_auto_activate_enacted_laws نهائياً لأن كتابة الحالة في القاعدة 
-- تتناقض مع كون ملفات الماركداون هي المصدر الوحيد للحقيقة (Markdown SSOT)، وأي بذر لاحق
-- كان سيمحو تعديلات الدالة. الاعتماد الحصري والمطلق الآن على الفيو v_laws_enactment_status.

DROP FUNCTION IF EXISTS library.fn_auto_activate_enacted_laws();

COMMIT;
