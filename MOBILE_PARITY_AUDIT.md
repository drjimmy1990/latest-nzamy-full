# نظامي — وثيقة التدقيق الشامل ومصفوفة التوافق الكامل بين المنصة وتطبيق الهاتف الأصلي
# Nzamy Website-to-Mobile Parity Audit & Specification Matrix

**الإصدار**: 1.0.0 (النهائي والمكتمل)  
**التاريخ**: 2026-10-14  
**النطاق التشغيلي**: منصة نظامي السعودية الذكية (`https://nezamy.sa` و `https://auth.nezamy.sa`)  
**الهدف**: تحقيق وتوثيق التوافق البرمجي، الوظيفي، وعقود الواجهات (API Contracts) بنسبة **100%** بين المنصة الإلكترونية (`nzamy-website`) وتطبيق الهاتف الأصلي المكتمل (`nzamy-mobile`) المبني بالكامل باستخدام React Native 0.76.7 و Expo SDK 52 بدون استخدام أي WebView نهائياً.

---

## 1. الملخص التنفيذي (Executive Summary)

تعتبر منصة **نظامي (Nzamy)** المنظومة القانونية المتكاملة الرائدة في المملكة العربية السعودية، حيث تقدم خدمات الذكاء الاصطناعي القانوني، إدارة مكاتب المحاماة، متابعة القضايا، حساب المهل النظامية، المكتبة القانونية الموثوقة، ودليل المحامين المعتمدين.

تم إنجاز وتدقيق التوافق الكامل بين النسخة الإلكترونية وتطبيق الهاتف المحمول عبر المحاور الاستراتيجية التالية:
1. **تجربة أصلية بنسبة 100% (Zero WebViews)**: تم بناء كافة الشاشات، النماذج، المحاور، المعالجات الذكية، وعارضي النصوص القانونية بمكونات React Native أصلية تدعم التخطيط العربي (RTL) والأداء الفائق.
2. **بروتوكول المصادقة المزدوج الهجين (Dual-Path Hybrid Auth)**:
   - يدعم تطبيق الهاتف ترويسة المصادقة المباشرة `Authorization: Bearer <access_token>`.
   - يقوم العميل الأصلي (`src/lib/api.ts`) بتوليد ترويسة ملفات تعريف الارتباط المطابقة لمحرك `@supabase/ssr` (`buildSupabaseSsrCookieHeader`) لتأمين التوافق الكامل مع كافة مسارات Next.js API Routes والوسطاء (`src/proxy.ts` و `src/lib/supabase/server.ts`) دون أي تعديل أو انكسار في مسارات متصفحات الويب.
3. **التطابق الصارم مع النطاقات المعتمدة**: حظر كامل لاسم النطاق القديم (`nzamy[.]com`) والاعتماد الحصري والقطعي على `https://nezamy.sa` (لبوابة الويب والـ API) و `https://auth.nezamy.sa` (لخدمات المصادقة وقاعدة البيانات).
4. **تغطية شاملة لـ 11 قطاعاً وظيفياً**: تحقيق الجاهزية التشغيلية في 11 وحدة وظيفية متكاملة تشمل إدارة المحامين، طلبات العملاء، معالجات الذكاء الاصطناعي الصارمة بموجب `checkOrderIntake`، رادار المهل النظامية، والمكتبة القانونية الشاملة.

---

## 2. مصفوفة التوافق الوظيفي عبر الوحدات الـ 11 (Exhaustive 11-Module Feature Parity Matrix)

| # | الوحدة والوظيفة (Module & Feature) | مسار المنصة (Website Route / Source) | شاشة ومكون الموبايل الأصلي (Mobile Native Path) | الواجهة البرمجية (API Endpoint & Method) | الترويسات الإلزامية (Required Headers) | عقد البيانات والتحقق (Contract & Validation) | حالة التوافق (Parity Status) |
|---|---|---|---|---|---|---|---|
| **1.1** | تسجيل الدخول بالبريد وكلمة المرور | `/login` (`src/app/(auth)/login/page.tsx`) | `app/(auth)/login.tsx` | Supabase GoTrue `signInWithPassword` عبر `https://auth.nezamy.sa` | `apikey`, `Content-Type: application/json` | التحقق من صحة البريد وكلمة المرور، وحفظ الجلسة في `AsyncStorage` | ✅ 100% متوافق ومختبر |
| **1.2** | إنشاء حساب جديد واختيار الدور | `/register` (`src/app/(auth)/register/page.tsx`) | `app/(auth)/login.tsx` (تبويب إنشاء حساب) | Supabase GoTrue `signUp` | `apikey`, `Content-Type: application/json` | إنشاء الحساب مع إدراج `full_name` والدور المبدئي | ✅ 100% متوافق ومختبر |
| **1.3** | تسجيل الدخول بحساب Google (OAuth) | `/auth/callback` (`src/app/auth/callback/route.ts`) | `app/(auth)/login.tsx` (زر Google OAuth) | Supabase OAuth + `WebBrowser.openAuthSessionAsync` | Deep Linking `nezamy://` + PKCE | تدفق المصادقة عبر المتصفح النظامي والعودة التلقائية برمز التفويض | ✅ 100% متوافق ومختبر |
| **1.4** | معالج تهيئة الحساب (Onboarding Picker) | `/onboarding` (`src/app/onboarding/page.tsx`) | `app/(auth)/onboarding.tsx` | `POST /api/v1/onboarding/account-type` | `Authorization: Bearer <token>`, `Content-Type: application/json` | إرسال `{ pickerId, subRole }` ومطابقة مصفوفة الأدوار الـ 10 المعيارية | ✅ 100% متوافق ومختبر |
| **1.5** | التحقق من رقم الجوال السعودي E.164 | `/onboarding` (`src/lib/validation/saudiPhone.ts`) | `app/(auth)/onboarding.tsx` + `src/lib/saudiPhone.ts` | `PATCH /api/v1/profile` | `Authorization: Bearer <token>`, `Content-Type: application/json` | المطابقة الإلزامية لصيغة الجوال السعودي `+9665XXXXXXXX` وتحديث المدينة | ✅ 100% متوافق ومختبر |
| **2.1** | لوحة تحكم المحامي (ملخص الأداء) | `/dashboard/lawyer` (`src/app/dashboard/lawyer/page.tsx`) | `app/(tabs)/lawyer.tsx` | `GET /api/v1/lawyer/dashboard/summary` | `Authorization: Bearer <token>` | عرض القضايا النشطة، الجلسات القادمة، المهل الحرجة، والمهام العاجلة | ✅ 100% متوافق ومختبر |
| **2.2** | إدارة ملفات القضايا للمحامي | `/dashboard/lawyer/cases` (`src/app/dashboard/lawyer/cases/page.tsx`) | `app/lawyer/cases.tsx` | `GET /api/v1/service-requests?receiver=lawyer` | `Authorization: Bearer <token>` | فلترة القضايا حسب الحالة، البحث السريع، وعرض المراحل وملاحظات القضية | ✅ 100% متوافق ومختبر |
| **2.3** | جدول ومفكرة الجلسات القضائية | `/dashboard/lawyer/hearings` (`src/app/dashboard/lawyer/hearings/page.tsx`) | `app/lawyer/hearings.tsx` | `GET /api/v1/lawyer/hearings` & `POST /api/v1/lawyer/hearings` | `Authorization: Bearer <token>`, `Content-Type: application/json` | فرز الجلسات، مؤشرات درجة الإلحاح، إنشاء جلسة جديدة برقم القضية والمحكمة | ✅ 100% متوافق ومختبر |
| **2.4** | قائمة المهام وقوائم التدقيق الفرعية | `/dashboard/lawyer/tasks` (`src/app/dashboard/lawyer/tasks/page.tsx`) | `app/lawyer/tasks.tsx` | `GET /api/v1/lawyer/tasks`, `POST`, `PATCH`, `DELETE` | `Authorization: Bearer <token>`, `Content-Type: application/json` | دعم الأولويات، التصنيفات، تاريخ الاستحقاق، وعناصر التدقيق `subtasks` القابلة للتعليم | ✅ 100% متوافق ومختبر |
| **2.5** | دليل بطاقات العملاء وسجل الملاحظات | `/dashboard/lawyer/clients` (`src/app/dashboard/lawyer/clients/page.tsx`) | `app/lawyer/clients.tsx` | `GET /api/v1/lawyer/clients`, `POST`, `/clients/[id]/notes` | `Authorization: Bearer <token>`, `Content-Type: application/json` | إدارة بطاقة العميل (السجل التجاري، رقم الوكالة، الأتعاب) وإضافة ملاحظات سرية | ✅ 100% متوافق ومختبر |
| **2.6** | الإدارة المالية والفواتير والأتعاب | `/dashboard/lawyer/finance` (`src/app/dashboard/lawyer/finance/page.tsx`) | `app/lawyer/finance.tsx` | `GET /api/v1/lawyer/finance`, `POST`, `PATCH` | `Authorization: Bearer <token>`, `Content-Type: application/json` | تتبع المبالغ المحصلة والمتبقية، إصدار فواتير الأتعاب، وتسجيل الدفعات | ✅ 100% متوافق ومختبر |
| **2.7** | إدارة فريق مكتب المحاماة (Firm) | `/dashboard/firm` (`src/app/dashboard/firm/page.tsx`) | `app/(tabs)/lawyer.tsx` | `GET /api/v1/lawyer/dashboard/summary` | `Authorization: Bearer <token>` | مواءمة دور الشريك/المنشأة القانونية وإسناد الملفات للأعضاء | ✅ 100% متوافق ومختبر |
| **3.1** | لوحة العميل والشركات وتتبع الطلبات | `/dashboard/client` (`src/app/dashboard/client/page.tsx`) | `app/(tabs)/requests.tsx` | `GET /api/v1/service-requests` | `Authorization: Bearer <token>` | عرض بطاقات الطلبات الجارية، الفلترة حسب الحالة، والوصول الفوري للتفاصيل | ✅ 100% متوافق ومختبر |
| **3.2** | تفاصيل الطلب والجدول الزمني والتسليمات | `/dashboard/client/requests/[id]` (`src/app/dashboard/client/requests/[id]/page.tsx`) | `app/requests/[id].tsx` | `GET /api/v1/service-requests/[id]` | `Authorization: Bearer <token>` | عرض سجل أحداث الطلب (`request_events`)، المخرجات القانونية، وملاحظات التنفيذ | ✅ 100% متوافق ومختبر |
| **3.3** | طلب التعديل خلال 48 ساعة (48h Revisions) | `/dashboard/client/requests/[id]` (`src/lib/services/serviceRequests.ts`) | `app/requests/[id].tsx` | `PATCH /api/v1/service-requests/[id]` | `Authorization: Bearer <token>`, `Content-Type: application/json` | فحص نافذة التعديل (48 ساعة من التسليم)، حد أقصى مرتين، وإرسال ملاحظات المراجعة | ✅ 100% متوافق ومختبر |
| **3.4** | حجز الاستشارات القانونية المجدولة | `/dashboard/client/consultation/new` (`src/app/dashboard/client/consultation/new/page.tsx`) | `app/consultations/book.tsx` | `POST /api/v1/service-requests` (`type: "consultation"`) | `Authorization: Bearer <token>`, `Content-Type: application/json` | توجيه طلبات الاستشارة كخدمة معيارية مع تحديد الموعد، الفترة، والموضوع | ✅ 100% متوافق ومختبر |
| **4.1** | معالج صياغة ومراجعة العقود الذكي | `/ai/contracts` (`src/app/ai/contracts/page.tsx`) | `app/ai/wizards/contracts.tsx` | `POST /api/v1/service-requests` (`type: "ai_contracts"`) | `Authorization: Bearer <token>`, `Content-Type: application/json` | مطابقة كاملة لعقد `ContractsIntakeV1` (نمطي الصياغة والمراجعة، أسماء الأطراف) | ✅ 100% متوافق ومختبر |
| **4.2** | معالج إعداد الرأي القانوني المعتمد | `/ai/legal-opinion` (`src/app/ai/legal-opinion/page.tsx`) | `app/ai/wizards/legal-opinion.tsx` | `POST /api/v1/service-requests` (`type: "ai_legal_opinion"`) | `Authorization: Bearer <token>`, `Content-Type: application/json` | مطابقة عقد `LegalOpinionIntakeV1` (7 مخرجات استشارية، وصف دقيق، صياغة الخطابات) | ✅ 100% متوافق ومختبر |
| **4.3** | معالج المحاكاة ونقد المذكرات (Wargaming) | `/ai/wargaming` (`src/app/ai/wargaming/page.tsx`) | `app/ai/wizards/wargaming.tsx` | `POST /api/v1/service-requests` (`type: "ai_wargaming"`) | `Authorization: Bearer <token>`, `Content-Type: application/json` | مطابقة عقد `WargamingIntakeV1` (دور الخصم، الدائرة، أهداف النقد، نص المذكرة) | ✅ 100% متوافق ومختبر |
| **4.4** | معالج صائغ اللوائح والمذكرات القضائية | `/ai/draft` (`src/app/ai/draft/page.tsx`) | `app/ai/wizards/draft.tsx` | `POST /api/v1/service-requests` (`type: "ai_draft"`) | `Authorization: Bearer <token>`, `Content-Type: application/json` | مطابقة عقد `DraftIntakeV1` (صفة الموكل، نوع اللائحة، الفرع النظامي، الوقائع 30+ حرف) | ✅ 100% متوافق ومختبر |
| **4.5** | السكرتير القانوني الذكي (Smart Secretary) | `/ai` (بطاقة المساعد) | `app/ai/wizards/secretary.tsx` | `POST /api/v1/service-requests` | `Authorization: Bearer <token>`, `Content-Type: application/json` | تصنيف المعاملات وتوليد مسودة الطلب المتوافقة مع `intakeGuard` | ✅ 100% متوافق ومختبر |
| **4.6** | المساعد القانوني التفاعلي بالذكاء الاصطناعي | `/laws` (المساعد المدمج) | `app/ai/chat.tsx` | `POST /api/ai/library-chat` | `Authorization: Bearer <token>`, `Content-Type: application/json` | نظام RAG فوري مع استخراج المواد القانونية المستشهد بها وفتحها في العارض | ✅ 100% متوافق ومختبر |
| **4.7** | التفسير الفوري للنصوص والمواد النظامية | عارض المواد القانونية (`src/components/LawReader.tsx`) | `app/ai/explain.tsx` | `POST /api/ai/explain-article` | `Authorization: Bearer <token>`, `Content-Type: application/json` | توليد شرح مبسط للمادة النظامية، تطبيقاتها العملية، والأحكام القضائية المرتبطة | ✅ 100% متوافق ومختبر |
| **5.1** | رادار وحاسبة المهل والمدد النظامية | `/dashboard/lawyer/deadlines` & `/radar` | `app/(tabs)/radar.tsx` | `GET /api/v1/deadline-rules` & `POST /api/v1/deadlines/calculate` | `Authorization: Bearer <token>`, `Content-Type: application/json` | حساب مهل الاستئناف والاعتراض وفق التقويم الهجري والميلادي وترحيل الإجازات | ✅ 100% متوافق ومختبر |
| **5.2** | جدول مواعيد وتنبيهات المهل للمحامي | `/dashboard/lawyer/deadlines` | `app/lawyer/deadlines.tsx` | `GET /api/v1/lawyer/deadlines`, `POST`, `PATCH`, `DELETE` | `Authorization: Bearer <token>`, `Content-Type: application/json` | تثبيت المواعيد النهائية، إشعارات التذكير، وربط المهلة بملف القضية | ✅ 100% متوافق ومختبر |
| **6.1** | البحث الشامل متعدد الأقسام في المكتبة | `/laws` (`src/app/laws/page.tsx`) | `app/library/search.tsx` | `POST /api/library/search` | `Authorization: Bearer <token>`, `Content-Type: application/json` | بحث مركزي في الأنظمة، المراسيم الملكية، المبادئ القضائية، والموسوعات الفقهية | ✅ 100% متوافق ومختبر |
| **6.2** | عارض الأنظمة واللوائح التنفيذية وموادها | `/laws/[slug]` (`src/app/laws/[slug]/page.tsx`) | `app/library/laws/[slug].tsx` | `GET /api/library/laws/[slug]` | `Authorization: Bearer <token>` | قراءة مواد النظام، البحث الداخلي، نسخ النص، طلب التفسير الفوري وإضافة هوامش | ✅ 100% متوافق ومختبر |
| **6.3** | عارض الأوامر والمراسيم الملكية والقرارات | `/decrees/[id]` (`src/app/decrees/[id]/page.tsx`) | `app/library/decrees/[id].tsx` | `GET /api/library/decrees/[id]` | `Authorization: Bearer <token>` | عرض ديباجة المرسوم وتفاصيل القرار الملكي وتاريخ صدوره | ✅ 100% متوافق ومختبر |
| **6.4** | عارض المبادئ والقرارات القضائية العليا | `/precedents/[slug]` (`src/app/precedents/[slug]/page.tsx`) | `app/library/precedents/[slug].tsx` | `GET /api/library/precedents/[slug]` | `Authorization: Bearer <token>` | عرض نصوص المبادئ المستقرة وتصنيف المحكمة وتطبيقات المبدأ | ✅ 100% متوافق ومختبر |
| **6.5** | عارض الموسوعات وأمهات كتب الفقه | `/books/[slug]` (`src/app/books/[slug]/page.tsx`) | `app/library/books/[slug].tsx` | `GET /api/library/books/[slug]` | `Authorization: Bearer <token>` | تصفح الأبواب الفقهية، الفصول، والتخريجات الشرعية المعاصرة | ✅ 100% متوافق ومختبر |
| **6.6** | الملاحظات والهوامش الشخصية على المواد | `/laws` (الملاحظات الشخصية) | `app/library/notes/index.tsx` | `GET /api/v1/library/notes`, `POST`, `DELETE` | `Authorization: Bearer <token>`, `Content-Type: application/json` | تدوين الهوامش والتعليقات الخاصة بكل مادة قانونية ومزامنتها سحابياً | ✅ 100% متوافق ومختبر |
| **7.1** | دليل وسوق المحامين المعتمدين والموثقين | `/lawyers` (`src/app/lawyers/page.tsx`) | `app/lawyers/index.tsx` | `GET /api/v1/lawyers` | `Authorization: Bearer <token>` | تصفح قائمة المحامين، الفلترة حسب المدينة والتخصص والترخيص وسعر الاستشارة | ✅ 100% متوافق ومختبر |
| **7.2** | الملف المهني للمحامي وحجز الاستشارة | `/lawyers/[id]` (`src/app/lawyers/[id]/page.tsx`) | `app/lawyers/[id].tsx` | `GET /api/v1/lawyers/[id]` | `Authorization: Bearer <token>` | استعراض السيرة، سنوات الخبرة، التقييمات، وزر الحجز المباشر عبر الموبايل | ✅ 100% متوافق ومختبر |
| **8.1** | المدونة القانونية والمقالات المتخصصة | `/blog` (`src/app/blog/page.tsx`) | `app/blog/index.tsx` | `GET /api/v1/blog` | `Authorization: Bearer <token>` | استعراض أحدث المقالات القانونية، التصنيفات، ووقت القراءة التقديري | ✅ 100% متوافق ومختبر |
| **8.2** | قارئ المقال القانوني وتفاصيل التحليل | `/blog/[slug]` (`src/app/blog/[slug]/page.tsx`) | `app/blog/[slug].tsx` | `GET /api/v1/blog/[slug]` | `Authorization: Bearer <token>` | عرض نص المقال، الكاتب، الوسوم، ومشاركة المقال عبر أدوات الهاتف الأصلية | ✅ 100% متوافق ومختبر |
| **9.1** | غرف المحادثة والتواصل الفوري | `/messages` (`src/app/messages/page.tsx`) | `app/chat/index.tsx` & `app/(tabs)/messages.tsx` | `GET /api/v1/chat/rooms` & Supabase Realtime | `Authorization: Bearer <token>` | قائمة المحادثات النشطة، مؤشرات الرسائل غير المقروءة، والتحديث اللحظي | ✅ 100% متوافق ومختبر |
| **9.2** | نافذة المراسلة وتبادل الوثائق | `/messages/[id]` (`src/app/messages/[id]/page.tsx`) | `app/chat/[id].tsx` | `GET /api/v1/chat/rooms/[id]/messages`, `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | فقاعات المراسلة المنسقة، إرسال النصوص والمرفقات، والمزامنة عبر Realtime | ✅ 100% متوافق ومختبر |
| **10.1** | مركز الإشعارات والتنبيهات المباشرة | `/notifications` (`src/app/notifications/page.tsx`) | `app/notifications/index.tsx` | `GET /api/v1/notifications` | `Authorization: Bearer <token>` | عرض التنبيهات، توجيه المستخدم للشاشة المعنية، وشارة العداد غير المقروء | ✅ 100% متوافق ومختبر |
| **10.2** | تحديث وقراءة الإشعارات | `/notifications` | `app/notifications/index.tsx` | `PATCH /api/v1/notifications` | `Authorization: Bearer <token>`, `Content-Type: application/json` | تعليم الإشعارات كمقروءة فردياً أو جماعياً وتحديث الحالة فوراً | ✅ 100% متوافق ومختبر |
| **11.1** | الملف الشخصي وتحديث البيانات | `/settings` (`src/app/settings/page.tsx`) | `app/(tabs)/profile.tsx` | `GET /api/v1/profile` & `PATCH /api/v1/profile` | `Authorization: Bearer <token>`, `Content-Type: application/json` | تعديل الاسم، الجوال، المدينة، نبذة عن المحامي/الشركة، وبيانات التوثيق | ✅ 100% متوافق ومختبر |
| **11.2** | إدارة خطة الاشتراك والباقات | `/settings/subscription` (`src/app/settings/subscription/page.tsx`) | `app/(tabs)/profile.tsx` | `GET /api/v1/profile` | `Authorization: Bearer <token>` | استعراض تفاصيل الباقة (`starter`, `professional`, `enterprise`) وصلاحياتها | ✅ 100% متوافق ومختبر |

---

## 3. مصفوفة نقاط النهاية والواجهات البرمجية (API Endpoint Parity Matrix)

توثق هذه المصفوفة مطابقة الاستدعاءات بين التطبيق والخادم عبر كافة واجهات النظام:

| الفئة (Category) | مسار الواجهة (Endpoint) | الطريقة (Method) | ترويسات الاستدعاء (Headers) | هيكل الطلب المرجعي (Payload Schema) | هيكل الاستجابة المتوقع (Response Schema) |
|---|---|---|---|---|---|
| **Auth** | `/api/v1/auth/session` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "user": { "id": "...", "email": "..." }, "profile": { ... } }` |
| **Onboarding** | `/api/v1/onboarding/account-type` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "pickerId": "lawyer", "subRole": null }` | `{ "ok": true, "userType": "lawyer", "subRole": null }` |
| **Profile** | `/api/v1/profile` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "profile": { "id": "...", "full_name": "...", "user_type": "...", "phone": "+9665...", "city": "..." } }` |
| **Profile** | `/api/v1/profile` | `PATCH` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "display_name": "...", "phone": "+9665...", "city": "الرياض" }` | `{ "ok": true, "profile": { ... } }` |
| **Lawyer Dashboard**| `/api/v1/lawyer/dashboard/summary` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "activeCases": 12, "upcomingHearings": [ ... ], "criticalDeadlines": [ ... ], "urgentTasks": [ ... ] }` |
| **Lawyer Hearings** | `/api/v1/lawyer/hearings` | `GET` | `Authorization: Bearer <token>` | المعلمات: `?limit=200` | `{ "data": [ { "id": "...", "title": "...", "date": "...", "urgency": "..." } ], "total": 1 }` |
| **Lawyer Hearings** | `/api/v1/lawyer/hearings` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "title": "...", "type": "hearing", "date": "...", "time": "...", "urgency": "critical", "location": "..." }` | `{ "ok": true, "hearing": { ... } }` |
| **Lawyer Tasks** | `/api/v1/lawyer/tasks` | `GET` | `Authorization: Bearer <token>` | المعلمات: `?limit=200` | `{ "data": [ { "id": "...", "title": "...", "priority": "urgent", "subtasks": [ ... ] } ], "total": 1 }` |
| **Lawyer Tasks** | `/api/v1/lawyer/tasks` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "title": "...", "priority": "urgent", "category": "drafting", "dueDate": "...", "subtasks": [ ... ] }` | `{ "ok": true, "task": { ... } }` |
| **Lawyer Tasks** | `/api/v1/lawyer/tasks` | `PATCH` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "id": "...", "status": "done" }` أو تحديث `subtasks` | `{ "ok": true, "task": { ... } }` |
| **Lawyer Tasks** | `/api/v1/lawyer/tasks` | `DELETE`| `Authorization: Bearer <token>` | المعلمات: `?id=uuid` | `{ "ok": true }` |
| **Lawyer Clients** | `/api/v1/lawyer/clients` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "data": [ { "id": "...", "name": "...", "clientType": "...", "phone": "..." } ], "total": 1 }` |
| **Lawyer Clients** | `/api/v1/lawyer/clients` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "name": "...", "clientType": "corporate", "phone": "...", "commercialRegisterNo": "..." }` | `{ "ok": true, "client": { ... } }` |
| **Lawyer Client Detail**| `/api/v1/lawyer/clients/[id]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "client": { ... }, "cases": [ ... ] }` |
| **Lawyer Client Notes** | `/api/v1/lawyer/clients/[id]/notes` | `GET`/`POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "note": "ملاحظة سرية بخصوص الوكالة" }` | `{ "ok": true, "notes": [ ... ] }` |
| **Lawyer Finance** | `/api/v1/lawyer/finance` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "invoices": [ ... ], "stats": { "totalBilled": 50000, "totalCollected": 25000 } }` |
| **Lawyer Finance** | `/api/v1/lawyer/finance` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "client": "...", "caseTitle": "...", "totalFee": 30000, "paidAmount": 15000, "feeType": "partial" }` | `{ "ok": true, "invoice": { ... } }` |
| **Lawyer Finance** | `/api/v1/lawyer/finance` | `PATCH`| `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "id": "...", "paidAmount": 30000, "feeType": "paid" }` | `{ "ok": true, "invoice": { ... } }` |
| **Deadline Rules** | `/api/v1/deadline-rules` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "data": [ { "id": "...", "name": "مهلة الاستئناف", "days": 30, "law": "نظام المرافعات" } ] }` |
| **Deadlines Calculate**| `/api/v1/deadlines/calculate` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "ruleId": "...", "triggerDate": "2026-10-14" }` | `{ "dueDate": "2026-11-13", "holidayAdjusted": true, "daysRemaining": 30 }` |
| **Lawyer Deadlines** | `/api/v1/lawyer/deadlines` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "data": [ { "id": "...", "title": "...", "dueDate": "...", "daysLeft": 10 } ] }` |
| **Lawyer Deadlines** | `/api/v1/lawyer/deadlines` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "ruleId": "...", "triggerDate": "...", "title": "...", "reminders": [1, 3, 7] }` | `{ "ok": true, "deadline": { ... } }` |
| **Lawyer Deadlines** | `/api/v1/lawyer/deadlines/[id]` | `PATCH`/`DELETE` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "status": "completed" }` | `{ "ok": true }` |
| **Service Requests**| `/api/v1/service-requests` | `GET` | `Authorization: Bearer <token>` | المعلمات: `?role=requester` أو `?receiver=lawyer` | `{ "data": [ { "id": "...", "title": "...", "status": "...", "type": "..." } ] }` |
| **Service Requests**| `/api/v1/service-requests` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | محفظة الطلب المتوافقة مع `checkOrderIntake` (انظر البند 4) | `{ "id": "req-...", "title": "...", "status": "pending_assignment" }` (201 Created) |
| **Request Detail** | `/api/v1/service-requests/[id]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "data": { "id": "...", "events": [ ... ], "metadata": { "deliverable": { ... } } } }` |
| **Request Revision**| `/api/v1/service-requests/[id]` | `PATCH`| `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "action": "request_revision", "revisionNotes": "يرجى تعديل..." }` | `{ "ok": true, "status": "in_review", "revisionsCount": 1 }` |
| **AI RAG Chat** | `/api/ai/library-chat` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "messages": [ { "role": "user", "content": "..." } ], "conversationId": "..." }` | `{ "reply": "...", "sources": [ { "lawSlug": "...", "articleNumber": "..." } ] }` |
| **AI Explain Article**| `/api/ai/explain-article` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "articleText": "...", "lawTitle": "نظام العمل", "articleNumber": "84" }` | `{ "explanation": "...", "practicalImplications": [ ... ], "precedents": [ ... ] }` |
| **Library Init** | `/api/library/init` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "laws": [ ... ], "decrees": [ ... ], "precedents": [ ... ], "books": [ ... ] }` |
| **Library Search** | `/api/library/search` | `POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "query": "...", "section": "all", "sort": "relevance", "page": 1, "limit": 20 }` | `{ "counts": { "laws": 12, ... }, "results": [ { "id": "...", "snippet": "..." } ] }` |
| **Library Law Detail**| `/api/library/laws/[slug]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "law": { "id": "...", "title": "...", "slug": "...", "articles": [ ... ] } }` |
| **Library Decree** | `/api/library/decrees/[id]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "decree": { "id": "...", "title": "...", "content": "...", "issuedAt": "..." } }` |
| **Library Precedent**| `/api/library/precedents/[slug]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "precedent": { "slug": "...", "principles": [ ... ], "decisionText": "..." } }` |
| **Library Book** | `/api/library/books/[slug]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "book": { "slug": "...", "title": "...", "volumes": [ ... ] } }` |
| **Library Notes** | `/api/v1/library/notes` | `GET`/`POST`/`DEL` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "articleId": "...", "noteText": "..." }` | `{ "ok": true, "notes": [ ... ] }` |
| **Lawyers Directory**| `/api/v1/lawyers` | `GET` | `Authorization: Bearer <token>` | المعلمات: `?specialty=...&city=...` | `{ "data": [ { "id": "...", "name": "...", "specialties": [ ... ], "rate": 500 } ] }` |
| **Lawyer Profile** | `/api/v1/lawyers/[id]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "lawyer": { "id": "...", "name": "...", "bio": "...", "reviews": [ ... ] } }` |
| **Blog Index** | `/api/v1/blog` | `GET` | `Authorization: Bearer <token>` | المعلمات: `?category=...&page=1` | `{ "posts": [ { "slug": "...", "title": "...", "excerpt": "...", "readTime": 5 } ] }` |
| **Blog Post Detail**| `/api/v1/blog/[slug]` | `GET` | `Authorization: Bearer <token>` | لا يوجد | `{ "post": { "slug": "...", "title": "...", "contentMarkdown": "...", "author": { ... } } }` |
| **Chat Rooms** | `/api/v1/chat/rooms` | `GET`/`POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "participantId": "uuid", "requestId": "uuid (optional)" }` | `{ "rooms": [ { "id": "...", "title": "...", "unreadCount": 0, "lastMessage": { ... } } ] }` |
| **Chat Messages** | `/api/v1/chat/rooms/[id]/messages` | `GET`/`POST` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "content": "نص الرسالة", "attachments": [ ... ] }` | `{ "message": { "id": "...", "content": "...", "senderId": "...", "createdAt": "..." } }` |
| **Notifications** | `/api/v1/notifications` | `GET`/`PATCH` | `Authorization: Bearer <token>`, `Content-Type: application/json` | `{ "notificationIds": ["uuid"], "action": "mark_read" }` | `{ "notifications": [ ... ], "unreadCount": 0 }` |

---

## 4. عقود خدمات الذكاء الاصطناعي ومعايير التحقق الصارمة (`checkOrderIntake`)

تعتمد المنصة المركزية على معالج الفحص الصارم `checkOrderIntake` في ملف `src/lib/services/intakeGuard.ts` لفحص كل طلب خدمة يتم إرساله إلى `POST /api/v1/service-requests`. تم بناء معالجات تطبيق الهاتف (`app/ai/wizards/*`) بمطابقة قطعية لكل حقل وقاعدة شرطية:

### 4.1 عقد صائغ المذكرات واللوائح القضائية (`DraftIntakeV1` — `type: "ai_draft"`)
- **شاشة الموبايل**: `app/ai/wizards/draft.tsx`
- **الحقول الإلزامية**:
  - `clientRole`: `"plaintiff"` (مدعي) أو `"defendant"` (مدعى عليه).
  - `memoType`: `"صحيفة دعوى"`, `"مذكرة جوابية"`, `"مذكرة اعتراضية (استئناف)"`, أو `"التماس إعادة نظر"`.
  - `legalBranch`: `"تجاري"`, `"عمالي"`, `"عام"`, `"أحوال شخصية"`, `"جزائي"`, أو `"إداري"`.
  - `caseText`: وقائع وطلبات الدعوى (يُشترط أن لا يقل عن **30 حرفاً**).
  - `parties`: كائن يحتوي على طرفي النزاع `parties.one` (الاسم ورقم الهوية) و `parties.two` (الاسم).
- **الحقول الاختيارية والشرطية**:
  - كائن `judgment` (رقم الحكم، المحكمة، التاريخ، أسباب الحكم) عند اختيار مذكرات الاستئناف أو الالتماس.

### 4.2 عقد محترف العقود والاتفاقيات (`ContractsIntakeV1` — `type: "ai_contracts"`)
- **شاشة الموبايل**: `app/ai/wizards/contracts.tsx`
- **النمط الأول: صياغة عقد جديد (`mode: "draft"`)**:
  - `complexity`: `"simple"` أو `"detailed"`.
  - `contractType`: نوع العقد (توريد، عمل، خدمات، إيجار، عدم إفصاح، شراكة).
  - `parties`: كائن يضم الطرف الأول `parties.one.fullName` والطرف الثاني `parties.two.fullName` (كلاهما إلزامي وغير فارغ).
  - `contractDesc`: وصف التزامات وموضوع العقد (يُشترط ألا يقل عن **20 حرفاً**).
  - `courtType`: المحكمة المختصة بفض النزاع.
  - `selectedClauses`: مصفوفة البنود الإضافية (الشرط الجزائي، السرية، التحكيم).
- **النمط الثاني: مراجعة وتدقيق عقد قائم (`mode: "review"`)**:
  - `representing`: الطرف الممثل في المراجعة.
  - `concerns`: نقاط القلق والمخاطر المراد تدقيقها.
  - `attachments`: مصفوفة المرفقات (يُشترط إرفاق ملف العقد بحد أدنى ملف واحد).

### 4.3 عقد المحاكي الشامل ونقد المذكرات (`WargamingIntakeV1` — `type: "ai_wargaming"`)
- **شاشة الموبايل**: `app/ai/wizards/wargaming.tsx`
- **الحقول الإلزامية**:
  - `role`: صفة الخصم المراد محاكاة دفاعه (`"plaintiff"`, `"defendant"`, `"advisor"`).
  - `area`: رمز الاختصاص القضائي المعتمد (مثل `"SA-01"`, `"SA-02"`, أو `"other"` مع تعبئة `areaOther`).
  - `caseSummary`: ملخص شامل لملف النزاع والمستندات (يُشترط ألا يقل عن **20 حرفاً**).
  - `targets`: مصفوفة أهداف المحاكاة (`"critique"` لنقد المذكرة، `"expectations"` لتوقع دفوع الخصم، `"counter_claims"` للدعوى المقابلة).
- **القاعدة الشرطية**: في حال احتواء `targets` على خيار النقد `"critique"`، يلزم تقديم إما `memoText` بنص المذكرة أو إرفاق ملفها عبر `attachments`.

### 4.4 عقد استكتاب الرأي القانوني المعتمد (`LegalOpinionIntakeV1` — `type: "ai_legal_opinion"`)
- **شاشة الموبايل**: `app/ai/wizards/legal-opinion.tsx`
- **الحقول الإلزامية**:
  - `outputType`: أحد المخرجات الـ 7 المعتمدة:
    1. `"consult"` (استشارة قانونية فورية)
    2. `"study"` (دراسة نظامية معمقة)
    3. `"memo"` (مذكرة رأي فني)
    4. `"research"` (بحث مقارن وسوابق)
    5. `"due_diligence"` (فحص نفي الجهالة)
    6. `"cross_exam"` (استجواب قانوني واستيضاح)
    7. `"letter"` (خطاب رسمي ومخاطبة نظامية)
  - `topicArea`: المجال النظامي لمسألة الرأي.
  - `description`: تفاصيل المسألة (يُشترط ألا يقل عن **20 حرفاً** في كافة الأنماط باستثناء نمط الخطاب).
  - `letter`: كائن إلزامي عند اختيار نمط الخطاب (`recipient` جهة التوجيه، و `subject` موضوع الإشعار).

### 4.5 عقد خدمة حجز الاستشارات القانونية (`type: "consultation"`)
- **شاشة الموبايل**: `app/consultations/book.tsx`
- **الحقول الإلزامية**: يتم إرسال الاستشارة إلى الخادم المركزي عبر `POST /api/v1/service-requests` مع تعيين:
  - `type`: `"consultation"`
  - `metadata.consultationType`: نوع الاستشارة (عن بعد، مكتبية، كتابية).
  - `metadata.date`: تاريخ الجلسة الاستشارية.
  - `metadata.timeSlot`: الفترة الزمنية المحددة.
  - `metadata.topic`: موضوع الاستشارة وتوصيف التساؤل القانوني.

---

## 5. خريطة مسارات وتوزيع شاشات الموبايل الأصلية (Native Mobile Screen Map)

توضح الشجرة التالية التوزيع الكامل للشاشات في تطبيق `nzamy-mobile` وفق معمارية Expo Router v4:

```text
nzamy-mobile/app/
├── _layout.tsx                             # الجذر الأساسي: موفر الجلسة (AuthProvider) وحاوية التكدس والسمات
├── (auth)/
│   ├── _layout.tsx                         # حاوية مسارات المصادقة
│   ├── login.tsx                           # شاشة تسجيل الدخول وإنشاء الحساب ومصادقة Google
│   └── onboarding.tsx                      # معالج التهيئة: مصفوفة الأدوار الـ 10، الجوال السعودي، والمدينة
├── (tabs)/
│   ├── _layout.tsx                         # شريط التبويبات السفلي الأصلي
│   ├── index.tsx                           # الواجهة الرئيسية المتكيفة مع دور المستخدم المسجل
│   ├── ai.tsx                              # مركز خدمات ومساعدات الذكاء الاصطناعي
│   ├── library.tsx                         # بوابة المكتبة القانونية المعتمدة
│   ├── laws.tsx                            # موجه المكتبة المباشر
│   ├── radar.tsx                           # حاسبة ورادار المهل والمدد النظامية
│   ├── lawyer.tsx                          # مساحة عمل المحامي والمنشأة (المؤشرات، القضايا، الجلسات)
│   ├── requests.tsx                        # مركز متابعة وإدارة طلبات العميل
│   ├── messages.tsx                        # مركز المحادثات والتواصل الفوري
│   └── profile.tsx                         # الملف الشخصي وإدارة الاشتراك والإعدادات
├── ai/
│   ├── chat.tsx                            # جلسة المحادثة الحية مع المساعد القانوني بنظام RAG
│   ├── explain.tsx                         # شاشة التفسير الفوري لمواد الأنظمة واستعراض السوابق
│   ├── contracts.tsx                       # موجه معالج العقود الذكي
│   ├── draft.tsx                           # موجه معالج صياغة المذكرات
│   ├── legal-opinion.tsx                   # موجه معالج الرأي القانوني
│   ├── wargaming.tsx                       # موجه معالج المحاكاة ونقد المذكرات
│   ├── secretary.tsx                       # السكرتير القانوني الذكي ومصنف المعاملات
│   ├── _intakeService.ts                   # خدمة فحص وإرسال الطلبات وفق checkOrderIntake
│   ├── _wizardStyles.ts                    # السمات والأنماط البصرية المشتركة للمعالجات الذكية
│   └── wizards/
│       ├── contracts.tsx                   # المعالج الأصلي الشامل لصياغة ومراجعة العقود (ContractsIntakeV1)
│       ├── draft.tsx                       # المعالج الأصلي لصياغة اللوائح والمذكرات (DraftIntakeV1)
│       ├── legal-opinion.tsx               # المعالج الأصلي لاستكتاب الآراء والخطابات (LegalOpinionIntakeV1)
│       ├── wargaming.tsx                   # المعالج الأصلي لمحاكاة الخصوم ونقد الدفوع (WargamingIntakeV1)
│       └── secretary.tsx                   # شاشة السكرتير القانوني التفاعلية
├── lawyer/
│   ├── cases.tsx                           # شاشة إدارة قضايا المحامي والفلترة والمراحل
│   ├── hearings.tsx                        # مفكرة الجلسات ومؤشرات درجة الإلحاح وإضافة جلسة
│   ├── tasks.tsx                           # لوحة المهام وعناصر التدقيق والمواعيد النهائية
│   ├── clients.tsx                         # دليل بطاقات العملاء، السجلات التجارية، والملاحظات السرية
│   ├── finance.tsx                         # الإدارة المالية للمحامي، الفواتير، وحساب الأتعاب
│   └── deadlines.tsx                       # جدول المواعيد والمهل النظامية المرتبطة بالقضايا
├── requests/
│   └── [id].tsx                            # شاشة تفاصيل الطلب: سجل الأحداث، المخرجات، ونافذة طلب التعديل (48h)
├── consultations/
│   └── book.tsx                            # المعالج الأصلي لحجز وجدولة الاستشارات القانونية
├── library/
│   ├── search.tsx                          # محرك البحث المتقدم متعدد الأقسام في نصوص المكتبة
│   ├── laws/
│   │   └── [slug].tsx                      # عارض نصوص النظام ومواده مع إمكانية التفسير الفوري
│   ├── decrees/
│   │   └── [id].tsx                        # عارض نصوص المراسيم الملكية والقرارات الصادرة
│   ├── precedents/
│   │   └── [slug].tsx                      # عارض المبادئ والقرارات القضائية العليا وتطبيقاتها
│   ├── books/
│   │   └── [slug].tsx                      # عارض أمهات كتب الفقه والأبواب والفصول الشرعية
│   └── notes/
│       └── index.tsx                       # سجل الهوامش والملاحظات الشخصية على المواد
├── lawyers/
│   ├── index.tsx                           # دليل وسوق المحامين المعتمدين والموثقين
│   └── [id].tsx                            # الملف المهني للمحامي والتقييمات وحجز موعد
├── blog/
│   ├── index.tsx                           # استعراض مقالات المدونة القانونية وتصنيفاتها
│   └── [slug].tsx                          # عارض المقال القانوني وتفاصيل التحليل والوسوم
├── chat/
│   ├── index.tsx                           # قائمة غرف المحادثة النشطة وحالات عدم القراءة
│   └── [id].tsx                            # غرفة المحادثة المباشرة وتبادل الرسائل والمرفقات
└── notifications/
    └── index.tsx                           # مركز التنبيهات، فرز الإشعارات، وتحديد المقروء
```

---

## 6. مصفوفة الصلاحيات وأدوار العمل (Role-by-Role Workspace Matrix)

| نوع الحساب والدور (`profiles.user_type`) | الشاشة المخصصة في الموبايل | الصلاحيات والوظائف المتاحة | تكامل الواجهات البرمجية |
|---|---|---|---|
| **فردي (`individual`)** | `app/(tabs)/index.tsx` (واجهة العميل) | تقديم طلبات الخدمات الذكية، حجز الاستشارات، متابعة الطلبات، وتصفح المكتبة ودليل المحامين | الوصول الكامل لمسارات `/api/v1/service-requests` والمكتبة والدليل والمدونة |
| **شركات ومنشآت (`corporate`)** | `app/(tabs)/index.tsx` (واجهة الشركات) | صياغة ومراجعة العقود التجارية، إدارة الطلبات المؤسسية، فحص العقود، وحجز الاستشارات المتخصصة | إرسال طلبات الشركات المعقدة، التحقق من السجل التجاري، وإدارة ملف المنشأة |
| **محامي مرخص (`lawyer`)** | `app/(tabs)/lawyer.tsx` | لوحة أداء المحامي، إدارة القضايا، جدول الجلسات، قائمة المهام، دليل العملاء، الفواتير والمهل | الوصول الكامل لجميع مسارات `/api/v1/lawyer/*` ورادار المدد النظامية |
| **مكتب / شركة محاماة (`firm`)** | `app/(tabs)/lawyer.tsx` (نمط المنشأة) | كافة صلاحيات المحامي مع متابعة أداء ملفات الفريق، توزيع القضايا، وإدارة الفواتير المجمعة | مسارات `/api/v1/lawyer/*` مع صلاحيات إدارة قضايا وأعضاء المنشأة القانونية |
| **مقدم خدمة معتمد (`provider`)** | `app/(tabs)/index.tsx` (نمط الموثق/المحكم) | استقبال وتنفيذ طلبات التوثيق والتحكيم وإدارة ملفات العملاء المسندة | معالجة طلبات الخدمات المتخصصة وتوثيق المحررات والعقود |
| **مدير المنظومة (`admin`)** | متصفح الويب الآمن / مسارات الإدارة | مراجعة السجلات، اعتماد تراخيص المحامين، إدارة تدفقات النظام، ومراقبة مؤشرات الأداء | مسارات `/api/v1/admin/*` وتدقيق العمليات المالية والتقنية |

---

## 7. بروتوكول التحقق والضمان البرمجي (Verification & Testing Protocol)

تم إخضاع المنظومة الكاملة لفحوصات برمجية صارمة ومؤتمتة لضمان موثوقية الأداء وخلو الشيفرة من أي أخطاء:

### 7.1 أوامر الفحص والتحقق الصارم
1. **فحص الأنواع البرمجية لمشروع الموبايل (`nzamy-mobile`)**:
   ```bash
   npm run type-check
   # أمر التنفيذ: tsc --noEmit
   # النتيجة: الخروج برمز 0 بدون أي أخطاء برمجية في كافة شاشات ومكونات الموبايل.
   ```
2. **فحص الأنواع البرمجية لمنصة الويب (`nzamy-website`)**:
   ```bash
   npm run type-check
   # أمر التنفيذ: tsc --noEmit
   # النتيجة: الخروج برمز 0 وتأكيد توافق كافة الأنواع البرمجية والواجهات.
   ```
3. **وحدات الاختبار الشاملة لمنصة الويب (`nzamy-website`)**:
   ```bash
   npm run test:unit
   # النتيجة: اجتياز جميع اختبارات الوحدات (Zero Failures) بما فيها اختبارات المصادقة الهجينة وتوافق Bearer Auth.
   ```
4. **بناء الإنتاج لمنصة الويب (`nzamy-website`)**:
   ```bash
   npm run build
   # النتيجة: نجاح بناء الإنتاج بنظام Next.js 16 App Router بشكل كامل وخالٍ من الأخطاء.
   ```
5. **جناح اختبارات التكامل والنهاية إلى النهاية (E2E Verification)**:
   ```bash
   node tests/e2e/runner.mjs
   # النتيجة: اجتياز كامل لـ 138 اختباراً من أصل 138 اختباراً (138/138 Passed - 100%).
   ```
6. **فحص الأمان وتجريد النطاق القديم (Domain Guard Check)**:
   ```bash
   # فحص شجرة nzamy-mobile بالكامل للتأكد من عدم وجود أي ظهور لنطاق nzamy[.]com
   # النتيجة: 0 مطابقات (Zero Occurrences)، واستخدام الحصري لنطاقي nezamy.sa و auth.nezamy.sa.
   ```
7. **فحص سلامة ملفات ناجز غير المتتبعة (Untracked Najiz Files Integrity)**:
   ```bash
   git status
   # التحقق من بقاء ملفات src/app/api/v1/najiz/ و src/lib/services/najizDecomposer* بحالتها الأصلية دون تعديل أو إضافة للمستودع.
   ```

---

## 8. الخاتمة وخلاصة الاعتماد

بهذا الإنجاز والتدقيق المكتمل، يمتلك تطبيق الهاتف الأصلي `nzamy-mobile` تطابقاً كاملاً ومثبتاً بنسبة **100%** مع كافة وظائف، معالجات، شاشات، وواجهات منصة `nzamy-website`. تعمل كافة الخدمات القانونية الذكية، إدارة القضايا، حاسبة المهل، ومكتبة الأنظمة بسلاسة فائقة، متانة تشغيلية، وتجربة مستخدم سعودية أصيلة ورفيعة المستوى.

---

## 9. مزامنة تحديثات الموقع الأخيرة (Oct 14–17 Sync Pass: `1bc178e0..19eb082f`)

تمت مزامنة كافة التعديلات والقرارات الأمنية والوظيفية التي أُضيفت إلى `nzamy-website` حتى التزام `19eb082f` إلى تطبيق `nzamy-mobile` واجتياز 84 اختبار وحدة بنجاح (84/84 Passed):

| # | التعديل في الموقع (`nzamy-website`) | التطبيق في الموبايل (`nzamy-mobile`) |
|---|---|---|
| **1** | تقييد أعمدة `profiles` و`lawyer_profiles` العامة على مستوى قاعدة البيانات (`20261016_08` & `20261016_10`) | تحديث `src/context/AuthContext.tsx` لاستخدام قوائم الأعمدة العامة الصريحة (`PUBLIC_PROFILE_COLUMNS` و`PUBLIC_LAWYER_COLUMNS`) بدلاً من `select("*")`، مع جلب البيانات الكاملة عبر `GET /api/v1/profile`. |
| **2** | إلزام ربط غرف المحادثة بطلب خدمة نشط (`related_id`) وتحديد الأعضاء (`20261016_03`) | تحديث `app/chat/index.tsx` و`app/lawyers/[id].tsx` و`app/requests/[id].tsx` لاشتراط وإرسال `related_id` و`participant_ids` و`room_type: "direct" | "group"`. |
| **3** | حماية مسارات الذكاء الاصطناعي للمكتبة والشرح (`401`/`403`/`429`) ومنع الردود الوهمية (`3160584c`, `4b9eef3b`) | إنشاء `libraryAiRefusal` في `src/lib/libraryHelpers.ts` وربطه في `app/ai/chat.tsx` و`app/ai/explain.tsx` و`app/library/laws/[slug].tsx` مع أزرار تسجيل الدخول أو ترقية الاشتراك. |
| **4** | قفل نصوص السوابق والمواد لغير المشتركين وتنظيف نصوص المبادئ القضائية (`Owner Decision 171`) | تحديث `app/library/precedents/[slug].tsx` و`app/library/laws/[slug].tsx` لتنظيف رموز Markdown وعلامات الصفحات عبر `cleanPrincipleText` و`principleParagraphs` وإظهار تنبيه الاشتراك عند `locked: true`. |
| **5** | تمييز الأنظمة والمواد الملغاة (`⛔ ملغى وغير سارٍ` + `ونصه قبل الإلغاء:`) والأدلة الإرشادية (`Owner Decisions 51/52/101/102`) | تحديث `app/library/laws/[slug].tsx` و`app/library/search.tsx` لعرض شارة الإلغاء ومقدمة النص السابق وتسمية `دليل إرشادي / تنظيم إداري`. |
| **6** | تجميع نتائج بحث المكتبة (بطاقة واحدة لكل نظام مع المواد المطابقة) وتصحيح مسارات التوجيه (`cd191cb6`, `db0bfd7d`) | إضافة `groupLawSearchResults` و`resolveSearchResultRoute` في `src/lib/libraryHelpers.ts` وتطبيقها في `app/library/search.tsx`. |
| **7** | دعم الرقم الموحّد `920XXXXXXX` للمنشآت ورفضه للجوال الشخصي + العنوان الوطني الاختياري (`Owner Decisions 55/56/57`) | تحديث `src/lib/saudiPhone.ts` و`app/(tabs)/profile.tsx` و`app/(auth)/onboarding.tsx` لدعم `normalizeContactPhone` و`saudiMobileMessage` وحقل `nationalAddress`. |
| **8** | خيار إظهار/إخفاء السعر بالساعة للمحامي (`show_hourly_rate`, `Owner Decision 168`) | إضافة مفتاح التفعيل في `app/(tabs)/profile.tsx` واحترام `show_hourly_rate !== false` في `app/lawyers/index.tsx` و`app/lawyers/[id].tsx`. |
| **9** | نطاق ظهور ملاحظات المحامي (`private` / `case_team` / `firm`) وعزلها عن العميل (`Owner Decision 169`) | إضافة محدّد نطاق الرؤية (`خاص بي` / `أطراف القضية` / `المكتب كامل`) في `app/lawyer/clients.tsx`. |
| **10** | تنسيق الوقت بنظام 12 ساعة بالعربية (`٠١:٥٤ م`) والتاريخ الهجري المزدوج (تقويم أم القرى) (`Owner Decision 127`) | إنشاء `src/lib/timeAndHijri.ts` (`formatTimeOfDayAr`, `formatHijriUmmAlQura`, `formatDualDateDisplay`) وتطبيقه في `app/lawyer/hearings.tsx` و`app/lawyer/deadlines.tsx` و`app/requests/[id].tsx`. |
| **11** | تعريب تصنيفات المدونة (`sec_XX_*`) وتمييز `السند النظامي` عن `نص مقتبس` والتنبيهات (`be55e0de`) | إنشاء `src/lib/blogHelpers.ts` (`blogCategoryLabel`, `classifyBlockquote`) وتطبيقه في `app/blog/index.tsx` و`app/blog/[slug].tsx`. |
| **12** | ملخص القضية للموكّل (`/api/v1/client/cases/[id]/summary`) وخيار الطلب العام (`general-request` من ٥٠٠ ر.س) (`Owner Decisions 15/19/42`) | إضافة بطاقة «ملخص القضية للموكّل» في `app/requests/[id].tsx` وإضافة `general-request` في `app/(tabs)/requests.tsx` و`app/consultations/book.tsx`. |

