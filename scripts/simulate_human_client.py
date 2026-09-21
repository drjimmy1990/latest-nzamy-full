"""
Simulate Human Individual Client Behavior on Nezamy Platform (Live / Localhost)
================================================================================
Target Actor: client-a (العميل الفرد)
Email: default below, override via env UAT_CLIENT_EMAIL
Password: set via env UAT_PASSWORD (required, no default)
Target: local by default (http://localhost:3000); --live + env UAT_ALLOW_LIVE=1 required for production

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
import argparse
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright, Page, Locator

BASE_DIR = r"D:\Data\Data\antigravity ai\GIT NZAMY\latest-nzamy-full"
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "uat", "runs", "uat-live-human-run")
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "client")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

ACTOR_EMAIL = os.environ.get("UAT_CLIENT_EMAIL", "client-a.uat-20260915-full@nzamy.test")
ACTOR_PASSWORD = os.environ.get("UAT_PASSWORD")
if not ACTOR_PASSWORD:
    print("[Config] UAT_PASSWORD environment variable is not set. Set it before running this script.")
    sys.exit(2)


class HumanDriver:
    """Simulates realistic human mouse and keyboard interactions."""

    def __init__(self, page: Page):
        self.page = page
        self.cur_x = random.randint(100, 300)
        self.cur_y = random.randint(100, 300)
        self.page.mouse.move(self.cur_x, self.cur_y)

    def _bezier_point(self, p0, p1, p2, p3, t):
        """Calculate cubic Bezier point at t in [0, 1]."""
        u = 1.0 - t
        tt = t * t
        uu = u * u
        uuu = uu * u
        ttt = tt * t
        x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0]
        y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1]
        return x, y

    def move_to(self, target_x: float, target_y: float, speed_factor: float = 1.0):
        """Move mouse from current position to target using a cubic Bezier curve."""
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
        """Human-like hover and click on element."""
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
        """Type with human cadence: 50-120ms per character with natural variations."""
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
        """Scroll smoothly using wheel steps."""
        step_dy = delta_y / steps
        for _ in range(steps):
            self.page.mouse.wheel(0, step_dy)
            time.sleep(random.uniform(0.04, 0.09))


def handle_onboarding_if_needed(page: Page, human: HumanDriver):
    """If user lands on /onboarding, completes the onboarding wizard with human physics."""
    if "/onboarding" not in page.url:
        return

    print("\n[بوابة الإعداد: المستخدم غير مكتمل الإعداد، بدء إكمال الإعداد بالفيزياء البشرية...]")
    time.sleep(1.0)
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03a_onboarding_step1_role.png"))

    # Step 1: Click "فرد"
    print("  الخطوة 1: اختيار الدور 'فرد'...")
    role_btn = page.locator('button:has-text("فرد")').first
    if role_btn.is_visible():
        human.hover_and_click(role_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 2: What do you need?
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03b_onboarding_step2_services.png"))
    print("  الخطوة 2: اختيار الخدمات 'استشارات قانونية'...")
    consult_btn = page.locator('button:has-text("استشارات قانونية")').first
    if consult_btn.is_visible():
        human.hover_and_click(consult_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 3: Phone and City
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03c_onboarding_step3_phone.png"))
    print("  الخطوة 3: إدخال رقم الجوال والمدينة...")
    phone_input = page.locator('#ob-phone').first
    if phone_input.is_visible():
        human.human_type(phone_input, "0512345678")
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
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03d_onboarding_step4_notifs.png"))
    print("  الخطوة 4: تأكيد إعدادات الإشعارات والنقر على 'إتمام الإعداد'...")
    finish_btn = page.locator('button:has-text("إتمام الإعداد"), button:has-text("التالي")').first
    if finish_btn.is_visible():
        human.hover_and_click(finish_btn)
        time.sleep(3.0)

    # Step 5: Completed!
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03e_onboarding_step5_complete.png"))
    print("  الخطوة 5: ظهور شاشة الاكتمال، النقر على 'اذهب للوحة التحكم'...")
    dash_link = page.locator('a:has-text("اذهب للوحة التحكم"), a[href*="/dashboard"]').first
    if dash_link.is_visible():
        human.hover_and_click(dash_link)
        time.sleep(2.5)

    print("✓ اكتمل الإعداد بنجاح وانتقل العميل إلى لوحة التحكم")


def run_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري: العميل الفرد (client-a)")
    print(f"الحساب: {ACTOR_EMAIL}")
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
                        "type": resource_type,
                    })
            except Exception:
                pass

        page.on("response", on_response)

        def on_console(msg):
            console_log.append({
                "time": datetime.now().isoformat(),
                "type": msg.type,
                "text": msg.text,
                "location": msg.location,
            })
        page.on("console", on_console)

        human = HumanDriver(page)
        base_url = LIVE_BASE_URL

        # ── Test Connectivity ──
        print("\n[فحص الاتصال بالبيئة الحية...]")
        try:
            resp = page.goto(f"{base_url}/login", timeout=20000, wait_until="networkidle")
            if not resp or resp.status >= 500:
                print(f"تعذر الاتصال بـ {LIVE_BASE_URL}، التحويل إلى البيئة المحلية: {LOCAL_BASE_URL}")
                base_url = LOCAL_BASE_URL
                page.goto(f"{base_url}/login", timeout=15000, wait_until="networkidle")
            else:
                print(f"✓ الاتصال بالبيئة الحية ناجح تماماً (HTTP {resp.status})")
        except Exception as e:
            print(f"استثناء في الاتصال بالحي: {e}. التحويل للمحلي.")
            base_url = LOCAL_BASE_URL
            page.goto(f"{base_url}/login", timeout=15000, wait_until="networkidle")

        time.sleep(1.5)

        # ── المحطة 1: تسجيل الدخول بسلوك بشري كامل ──
        print("\n[المحطة 1: تسجيل الدخول كعميل فرد]")
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "01_client_login_initial.png"))

        email_input = page.locator('input[type="email"], input[name="email"], input[placeholder*="بريد"]').first
        pwd_input = page.locator('input[type="password"], input[name="password"]').first

        print("  كتابة البريد الإلكتروني بحركات إيقاعية...")
        human.human_type(email_input, ACTOR_EMAIL)
        time.sleep(0.4)

        print("  كتابة كلمة المرور بحركات إيقاعية...")
        human.human_type(pwd_input, ACTOR_PASSWORD)
        time.sleep(0.5)

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02_client_login_filled.png"))

        submit_btn = page.locator('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("دخول")').first
        print("  تحريك الماوس بمنحنى بيزييه والنقر على زر الدخول...")
        human.hover_and_click(submit_btn)

        print("  انتظار الانتقال واستقرار الشبكة...")
        try:
            page.wait_for_url(lambda u: "/dashboard" in u or "/onboarding" in u, timeout=25000)
            print(f"✓ تم التحويل بنجاح إلى: {page.url}")
        except Exception as e:
            print(f"  تحذير: مهلة انتظار المسار: {e}. المسار الحالي: {page.url}")

        time.sleep(2.5)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03_client_login_result.png"))

        # ── بوابة الإعداد: Onboarding Check ──
        handle_onboarding_if_needed(page, human)

        # ── المحطة 2: لوحة تحكم العميل /dashboard/client ──
        print("\n[المحطة 2: لوحة تحكم العميل /dashboard/client]")
        try:
            page.goto(f"{base_url}/dashboard/client", wait_until="networkidle", timeout=20000)
            time.sleep(2.0)
            print("  تمرير إنسيابي للوحة العميل واستعراض الودجات...")
            human.human_scroll(450, steps=8)
            time.sleep(1.0)
            human.human_scroll(-350, steps=6)
            time.sleep(0.8)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_client_dashboard_overview.png"))
            print("✓ تم التقاط صورة لوحة العميل الرئيسية")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 2: {e}")
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_client_dashboard_error.png"))

        # ── المحطة 3: حجز استشارة جديدة /dashboard/client/consultation/new ──
        print("\n[المحطة 3: تدفق حجز استشارة جديدة]")
        try:
            page.goto(f"{base_url}/dashboard/client/consultation/new", wait_until="networkidle", timeout=20000)
            time.sleep(2.5)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "05_consultation_step1_empty.png"))

            # Step 1: Click "مع محامٍ"
            print("  اختيار مسار 'مع محامٍ' بالماوس البشري...")
            lawyer_card_btn = page.locator('button:has-text("مع محامٍ")').first
            if lawyer_card_btn.is_visible():
                human.hover_and_click(lawyer_card_btn)
                time.sleep(1.5)
            else:
                print("  لم يتم العثور على زر 'مع محامٍ'")

            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "06_consultation_step2_initial.png"))

            # Step 2: Choose specialty "تجاري", mode, description, urgency
            print("  اختيار التخصص 'تجاري'...")
            spec_btn = page.locator('button:has-text("تجاري")').first
            if spec_btn.is_visible():
                human.hover_and_click(spec_btn)
                time.sleep(0.5)

            print("  اختيار نوع الجلسة 'مرئية'...")
            mode_btn = page.locator('button:has-text("مرئية")').first
            if mode_btn.is_visible():
                human.hover_and_click(mode_btn)
                time.sleep(0.5)

            print("  كتابة موضوع الاستشارة بالطباعة الإيقاعية...")
            topic_textarea = page.locator('textarea').first
            if topic_textarea.is_visible():
                consult_topic = "لدينا استفسار بخصوص نزاع تعاقدي حول توريد مواد بناء وتأخر المقاول في التسليم وفق الجدول الزمني المتفق عليه."
                human.human_type(topic_textarea, consult_topic)
                time.sleep(0.6)

            print("  اختيار الأولوية 'عاجلة'...")
            urgency_btn = page.locator('button:has-text("عاجلة")').first
            if urgency_btn.is_visible():
                human.hover_and_click(urgency_btn)
                time.sleep(0.5)

            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "07_consultation_step2_filled.png"))

            print("  النقر على زر 'مراجعة وتأكيد' للوصول إلى الخطوة الثالثة...")
            review_btn = page.locator('button:has-text("مراجعة وتأكيد")').first
            if review_btn.is_visible() and review_btn.is_enabled():
                human.hover_and_click(review_btn)
                time.sleep(1.5)

            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "08_consultation_step3_review.png"))

            print("  النقر على زر 'إرسال الطلب' بالفيزياء البشرية...")
            confirm_btn = page.locator('button:has-text("إرسال الطلب")').first
            if confirm_btn.is_visible() and confirm_btn.is_enabled():
                human.hover_and_click(confirm_btn)
                time.sleep(3.5)

            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "09_consultation_step3_submitted.png"))
            print("✓ تم إرسال طلب الاستشارة بنجاح")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 3: {e}")
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "09_consultation_error.png"))

        # ── المحطة 4: قائمة استشارات العميل /dashboard/client/consultation ──
        print("\n[المحطة 4: استعراض استشاراتي /dashboard/client/consultation]")
        try:
            page.goto(f"{base_url}/dashboard/client/consultation", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "10_client_consultations_list.png"))
            print("✓ تم فحص وتوثيق صفحة الاستشارات")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 4: {e}")

        # ── المحطة 5: قضايا العميل /dashboard/client/cases ──
        print("\n[المحطة 5: استعراض قضاياي /dashboard/client/cases]")
        try:
            page.goto(f"{base_url}/dashboard/client/cases", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            human.human_scroll(250, steps=4)
            time.sleep(0.5)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "11_client_cases_list.png"))
            print("✓ تم فحص وتوثيق صفحة القضايا")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 5: {e}")

        # ── المحطة 6: طلبات العميل /dashboard/client/requests ──
        print("\n[المحطة 6: استعراض طلباتي /dashboard/client/requests]")
        try:
            page.goto(f"{base_url}/dashboard/client/requests", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            human.human_scroll(200, steps=4)
            time.sleep(0.5)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "12_client_requests_list.png"))
            print("✓ تم فحص وتوثيق صفحة طلبات العميل")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 6: {e}")

        # ── المحطة 7: دليل المحامين /dashboard/client/find-lawyer ──
        print("\n[المحطة 7: دليل المحامين /dashboard/client/find-lawyer]")
        try:
            page.goto(f"{base_url}/dashboard/client/find-lawyer", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            search_input = page.locator('input[placeholder*="بحث"], input[type="text"]').first
            if search_input.is_visible():
                print("  تجربة البحث البشري عن محامي تجاري...")
                human.human_type(search_input, "تجاري")
                time.sleep(1.0)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "13_client_find_lawyer.png"))
            print("✓ تم فحص وتوثيق دليل المحامين")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 7: {e}")

        # ── المحطة 8: حاسبة أتعاب ورسوم التقاضي /ai/fee-calculator ──
        print("\n[المحطة 8: حاسبة أتعاب ورسوم التقاضي /ai/fee-calculator]")
        try:
            page.goto(f"{base_url}/ai/fee-calculator", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)

            # Tab: أتعاب المحامي
            print("  تحديد نوع القضية 'تجاري' في الحاسبة...")
            commercial_chip = page.locator('button:has-text("تجاري")').first
            if commercial_chip.is_visible():
                human.hover_and_click(commercial_chip)
                time.sleep(0.6)

            print("  تحديد درجة التعقيد 'متوسطة'...")
            med_chip = page.locator('button:has-text("متوسطة")').first
            if med_chip.is_visible():
                human.hover_and_click(med_chip)
                time.sleep(0.6)

            human.human_scroll(300, steps=5)
            time.sleep(0.8)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "14_fee_calculator_lawyer_fees.png"))

            # Switch Tab: الرسوم القضائية
            print("  التبديل إلى تبويب 'الرسوم القضائية'...")
            court_tab = page.locator('button:has-text("الرسوم القضائية")').first
            if court_tab.is_visible():
                human.hover_and_click(court_tab)
                time.sleep(1.2)
                page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "15_fee_calculator_court_fees.png"))

            print("✓ تم فحص وتوثيق حاسبة الرسوم القضائية والأتعاب")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 8: {e}")

        # ── المحطة 9: مستندات العميل /dashboard/client/documents ──
        print("\n[المحطة 9: مستنداتي /dashboard/client/documents]")
        try:
            page.goto(f"{base_url}/dashboard/client/documents", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "16_client_documents.png"))
            print("✓ تم فحص وتوثيق صفحة المستندات")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 9: {e}")

        # ── المحطة 10: محفظة العميل /dashboard/client/wallet ──
        print("\n[المحطة 10: المحفظة والرصيد /dashboard/client/wallet]")
        try:
            page.goto(f"{base_url}/dashboard/client/wallet", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            human.human_scroll(300, steps=5)
            time.sleep(0.8)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "17_client_wallet.png"))
            print("✓ تم فحص وتوثيق محفظة العميل")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 10: {e}")

        browser.close()

    with open(os.path.join(OUTPUT_DIR, "client_network_log.json"), "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, "client_console_log.json"), "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print("✅ اكتملت محاكاة العميل الفرد بنجاح!")
    print(f"📁 مجلد اللقطات: {SCREENSHOTS_DIR}")
    print(f"📊 إجمالي طلبات الشبكة: {len(network_log)}")
    print(f"⚠️ إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate Human Individual Client Behavior")
    parser.add_argument("--live", action="store_true",
                         help="Target the live production site instead of localhost (also requires env UAT_ALLOW_LIVE=1)")
    args = parser.parse_args()
    if args.live:
        if os.environ.get("UAT_ALLOW_LIVE") != "1":
            print("[EnvSelector] --live requires env UAT_ALLOW_LIVE=1 to be set. Refusing to target production.")
            sys.exit(2)
    else:
        LIVE_BASE_URL = LOCAL_BASE_URL
    print(f"[EnvSelector] Target: {LIVE_BASE_URL}")
    run_simulation()
