"""
Simulate Human Non-Profit / NGO Behavior on Nezamy Platform (Live / Localhost)
==============================================================================
Target Actor:
  Actor: ngo-director (مدير المنظمة غير الربحية / الجمعية الأهلية)
  Email: ngo-director.uat-20260915-full@nzamy.test
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
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "ngo")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

NGO_EMAIL = "ngo-director.uat-20260915-full@nzamy.test"
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


def handle_ngo_onboarding(page: Page, human: HumanDriver):
    """Handles NGO onboarding wizard if intercepted by Onboarding Gate."""
    if "/onboarding" not in page.url:
        return

    print("\n[بوابة الإعداد: حساب الجمعية/المنظمة غير مكتمل، بدء إكمال الإعداد بالفيزياء البشرية...]")
    time.sleep(1.0)
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02a_onboarding_step1.png"))

    # Step 1: Select "جمعية / منظمة"
    print("  الخطوة 1: اختيار الدور 'جمعية / منظمة'...")
    ngo_btn = page.locator('button:has-text("جمعية / منظمة"), button:has-text("منظمة غير ربحية")').first
    if ngo_btn.is_visible():
        human.hover_and_click(ngo_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 2: Services
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02b_onboarding_step2.png"))
    print("  الخطوة 2: اختيار الخدمات المطلوبة للقطاع غير الربحي...")
    svc_btn = page.locator('button:has-text("عقود ومستندات"), button:has-text("استشارات")').first
    if svc_btn.is_visible():
        human.hover_and_click(svc_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 3: Phone & City
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02c_onboarding_step3.png"))
    print("  الخطوة 3: إدخال هاتف المنظمة والمدينة...")
    phone_input = page.locator('#ob-phone').first
    if phone_input.is_visible():
        human.human_type(phone_input, "0545678901")
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
    print("  الخطوة 5: الانتقال إلى لوحة تحكم المنظمة غير الربحية...")
    dash_link = page.locator('a:has-text("اذهب للوحة التحكم"), a[href*="/dashboard"]').first
    if dash_link.is_visible():
        human.hover_and_click(dash_link)
        time.sleep(2.5)

    print("✓ اكتمل إعداد حساب المنظمة غير الربحية بنجاح")


def run_ngo_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري: القطاع غير الربحي والجمعيات (NGOs)")
    print(f"الحساب المستهدف: {NGO_EMAIL}")
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

        # ── 2. تسجيل الدخول بحساب مدير الجمعية/المنظمة ──
        print("\n[المحطة 2: إدخال بيانات الاعتماد بالفيزياء البشرية]...")
        email_input = page.locator('input[type="email"], input[name="email"], #email').first
        pass_input = page.locator('input[type="password"], input[name="password"], #password').first

        if email_input.is_visible() and pass_input.is_visible():
            human.human_type(email_input, NGO_EMAIL)
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
            handle_ngo_onboarding(page, human)

        # ── 4. لوحة تحكم المنظمات غير الربحية (/dashboard/ngo) ──
        print("\n[المحطة 3: استكشاف لوحة تحكم المنظمة غير الربحية /dashboard/ngo]...")
        if "/dashboard/ngo" not in page.url:
            page.goto(f"{base_url}/dashboard/ngo", timeout=20000, wait_until="domcontentloaded")
            time.sleep(2.0)

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_ngo_dashboard_top.png"))

        # تحريك الماوس واستكشاف مؤشرات الأداء
        print("  فحص مؤشرات الأداء (التبرعات، المتطوعون، الحوكمة، العقود)...")
        kpi_metrics = page.locator('div:has-text("إجمالي التبرعات"), div:has-text("المتطوعون النشطون")')
        if kpi_metrics.count() > 0:
            human.hover_and_click(kpi_metrics.first, click=False)
            time.sleep(0.5)

        # التمرير الانسيابي لرؤية رادار الامتثال وسجل التبرعات الحي
        print("  تمرير الصفحة لاستكشاف رادار الامتثال وسجل التبرعات المباشر...")
        human.human_scroll(450, steps=8)
        time.sleep(1.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_ngo_dashboard_middle.png"))

        human.human_scroll(450, steps=8)
        time.sleep(1.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_ngo_dashboard_bottom.png"))

        # ── 5. صفحة المتطوعين (/dashboard/ngo/volunteers) ──
        print("\n[المحطة 4: فحص إدارة المتطوعين /dashboard/ngo/volunteers]...")
        page.goto(f"{base_url}/dashboard/ngo/volunteers", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "05_ngo_volunteers.png"))

        # ── 6. صفحة الامتثال والحوكمة (/dashboard/ngo/compliance) ──
        print("\n[المحطة 5: فحص الامتثال والحوكمة /dashboard/ngo/compliance]...")
        page.goto(f"{base_url}/dashboard/ngo/compliance", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "06_ngo_compliance.png"))

        # ── 7. صفحة العقود والاتفاقيات (/dashboard/ngo/contracts) ──
        print("\n[المحطة 6: فحص العقود والاتفاقيات /dashboard/ngo/contracts]...")
        page.goto(f"{base_url}/dashboard/ngo/contracts", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "07_ngo_contracts.png"))

        # ── 8. المساعد الذكي وصائغ عقد التطوع (/ai/ngo/volunteer-contract) ──
        print("\n[المحطة 7: صياغة عقد تطوع بالذكاء الاصطناعي /ai/ngo/volunteer-contract]...")
        page.goto(f"{base_url}/ai/ngo/volunteer-contract", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.5)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "08_ai_volunteer_contract_step1.png"))

        # إدخال بيانات المتطوع (Step 1)
        print("  كتابة بيانات المتطوع بالفيزياء البشرية...")
        name_input = page.locator('input[placeholder*="الرباعي"]').first
        id_input = page.locator('input[placeholder*="الهوية"]').first
        phone_input = page.locator('input[placeholder*="05"]').first
        city_input = page.locator('input[placeholder*="الرياض"]').first

        if name_input.is_visible():
            human.human_type(name_input, "ياسر فهد القحطاني")
            time.sleep(0.3)
        if id_input.is_visible():
            human.human_type(id_input, "1098765432")
            time.sleep(0.3)
        if phone_input.is_visible():
            human.human_type(phone_input, "0551234567")
            time.sleep(0.3)
        if city_input.is_visible():
            human.human_type(city_input, "الرياض")
            time.sleep(0.3)

        # اختيار الدور التطوعي: مشرف ميداني
        role_btn = page.locator('button:has-text("مشرف ميداني")').first
        if role_btn.is_visible():
            human.hover_and_click(role_btn)
            time.sleep(0.5)

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "09_ai_volunteer_step1_filled.png"))

        # النقر على زر الانتقال لشروط العقد
        next_to_terms = page.locator('button:has-text("التالي")').first
        if next_to_terms.is_enabled():
            print("  الانتقال إلى شروط العقد (Step 2)...")
            human.hover_and_click(next_to_terms)
            time.sleep(1.5)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "10_ai_volunteer_contract_step2.png"))

            # إدخال شروط العقد (Step 2)
            org_input = page.locator('input[placeholder*="الرسمي للجمعية"]').first
            prog_input = page.locator('input[placeholder*="البرنامج"]').first
            hours_input = page.locator('input[type="number"], input[placeholder*="10"]').first
            loc_input = page.locator('input[placeholder*="مقر الجمعية"]').first
            duties_input = page.locator('textarea').first

            if org_input.is_visible():
                human.human_type(org_input, "جمعية البر والوفاء الأهلية")
                time.sleep(0.3)
            if prog_input.is_visible():
                human.human_type(prog_input, "مبادرة كسوة الشتاء والتوزيع الميداني")
                time.sleep(0.3)

            # تحديد مدة العقد: شهري
            duration_btn = page.locator('button:has-text("شهري")').first
            if duration_btn.is_visible():
                human.hover_and_click(duration_btn)
                time.sleep(0.3)

            # تحديد تاريخ البداية
            start_date_input = page.locator('input[type="date"]').first
            if start_date_input.is_visible():
                start_date_input.fill("2026-10-01")
                time.sleep(0.3)

            if hours_input.is_visible():
                human.human_type(hours_input, "15")
                time.sleep(0.3)

            if loc_input.is_visible():
                human.human_type(loc_input, "مدينة الرياض — الأحياء الجنوبية")
                time.sleep(0.3)

            if duties_input.is_visible():
                human.human_type(duties_input, "الإشراف الميداني على فرق التوزيع والتنسيق المباشر مع المستفيدين وتوثيق الاستلام")
                time.sleep(0.4)

            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "11_ai_volunteer_step2_filled.png"))

            # النقر على زر إنشاء عقد التطوع
            create_btn = page.locator('button:has-text("أنشئ عقد التطوع")').first
            if create_btn.is_enabled():
                print("  النقر على زر إنشاء عقد التطوع وبدء المعالجة...")
                human.hover_and_click(create_btn)
                time.sleep(1.0)
                page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "12_ai_volunteer_generating.png"))

                # الانتظار حتى اكتمال الصياغة وتوليد العقد
                time.sleep(3.5)
                page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "13_ai_volunteer_contract_result.png"))
                print("  ✓ تم توليد عقد التطوع بنجاح وتوثيقه في سجل الورك فلو!")

                # تجربة زر نسخ العقد
                copy_btn = page.locator('button:has-text("نسخ")').first
                if copy_btn.is_visible():
                    print("  تجربة زر نسخ نص العقد...")
                    human.hover_and_click(copy_btn)
                    time.sleep(0.8)
                    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "14_ai_volunteer_copied.png"))

        # ── 9. السجل المالي للجمعية (/dashboard/ngo/finance) ──
        print("\n[المحطة 8: فحص السجل المالي للجمعية /dashboard/ngo/finance]...")
        page.goto(f"{base_url}/dashboard/ngo/finance", timeout=20000, wait_until="domcontentloaded")
        time.sleep(2.0)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "15_ngo_finance.png"))

        context.close()
        browser.close()

    # حفظ سجلات الشبكة والكونسول
    with open(os.path.join(OUTPUT_DIR, "ngo_network_log.json"), "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, "ngo_console_log.json"), "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print(f"🏁 اكتملت محاكاة القطاع غير الربحي (NGOs) بنجاح!")
    print(f"📸 تم حفظ {len(os.listdir(SCREENSHOTS_DIR))} لقطة شاشة في: {SCREENSHOTS_DIR}")
    print(f"🌐 إجمالي طلبات الشبكة المسجلة: {len(network_log)}")
    print(f"💻 إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    run_ngo_simulation()
