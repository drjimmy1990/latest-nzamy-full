# تجربة خادم MCP لنظامي محليًا (بلا رفع وبلا توكن حقيقي)

> الهدف: تشغّل بنفسك خادم نظامي (MCP) على جهازك، وتوصّله بـClaude Desktop إن شئت، وكل ما يردّ عليه **منصة وهمية** ببيانات تجريبية على `127.0.0.1`. لا يمسّ nezamy.sa ولا Supabase ولا n8n، ولا يحتاج Docker، ولا يستعمل أي توكن حقيقي.
>
> **ما لا يفعله هذا الدليل:** لا يعدّل Claude Desktop من تلقاء نفسه. تعديل ملف إعداداته (الخطوة ٥) اختياري وبيدك أنت.

## ما تحتاجه
- Node 20 أو أحدث (عندك 24). تحقق: `node -v`.
- مجلد المشروع: `...\.claude\worktrees\mcp-sayegh-v2-a707a4\mcp` (أو مكانه بعد الدمج). كل الأوامر أدناه من داخل `mcp`.
- اتصال بالإنترنت **مرة واحدة** لـ`npm install` فقط. بعدها كل شيء محلي.

## الخطوة ١ — التثبيت والبناء (مرة واحدة)
```powershell
cd nezamy-client
npm install
npm run build
cd ..\nezamy-mcp
npm install
```
هذا يثبّت الحزم داخل مجلدَي المشروع فقط (`node_modules`) ولا يغيّر شيئًا في الجهاز نفسه.

## الخطوة ٢ — تحقّق أن كل شيء سليم (اختياري، دقيقة واحدة)
```powershell
cd ..\nezamy-client; npx tsx --test test/*.test.ts      # المتوقع: 20 نجاح
cd ..\nezamy-mcp;    npm run typecheck                   # المتوقع: لا أخطاء
npx tsx --test test/*.test.ts                            # المتوقع: 56 نجاح
```

## الخطوة ٣ — تجربة سريعة بأمر واحد
```powershell
npm run smoke
```
يشغّل منصة وهمية + خادم stdio الحقيقي (كما سيشغّله Claude Desktop) ويستدعيه بعميل MCP الرسمي: يعرض ١١ أداة، ثم `account_standing`، ثم **عرض سعر** `run_sayegh`، ثم التشغيل بعد التأكيد، ثم النتيجة (مذكرة + تقرير المحامي الداخلي + نسخة ناجز). النهاية الصحيحة: `SMOKE OK`.

## الخطوة ٤ — تشغيل المنصة الوهمية بنفسك (نافذة منفصلة)
```powershell
npm run mock
```
يطبع عنوانها `http://127.0.0.1:8799` وتوكنين **وهميين** (لا قيمة لهما خارج هذه التجربة):

| التوكن | الاستعمال |
|---|---|
| `nzy_pat_test_token_0123456789` | محامٍ عادي: يرى أدوات المكتبة والصياغة القديمة، و**يُرفض** من أدوات v2 («للمشرفين فقط») |
| `nzy_pat_staff_token_0123456789` | مشرف: يفتح `run_sayegh` و`read_case_dossier` و`add_to_research_pool` |

اتركها تعمل، وأوقفها بـ`Ctrl+C`. (المنفذ يتغير بمتغير `PORT`.)

لتجربة الخادم مباشرة بلا Claude، في نافذة أخرى:
```powershell
$env:NEZAMY_BASE_URL = "http://127.0.0.1:8799"
$env:NEZAMY_ALLOW_INSECURE_LOCALHOST = "1"
$env:NEZAMY_TOKEN = "nzy_pat_staff_token_0123456789"
npm run start:stdio
```
ثم الصق سطرًا JSON واحدًا (مثلًا `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`) واضغط Enter. الخادم لا يطبع على stdout إلا ردود JSON-RPC.

> `NEZAMY_ALLOW_INSECURE_LOCALHOST=1` يسمح فقط بـ`http` إلى `127.0.0.1/localhost`؛ العميل يرفض أي مضيف آخر بلا https حتى لو ضُبط.

## الخطوة ٥ — إضافته إلى Claude Desktop محليًا (اختياري، بقرارك)
هذا يعدّل ملفًا على جهازك، فاعمل نسخة احتياطية أولًا.

١. أغلق Claude Desktop تمامًا (من أيقونة الشريط أيضًا).
٢. افتح `%APPDATA%\Claude\claude_desktop_config.json` (أنشئه إن لم يوجد) وانسخ منه نسخة احتياطية بجانبه.
٣. أضف الخادم تحت `mcpServers` (غيّر `C:/المسار/إلى/mcp` إلى مسار مجلد `mcp` عندك، بشرطات مائلة `/`):
```json
{
  "mcpServers": {
    "nezamy-local-test": {
      "command": "node",
      "args": [
        "--import",
        "file:///C:/المسار/إلى/mcp/nezamy-mcp/node_modules/tsx/dist/loader.mjs",
        "C:/المسار/إلى/mcp/nezamy-mcp/src/index.ts",
        "stdio"
      ],
      "env": {
        "NEZAMY_BASE_URL": "http://127.0.0.1:8799",
        "NEZAMY_ALLOW_INSECURE_LOCALHOST": "1",
        "NEZAMY_TOKEN": "nzy_pat_staff_token_0123456789"
      }
    }
  }
}
```
٤. شغّل المنصة الوهمية (الخطوة ٤) **قبل** فتح Claude Desktop، ثم افتحه. يجب أن يظهر الخادم `nezamy-local-test` في قائمة الأدوات (أيقونة المطرقة/الموصلات).
٥. جرّب في محادثة: «اعرض رصيدي في نظامي» ثم «حضّر لائحة استئناف بهذه الوقائع…». ستعرض Claude **السعر أولًا** وتطلب موافقتك قبل `confirm_charge=true`؛ وكل ذلك على الأرقام الوهمية.

**للتراجع:** احذف مدخل `nezamy-local-test` (أو استرجع النسخة الاحتياطية) وأعد تشغيل Claude Desktop.

إن لم يظهر الخادم: افتح سجل Claude Desktop (`%APPDATA%\Claude\logs\mcp-server-nezamy-local-test.log`) — غالبًا السبب مسار خاطئ أو أن Node غير ظاهر في PATH (جرّب مسار `node.exe` كاملًا في `command`).

## ما الذي يُثبته هذا الاختبار وما لا يُثبته
**يثبت:** الأدوات الـ١١ وتواقيعها، حارس أدوات المشرفين، عرض السعر قبل الخصم، مفتاح التكرار (لا خصم مزدوج)، عرض مخرج الصائغ v2 (مذكرة نظيفة منفصلة عن تقرير المحامي وعن نسخة ناجز)، حماية المكتبة (مقتطفات، حد القراءة اليومي)، والتشغيل الفعلي عبر stdio وعبر SDK الرسمي وعبر HTTP.

**لا يثبت:** أن المنصة الحقيقية تردّ بنفس الشكل (مسارات `/api/v1/ext/*` لم تُبنَ بعد — انظر `EXT_RUNS_SPEC.md`)، ولا أن n8n يخرج هذا الشكل فعلًا (الوورك فلو لم يُستورد بعد؛ الاختبار يعتمد على شكله الموثّق)، ولا OAuth (التوكن اليدوي فقط).

## أوضاع أخرى
- **HTTP محلي** (للاختبار فقط): `npm run start:http` (المنفذ 8787، متغير `PORT`)، وكل طلب يحمل `Authorization: Bearer <توكن>`. مسار الخادم `/mcp`.
- ملاحظة بيئة: على هذا الجهاز لوحظ أن طبقة على loopback تعيد كتابة ردود `Content-Length` الصريحة إلى `chunked` دون إعادة تقطيع الجسم، فتنكسر عملاء `fetch`. محوّل الـSDK (`server-sdk.ts`) يتفاداه بإرسال الردود مقطّعة. إن رأيت `terminated` أو `Invalid character in chunk size` من عميل HTTP فهذا سببه.
