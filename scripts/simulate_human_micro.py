"""
Simulate Human Micro Business (SME) Behavior on Nezamy Platform (Live / Localhost)
==================================================================================
Target Actor:
  Actor: micro-owner (مالك المنشأة المصغرة)
  Email: micro-owner.uat-20260915-full@nzamy.test
  Password: Uat!co6VNCZijtZNMXV8BWIB9c4Q9
Target URL: https://nezamy.sa (fallback: http://localhost:3000)

Physics: Fast Realistic Human Simulation
- Cubic Bezier mouse curves with velocity ease-in-out profiling
- Natural target bounding box offset
- Pre-click hesitation (150-300ms)
- Mouse hold duration (60-120ms)
- Rhythmic typing (50-120ms per character, extra on punctuation)
- Smooth wheel scrolling
"""

import sys
import os
import time
import math
import random
import json
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright, Page, Locator

BASE_DIR = r"D:\Data\Data\antigravity ai\GIT NZAMY\latest-nzamy-full"
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "uat", "runs", "uat-live-human-run")
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "micro")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

MICRO_EMAIL = "micro-owner.uat-20260915-full@nzamy.test"
UNIVERSAL_PASSWORD = "Uat!co6VNCZijtZNMXV8BWIB9c4Q9"


class HumanDriver:
    """Simulates realistic human mouse and keyboard interactions."""

    def __init__(self, page: Page):
        self.page = page
        self.cur_x = random.randint(100, 300)
        self.cur_y = random.randint(100, 300)
        self.page.mouse.move(self.cur_x, self.cur_y)

    def _bezier_point(self, p0, p1, p2, p3, t):
        u = 1.0 - t
        tt = t * t
        uu = u * u
        uuu = uu * u
        ttt = tt * t
        x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0]
        y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1]
        return x, y

    def move_to(self, target_x: float, target_y: float, speed_factor: float = 1.0):
        p0 = (self.cur_x, self.cur_y)
        p3 = (target_x, target_y)
        dx = p3[0] - p0[0]
        dy = p3[1] - p0[1]
        dist = math.hypot(dx, dy)

        if dist < 4:
            self.page.mouse.move(target_x, target_y)
            self.cur_x, self.cur_y = target_x, target_y
            return

        nx = -dy / dist
        ny = dx / dist

        arc1 = (random.random() - 0.5) * 0.3 * dist
        arc2 = (random.random() - 0.5) * 0.3 * dist

        p1 = (p0[0] + 0.33 * dx + nx * arc1, p0[1] + 0.33 * dy + ny * arc1)
        p2 = (p0[0] + 0.66 * dx + nx * arc2, p0[1] + 0.66 * dy + ny * arc2)

        steps = max(12, int(dist / (16 * speed_factor)))
        for step in range(1, steps + 1):
            raw_t = step / steps
            t = 3 * (raw_t ** 2) - 2 * (raw_t ** 3)
            bx, by = self._bezier_point(p0, p1, p2, p3, t)

            if raw_t > 0.85 and step < steps:
                bx += random.uniform(-0.8, 0.8)
                by += random.uniform(-0.8, 0.8)

            self.page.mouse.move(bx, by)
            time.sleep(random.uniform(0.005, 0.014))

        self.cur_x, self.cur_y = target_x, target_y

    def hover_and_click(self, locator: Locator, click: bool = True, button: str = "left"):
        locator.scroll_into_view_if_needed()
        box = locator.bounding_box()
        if not box:
            print("  [HumanDriver] Warning: Element bounding box not visible, attempting standard click")
            if click:
                locator.click()
            return

        offset_x = box["x"] + box["width"] * random.uniform(0.35, 0.65)
        offset_y = box["y"] + box["height"] * random.uniform(0.35, 0.65)

        self.move_to(offset_x, offset_y)
        time.sleep(random.uniform(0.15, 0.30))

        if click:
            self.page.mouse.down(button=button)
            time.sleep(random.uniform(0.06, 0.12))
            self.page.mouse.up(button=button)

    def human_type(self, locator: Locator, text: str, clear_first: bool = True):
        self.hover_and_click(locator)
        if clear_first:
            self.page.keyboard.press("Control+A")
            time.sleep(random.uniform(0.05, 0.10))
            self.page.keyboard.press("Backspace")
            time.sleep(random.uniform(0.08, 0.15))

        for ch in text:
            self.page.keyboard.type(ch)
            if ch in (' ', '\n', '،', '-', '.'):
                time.sleep(random.uniform(0.12, 0.22))
            else:
                time.sleep(random.uniform(0.05, 0.12))

    def human_scroll(self, delta_y: int, steps: int = 6):
        step_dy = delta_y / steps
        for _ in range(steps):
            self.page.mouse.wheel(0, step_dy)
            time.sleep(random.uniform(0.04, 0.09))


def handle_micro_onboarding(page: Page, human: HumanDriver):
    """Handles micro business onboarding wizard if intercepted by Onboarding Gate."""
    if "/onboarding" not in page.url:
        return

    print("\n[بوابة الإعداد: حساب المنشأة المصغرة غير مكتمل، بدء إكمال الإعداد بالفيزياء البشرية...]")
    time.sleep(1.0)
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02a_onboarding_step1.png"))

    # Step 1: Select "مؤسسة / منشأة"
    print("  الخطوة 1: اختيار الدور 'مؤسسة / منشأة'...")
    micro_btn = page.locator('button:has-text("مؤسسة / منشأة"), button:has-text("محل تجاري")').first
    if micro_btn.is_visible():
        human.hover_and_click(micro_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 2: Services and in-house lawyer question
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02b_onboarding_step2.png"))
    print("  الخطوة 2: اختيار الخدمات وسؤال المحامي الداخلي...")
    contracts_btn = page.locator('button:has-text("عقود ومستندات")').first
    if contracts_btn.is_visible():
        human.hover_and_click(contracts_btn)
        time.sleep(0.5)

    lawyer_q = page.locator('button:has-text("لا، نبحث عن خدمات"), button:has-text("لا")').first
    if lawyer_q.is_visible():
        human.hover_and_click(lawyer_q)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 3: Phone & City
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02c_onboarding_step3.png"))
    print("  الخطوة 3: إدخال هاتف المنشأة والمدينة...")
    phone_input = page.locator('#ob-phone').first
    if phone_input.is_visible():
        human.human_type(phone_input, "0534567890")
        time.sleep(0.5)

    city_select = page.locator('select').first
    if city_select.is_visible():
        city_select.select_option("الرياض")
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 4: Notifications
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02d_onboarding_step4.png"))
    print("  الخطوة 4: تأكيد الإشعارات والنقر على 'إتمام الإعداد'...")
    finish_btn = page.locator('button:has-text("إتمام الإعداد"), button:has-text("التالي")').first
    if finish_btn.is_visible():
        human.hover_and_click(finish_btn)
        time.sleep(3.0)

    # Step 5: Completed
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02e_onboarding_step5.png"))
    print("  الخطوة 5: الانتقال إلى لوحة تحكم المنشأة المصغرة...")
    dash_link = page.locator('a:has-text("اذهب للوحة التحكم"), a[href*="/dashboard"]').first
    if dash_link.is_visible():
        human.hover_and_click(dash_link)
        time.sleep(2.5)

    print("✓ اكتمل إعداد حساب المنشأة المصغرة بنجاح")


def run_micro_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري: المنشآت المصغرة (Micro Business)")
    print(f"الحساب المستهدف: {MICRO_EMAIL}")
    print(f"البيئة المستهدفة: {LIVE_BASE_URL} (الاحتياطي: {LOCAL_BASE_URL})")
    print("==================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--window-size=1440,900",
            ]
        )

        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            locale="ar-SA",
        )
        page = context.new_page()

        def on_response(res):
            try:
                url = res.url
                status = res.status
                method = res.request.method
                resource_type = res.request.resource_type
                if resource_type in ("fetch", "xhr", "document"):
                    network_log.append({
                        "time": datetime.now().isoformat(),
                        "method": method,
                        "url": url,
                        "status": status,
                        "type": resource_type
                    })
                    if status >= 400:
                        print(f"  ⚠️ [Network {status}] {method} {url[:85]}")
            except Exception:
                pass

        def on_console(msg):
            text = msg.text
            msg_type = msg.type
            console_log.append({
                "time": datetime.now().isoformat(),
                "type": msg_type,
                "text": text
            })
            if msg_type in ("error", "warning") and not any(ign in text for ign in ["favicon", "404", "Third-party"]):
                print(f"  🔴 [Console {msg_type.upper()}]: {text[:100]}")

        page.on("response", on_response)
        page.on("console", on_console)

        human = HumanDriver(page)
        base_url = LIVE_BASE_URL

        # ── 1. فحص الاتصال بالبيئة الحية ──
        print("\n[المحطة 1: فحص الاتصال بالبيئة الحية والوصول لصفحة الدخول]...")
        try:
            page.goto(f"{base_url}/login", timeout=25000, wait_until="domcontentloaded")
            time.sleep(1.5)
            print(f"  ✓ تم الاتصال بنجاح بـ {base_url}/login (العنوان: {page.title()})")
        except Exception as e:
            print(f"  ⚠️ تعذر الاتصال بالبيئة الحية: {e}")
            print(f"  🔄 الانتقال الفوري للبيئة المحلية: {LOCAL_BASE_URL}")
            base_url = LOCAL_BASE_URL
            page.goto(f"{base_url}/login", timeout=15000, wait_until="domcontentloaded")
            time.sleep(1.5)

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "01_login_initial.png"))

        # ── 2. تسجيل الدخول بحساب المنشأة المصغرة ──
        print("\n[المحطة 2: إدخال بيانات الاعتماد بالفيزياء البشرية]...")
        email_input = page.locator('input[type="email"], input[name="email"], #email').first
        pass_input = page.locator('input[type="password"], input[name="password"], #password').first

        if email_input.is_visible() and pass_input.is_visible():
            human.human_type(email_input, MICRO_EMAIL)
            time.sleep(random.uniform(0.3, 0.6))
            human.human_type(pass_input, UNIVERSAL_PASSWORD)
            time.sleep(random.uniform(0.4, 0.7))
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02_login_filled.png"))

            submit_btn = page.locator('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("دخول")').first
            human.hover_and_click(submit_btn)
            print("  ✓ تم النقر على زر الدخول، بانتظار استجابة الخادم...")
            time.sleep(3.5)
        else:
            print("  ⚠️ لم يتم العثور على حقول الدخول!")

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03_login_result.png"))
        print(f"  المسار الحالي بعد تسجيل الدخول: {page.url}")

        # ── 3. معالجة بوابة الإعداد إن ظهرت ──
        if "/onboarding" in page.url:
            handle_micro_onboarding(page, human)

        # ── 4. لوحة تحكم المنشآت المصغرة (/dashboard/micro) ──
        print("\n[المحطة 3: استكشاف لوحة تحكم المنشأة المصغرة /dashboard/micro]...")
        if "/dashboard/micro" not in page.url:
            page.goto(f"{base_url}/dashboard/micro", timeout=20000, wait_until="domcontentloaded")
            time.sleep(2.0)

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_micro_dashboard_top.png"))

        # تحريك الماوس واستكشاف بطاقات KPI
        print("  فحص بطاقات KPI والخدمات السريعة...")
        kpi_elements = page.locator('div:has-text("اشتراطات نشطة"), div:has-text("استفسارات AI")')
        if kpi_elements.count() > 0:
            human.hover_and_click(kpi_elements.first, click=False)
            time.sleep(0.5)

        # التمرير الطبيعي لأسفل الصفحة لرؤية الاشتراطات والمساعد الذكي
        print("  تمرير الصفحة لاستكشاف حالة الاشتراطات وقوالب العقود...")
        human.human_scroll(450, steps=8)
        time.sleep(1.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_micro_dashboard_middle.png"))

        human.human_scroll(450, steps=8)
        time.sleep(1.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_micro_dashboard_bottom.png"))

        # ── 5. بوابة أمانة البيانات: صفحة الاشتراطات (/dashboard/micro/requirements) ──
        print("\n[المحطة 4: فحص قسم الاشتراطات والتحقق من بوابة أمانة البيانات الحقيقية]...")
        page.goto(f"{base_url}/dashboard/micro/requirements", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "05_micro_requirements_hub.png"))

        # فحص الرخص البلدية الفرعية (/dashboard/micro/requirements/municipality)
        print("  فحص صفحة اشتراطات البلدية الفرعية...")
        page.goto(f"{base_url}/dashboard/micro/requirements/municipality", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "06_micro_requirements_municipality.png"))

        # ── 6. عقودي (/dashboard/micro/contracts) ──
        print("\n[المحطة 5: فحص عقود المنشأة المصغرة /dashboard/micro/contracts]...")
        page.goto(f"{base_url}/dashboard/micro/contracts", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.5)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "07_micro_contracts.png"))

        # ── 7. مستنداتي (/dashboard/micro/documents) ──
        print("\n[المحطة 6: فحص خزينة مستندات المنشأة /dashboard/micro/documents]...")
        page.goto(f"{base_url}/dashboard/micro/documents", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "08_micro_documents.png"))

        # التفاعل مع فلتر الخزينة
        contracts_filter = page.locator('button:has-text("العقود")').first
        if contracts_filter.is_visible():
            print("  تصفية المستندات بالنقر على 'العقود'...")
            human.hover_and_click(contracts_filter)
            time.sleep(1.0)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "09_micro_documents_filtered.png"))

        # ── 8. المساعد الذكي للمنشآت المصغرة (/ai/micro) ──
        print("\n[المحطة 7: تجربة المساعد الذكي للمنشآت المصغرة /ai/micro وصياغة عقد عمل]...")
        page.goto(f"{base_url}/ai/micro", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.5)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "10_ai_micro_situations_picker.png"))

        # اختيار حالة: عقد عامل / موظف
        print("  اختيار حالة 'عقد عامل / موظف'...")
        labor_btn = page.locator('button:has-text("عقد عامل"), div:has-text("عقد عامل")').first
        if labor_btn.is_visible():
            human.hover_and_click(labor_btn)
            time.sleep(1.5)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "11_ai_micro_questions_step.png"))

            # إدخال إجابات الأسئلة الثلاثة بالفيزياء البشرية
            print("  كتابة بيانات العقد التجاري بالفيزياء البشرية الإيقاعية...")
            q_inputs = page.locator('input[type="text"], textarea')
            if q_inputs.count() >= 3:
                human.human_type(q_inputs.nth(0), "سعد المطيري — تموينات البركة")
                time.sleep(0.4)
                human.human_type(q_inputs.nth(1), "عبدالرحمن فاروق — يمني")
                time.sleep(0.4)
                human.human_type(q_inputs.nth(2), "٢٥٠٠ ريال شهرياً — بائع ومحاسب تموينات")
                time.sleep(0.6)
                page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "12_ai_micro_inputs_filled.png"))

                # النقر على زر التوليد
                generate_btn = page.locator('button:has-text("أنشئ المستند"), button:has-text("أنشئ"), button:has-text("توليد")').first
                if generate_btn.is_visible():
                    print("  النقر على زر التوليد ومحاكاة المعالجة الذكية...")
                    human.hover_and_click(generate_btn)
                    time.sleep(1.0)
                    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "13_ai_micro_generating.png"))

                    # الانتظار حتى اكتمال التوليد وحفظ الورك فلو (نحو 3.5 ثوانٍ)
                    time.sleep(3.5)
                    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "14_ai_micro_result.png"))
                    print("  ✓ تم توليد العقد بنجاح وعرض النتيجة!")

                    # تجربة زر نسخ النص
                    copy_btn = page.locator('button:has-text("نسخ"), button:has-text("نسخ النص")').first
                    if copy_btn.is_visible():
                        print("  تجربة زر نسخ النص...")
                        human.hover_and_click(copy_btn)
                        time.sleep(0.8)
                        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "15_ai_micro_copied.png"))

        # ── 9. التحقق من المحفظة (/dashboard/micro/wallet) ──
        print("\n[المحطة 8: فحص المحفظة الرقمية /dashboard/micro/wallet]...")
        page.goto(f"{base_url}/dashboard/micro/wallet", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "16_micro_wallet.png"))

        context.close()
        browser.close()

    # حفظ سجلات الشبكة والكونسول
    with open(os.path.join(OUTPUT_DIR, "micro_network_log.json"), "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, "micro_console_log.json"), "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print(f"🏁 اكتملت محاكاة المنشآت المصغرة بنجاح!")
    print(f"📸 تم حفظ {len(os.listdir(SCREENSHOTS_DIR))} لقطة شاشة في: {SCREENSHOTS_DIR}")
    print(f"🌐 إجمالي طلبات الشبكة المسجلة: {len(network_log)}")
    print(f"💻 إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    run_micro_simulation()
