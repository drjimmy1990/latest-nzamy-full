# ربط نظامي بـ Claude (خادم MCP)

## الفكرة
تقدر تسأل Claude عن نصوص المكتبة، تتحقق من الاستشهادات، وتشغّل «الصائغ القانوني» و«محترف العقود» من نفس المحادثة. الاتصال بحسابك أنت، وبنقاطك أنت.

## الطريقة الأبسط (بعد تجهيز المنصة)
1. ادخل حسابك في nezamy.sa ← الإعدادات ← «مفاتيح الربط» ← أنشئ مفتاحًا (يظهر مرة واحدة، انسخه).
2. ابنِ الخادم مرة واحدة:
```powershell
cd mcp
ezamy-client; npm i; npm run build
cd ..
ezamy-mcp; npm i; npm run build
```
3. في Claude Desktop أضف في ملف الإعدادات (ومثله في Claude Code: `claude mcp add nezamy -e NEZAMY_TOKEN=... -- node <المسار>/dist/index.js stdio`):
```json
{ "mcpServers": { "nezamy": { "command": "node", "args": ["C:/path/to/mcp/nezamy-mcp/dist/index.js", "stdio"],
  "env": { "NEZAMY_TOKEN": "nzy_pat_...", "NEZAMY_BASE_URL": "https://nezamy.sa" } } } }
```
4. أو كموصّل في Claude على الويب بعد نشر الخادم (HTTP) وتفعيل OAuth.

## أمان
- الأدوات المدفوعة تعرض السعر أولًا ولا تخصم إلا بعد موافقتك الصريحة.
- المفتاح يمكن إلغاؤه في أي وقت، وينتهي تلقائيًا بعد 90 يومًا.
- لا يعمل شيء قبل أن يطبّق المبرمج مجلد `platform-patch`.
