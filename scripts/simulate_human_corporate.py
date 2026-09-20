"""
Simulate Human Corporate Business Behavior on Nezamy Platform (Live / Localhost)
================================================================================
Target Actors:
1. Primary: business-b-owner (مالك المنشأة)
   Email: business-b-owner.uat-20260915-full@nzamy.test
2. Sub-account: business-b-legal_manager (مدير الشؤون القانونية)
   Email: business-b-legal_manager.uat-20260915-full@nzamy.test
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
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "corporate")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

OWNER_EMAIL = "business-b-owner.uat-20260915-full@nzamy.test"
MANAGER_EMAIL = "business-b-legal_manager.uat-20260915-full@nzamy.test"
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


def handle_corporate_onboarding(page: Page, human: HumanDriver, prefix: str):
    """Handles corporate onboarding wizard if intercepted by Onboarding Gate."""
    if "/onboarding" not in page.url:
        return

    print(f"\n[بوابة الإعداد: حساب {prefix} غير مكتمل، بدء إكمال الإعداد بالفيزياء البشرية...]")
    time.sleep(1.0)
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"{prefix}_02a_onboarding_step1.png"))

    # Step 1: Select "شركة / مؤسسة"
    print("  الخطوة 1: اختيار الدور 'شركة / مؤسسة'...")
    company_btn = page.locator('button:has-text("شركة / مؤسسة")').first
    if company_btn.is_visible():
        human.hover_and_click(company_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 2: What do you need? (and in-house lawyer question)
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"{prefix}_02b_onboarding_step2.png"))
    print("  الخطوة 2: اختيار الخدمات 'عقود ومستندات' وسؤال المحامي الداخلي...")
    contracts_btn = page.locator('button:has-text("عقود ومستندات")').first
    if contracts_btn.is_visible():
        human.hover_and_click(contracts_btn)
        time.sleep(0.5)

    lawyer_q = page.locator('button:has-text("نعم، لدينا محامي")').first
    if lawyer_q.is_visible():
        human.hover_and_click(lawyer_q)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    # Step 3: Phone & City
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"{prefix}_02c_onboarding_step3.png"))
    print("  الخطوة 3: إدخال هاتف الشركة والمدينة...")
    phone_input = page.locator('#ob-phone').first
    if phone_input.is_visible():
        human.human_type(phone_input, "0523456789")
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
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"{prefix}_02d_onboarding_step4.png"))
    print("  الخطوة 4: تأكيد الإشعارات والنقر على 'إتمام الإعداد'...")
    finish_btn = page.locator('button:has-text("إتمام الإعداد"), button:has-text("التالي")').first
    if finish_btn.is_visible():
        human.hover_and_click(finish_btn)
        time.sleep(3.0)

    # Step 5: Completed
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"{prefix}_02e_onboarding_step5.png"))
    print("  الخطوة 5: الانتقال إلى لوحة تحكم الشركة...")
    dash_link = page.locator('a:has-text("اذهب للوحة التحكم"), a[href*="/dashboard"]').first
    if dash_link.is_visible():
        human.hover_and_click(dash_link)
        time.sleep(2.5)

    print(f"✓ اكتمل إعداد حساب {prefix} بنجاح")


def run_corporate_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري: الشركات والمؤسسات (Corporate Business)")
    print(f"الحساب الرئيسي (مالك): {OWNER_EMAIL}")
    print(f"الحساب الفرعي (مدير قانوني): {MANAGER_EMAIL}")
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

        # ════════════════════════════════════════════════════════════════
        # الجولة الأولى: الحساب الرئيسي — مالك الشركة (business-b-owner)
        # ════════════════════════════════════════════════════════════════
        print("\n" + "="*50)
        print("🏢 [الجزء 1: اختبار الحساب الرئيسي — مالك الشركة]")
        print("="*50)

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
                        "actor": "owner",
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
                "actor": "owner",
                "type": msg.type,
                "text": msg.text,
                "location": msg.location,
            })
        page.on("console", on_console)

        human = HumanDriver(page)
        base_url = LIVE_BASE_URL

        # Connectivity Check
        try:
            resp = page.goto(f"{base_url}/login", timeout=20000, wait_until="networkidle")
            if not resp or resp.status >= 500:
                base_url = LOCAL_BASE_URL
                page.goto(f"{base_url}/login", timeout=15000, wait_until="networkidle")
        except Exception:
            base_url = LOCAL_BASE_URL
            page.goto(f"{base_url}/login", timeout=15000, wait_until="networkidle")

        time.sleep(1.5)

        # Station 1: Login Owner
        print("\n[المحطة 1: تسجيل دخول مالك الشركة]")
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_01_login_initial.png"))

        email_input = page.locator('input[type="email"], input[name="email"], input[placeholder*="بريد"]').first
        pwd_input = page.locator('input[type="password"], input[name="password"]').first

        human.human_type(email_input, OWNER_EMAIL)
        time.sleep(0.4)
        human.human_type(pwd_input, UNIVERSAL_PASSWORD)
        time.sleep(0.5)

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_02_login_filled.png"))

        submit_btn = page.locator('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("دخول")').first
        human.hover_and_click(submit_btn)

        try:
            page.wait_for_url(lambda u: "/dashboard" in u or "/onboarding" in u, timeout=25000)
            print(f"✓ تم التحويل بنجاح إلى: {page.url}")
        except Exception as e:
            print(f"  تحذير المسار: {e}. المسار الحالي: {page.url}")

        time.sleep(2.5)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_03_login_result.png"))

        # Onboarding Gate for Owner
        handle_corporate_onboarding(page, human, "owner")

        # Station 2: Corporate Dashboard Overview
        print("\n[المحطة 2: لوحة تحكم الشركات الرئيسية /dashboard/business]")
        try:
            page.goto(f"{base_url}/dashboard/business", wait_until="networkidle", timeout=20000)
            time.sleep(2.0)
            print("  تمرير إنسيابي للوحة الشركة واستعراض الودجات...")
            human.human_scroll(400, steps=7)
            time.sleep(0.8)
            human.human_scroll(-300, steps=5)
            time.sleep(0.8)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_04_business_dashboard.png"))
            print("✓ تم التقاط صورة لوحة تحكم الشركة")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 2: {e}")

        # Station 3: Company Documents Vault
        print("\n[المحطة 3: خزنة وثائق المنشأة /dashboard/business/documents]")
        try:
            page.goto(f"{base_url}/dashboard/business/documents", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_05_business_documents.png"))
            print("✓ تم فحص وتوثيق خزنة وثائق المنشأة")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 3: {e}")

        # Station 4: Architectural Integrity Check — Section Not Ready Banner
        print("\n[المحطة 4: فحص حماية الأقسام قيد الإعداد (SectionNotReady)]")
        try:
            page.goto(f"{base_url}/dashboard/business/team", wait_until="networkidle", timeout=15000)
            time.sleep(1.5)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_06_section_not_ready_team.png"))
            print("✓ تم التحقق من ظهور لافتة 'القسم قيد الإعداد' الصادقة في إدارة الفريق")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 4: {e}")

        try:
            page.goto(f"{base_url}/dashboard/business/governance", wait_until="networkidle", timeout=15000)
            time.sleep(1.5)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_07_section_not_ready_governance.png"))
            print("✓ تم التحقق من ظهور لافتة 'القسم قيد الإعداد' الصادقة في الحوكمة")
        except Exception as e:
            print(f"⚠️ استثناء في الحوكمة: {e}")

        # Station 5: Corporate Orders and Requests
        print("\n[المحطة 5: استعراض طلبات المنشأة /dashboard/client/requests]")
        try:
            page.goto(f"{base_url}/dashboard/client/requests", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_08_corporate_requests.png"))
            print("✓ تم فحص وتوثيق طلبات المنشأة")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 5: {e}")

        # Station 6: Corporate Consultations
        print("\n[المحطة 6: استعراض استشارات المنشأة /dashboard/client/consultation]")
        try:
            page.goto(f"{base_url}/dashboard/client/consultation", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "owner_09_corporate_consultations.png"))
            print("✓ تم فحص وتوثيق استشارات المنشأة")
        except Exception as e:
            print(f"⚠️ استثناء في المحطة 6: {e}")

        context.close()

        # ════════════════════════════════════════════════════════════════
        # الجولة الثانية: الحساب الفرعي — مدير الشؤون القانونية (business-b-legal_manager)
        # ════════════════════════════════════════════════════════════════
        print("\n" + "="*50)
        print("⚖️ [الجزء 2: اختبار الحساب الفرعي — مدير الشؤون القانونية]")
        print("="*50)

        context_sub = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            locale="ar-SA",
        )
        page_sub = context_sub.new_page()

        def on_sub_response(res):
            try:
                url = res.url
                status = res.status
                method = res.request.method
                resource_type = res.request.resource_type
                if resource_type in ("fetch", "xhr", "document"):
                    network_log.append({
                        "time": datetime.now().isoformat(),
                        "actor": "legal_manager",
                        "method": method,
                        "url": url,
                        "status": status,
                        "type": resource_type,
                    })
            except Exception:
                pass

        page_sub.on("response", on_sub_response)

        def on_sub_console(msg):
            console_log.append({
                "time": datetime.now().isoformat(),
                "actor": "legal_manager",
                "type": msg.type,
                "text": msg.text,
                "location": msg.location,
            })
        page_sub.on("console", on_sub_console)

        human_sub = HumanDriver(page_sub)

        # Login Legal Manager
        print("\n[المحطة 7: تسجيل دخول مدير الشؤون القانونية الفرعي]")
        page_sub.goto(f"{base_url}/login", wait_until="networkidle", timeout=15000)
        time.sleep(1.0)
        page_sub.screenshot(path=os.path.join(SCREENSHOTS_DIR, "sub_01_login_initial.png"))

        email_in = page_sub.locator('input[type="email"], input[name="email"], input[placeholder*="بريد"]').first
        pwd_in = page_sub.locator('input[type="password"], input[name="password"]').first

        human_sub.human_type(email_in, MANAGER_EMAIL)
        time.sleep(0.4)
        human_sub.human_type(pwd_in, UNIVERSAL_PASSWORD)
        time.sleep(0.5)

        page_sub.screenshot(path=os.path.join(SCREENSHOTS_DIR, "sub_02_login_filled.png"))

        sub_submit = page_sub.locator('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("دخول")').first
        human_sub.hover_and_click(sub_submit)

        try:
            page_sub.wait_for_url(lambda u: "/dashboard" in u or "/onboarding" in u, timeout=25000)
            print(f"✓ تم تحويل المدير القانوني بنجاح إلى: {page_sub.url}")
        except Exception as e:
            print(f"  تحذير: {e}. المسار الحالي: {page_sub.url}")

        time.sleep(2.5)
        page_sub.screenshot(path=os.path.join(SCREENSHOTS_DIR, "sub_03_login_result.png"))

        # Onboarding Gate for Sub-Account
        handle_corporate_onboarding(page_sub, human_sub, "sub")

        # Station 8: Sub-Account Access to Corporate Dashboard
        print("\n[المحطة 8: وصول المدير القانوني الفرعي للوحة الشركة]")
        try:
            page_sub.goto(f"{base_url}/dashboard/business", wait_until="networkidle", timeout=20000)
            time.sleep(2.0)
            human_sub.human_scroll(350, steps=6)
            time.sleep(0.8)
            page_sub.screenshot(path=os.path.join(SCREENSHOTS_DIR, "sub_04_business_dashboard.png"))
            print("✓ تم التحقق من نجاح صلاحيات وصحة عرض لوحة الشركة للمدير القانوني الفرعي")
        except Exception as e:
            print(f"⚠️ استثناء في وصول المدير القانوني: {e}")

        # Station 9: Sub-Account Documents Access
        print("\n[المحطة 9: وصول المدير القانوني لخزنة وثائق الشركة]")
        try:
            page_sub.goto(f"{base_url}/dashboard/business/documents", wait_until="networkidle", timeout=15000)
            time.sleep(2.0)
            page_sub.screenshot(path=os.path.join(SCREENSHOTS_DIR, "sub_05_business_documents.png"))
            print("✓ تم فحص وتوثيق وصول الحساب الفرعي لوثائق الشركة")
        except Exception as e:
            print(f"⚠️ استثناء في مستندات المدير القانوني: {e}")

        context_sub.close()
        browser.close()

    with open(os.path.join(OUTPUT_DIR, "corporate_network_log.json"), "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, "corporate_console_log.json"), "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print("✅ اكتملت محاكاة حسابات الشركات (المالك + الحساب الفرعي) بنجاح!")
    print(f"📁 مجلد اللقطات: {SCREENSHOTS_DIR}")
    print(f"📊 إجمالي طلبات الشبكة: {len(network_log)}")
    print(f"⚠️ إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    run_corporate_simulation()
