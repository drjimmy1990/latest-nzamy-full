# خريطة إعادة الاستخدام (مسودة — لم تُطبَّق)

كل المسارات نسبةً إلى `src/` في مستودع المنصة. لا شيء هنا يُنفَّذ قبل مراجعة المبرمج.

| مسار v1 | ما يُعاد استخدامه | ملاحظة أمنية |
|---|---|---|
| (كل المسارات) | `lib/auth/apiAuth.ts` (نمط requireApiUser)، `lib/auth/accountFreeze` | بديل الجلسة: التوكن؛ فحص التجميد يُعاد يدويًا لأن proxy.ts لا يحمي غير الكوكيز |
| library/search | `lib/ai/graphService.ts` (searchLegalGraph) + `app/api/library/scoped-search/scopedSearch.ts` (shapeHit) | يُطبّق الـpaywall والحصة نفسها؛ routing: graph أو keyword |
| library/articles/{id} | `lib/library/readQuotaServer.ts` (libraryReadQuotaHit)، `lib/library/libraryDocQuota.ts` (spendLibraryDocument)، `lib/library/deviceLimitServer.ts` (enforceLibraryDevice) | التوكن يُعدّ «جهازًا» عبر device_hash؛ قفل المكتبة والحصة اليومية/الساعية صراحةً |
| library/articles/{id}/neighbors | `lib/ai/graphService.ts` + جداول الجراف | نفس بوابات المقال؛ العمق ≤ 2 |
| citations/check | `lib/ai/citationCheck.ts` (checkCitations) | لا يعيد نصًا، حالة فقط؛ الحالات من المكتبة |
| account/standing | `lib/ai/pointsStanding.ts` | قراءة فقط |
| ai/runs/quote (جديد) | `lib/ai/pointsStanding.ts` + سجل الأدوات | يجب ألا يستدعي ai_start_run أبدًا |
| ai/runs (POST) | `lib/ai/runCore.ts` (startRunWith)، `lib/ai/n8nClient.ts`، wiring من `app/api/v1/ai/runs/route.ts` | مفتاح التكرار يُسبق بمعرّف التوكن؛ قائمة أدوات مسموحة فقط |
| ai/runs/{id} (GET) | `lib/ai/runVisibility.ts` (runForViewer) | القراءة عبر service role بعد التحقق من user_id يدويًا (لا RLS للتوكن) |
| إدارة التوكنات (واجهة) | جديد: صفحة حساب لإنشاء/إلغاء PAT | يُعرض التوكن مرة واحدة |

## ثغرات يجب سدّها صراحةً
1. `proxy.ts` لا يطبّق قفل المكتبة إلا على الكوكيز → كل مسار ext/library يستدعي البوابات بنفسه.
2. لا RLS: كل استعلام بـservice role يجب أن يقيّد بـ`user_id` الخاص بالتوكن.
3. حدّ لكل توكن عبر `lib/rateLimitRoutes.ts`.
4. ترتيب المهاجرة: `migration.sql` يمكن تطبيقه قبل الكود دون أثر.
