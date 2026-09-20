"""
Simulate Human Government Entities Behavior on Nezamy Platform (Live / Localhost)
==================================================================================
Target Actors:
1. Judge: government-judge (قاضي)
   Email: government-judge.uat-20260915-full@nzamy.test (UID: 0e8ce426-4ca2-4f81-9147-4e444a5d608d)
2. Prosecutor: government-prosecutor (عضو نيابة عامة)
   Email: government-prosecutor.uat-20260915-full@nzamy.test (UID: 412b0080-0b0c-4e12-a195-9f28ba0efbaf)
3. Officer: government-officer (ضابط تحقيق وضبط جنائي)
   Email: government-officer.uat-20260915-full@nzamy.test (UID: 42fddfc2-fd7b-4e61-a405-0774a5a862fa)
4. Gov Counsel: government-gov_counsel (مستشار قانوني حكومي)
   Email: government-gov_counsel.uat-20260915-full@nzamy.test (UID: 6a639991-d632-4464-960d-75e6bb0149f0)

Password: Uat!co6VNCZijtZNMXV8BWIB9c4Q9
Target URL: https://nezamy.sa (fallback: http://localhost:3000)

Physics: Fast Realistic Human Simulation
- Cubic Bezier mouse curves with velocity ease-in-out profiling
- Natural target bounding box offset
- Pre-click hesitation (150-300ms)
- Mouse hold duration (60-120ms)
- Rhythmic typing (50-120ms per character, extra on punctuation)
- Smooth wheel scrolling
- Explicit synchronization waiting (no premature screenshots of loading spinners)
"""

import sys
import os
import shutil
import time
import math
import random
import json
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright, Page, Locator

BASE_DIR = r"D:\Data\Data\antigravity ai\GIT NZAMY\latest-nzamy-full"
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "uat", "runs", "uat-live-human-run")
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "government")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

BRAIN_CONV_ID = "27ac1089-e845-4eb8-9bfa-f462c2d34cad"
BRAIN_SCREENSHOTS_DIR = os.path.join(r"C:\Users\Judge\.gemini\antigravity\brain", BRAIN_CONV_ID, "screenshots", "government")
os.makedirs(BRAIN_SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

JUDGE_EMAIL = "government-judge.uat-20260915-full@nzamy.test"
PROSECUTOR_EMAIL = "government-prosecutor.uat-20260915-full@nzamy.test"
OFFICER_EMAIL = "government-officer.uat-20260915-full@nzamy.test"
COUNSEL_EMAIL = "government-gov_counsel.uat-20260915-full@nzamy.test"
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


def wait_page_settled(page: Page, timeout: int = 15000):
    """Waits for loading spinners to detach and the React component tree to stabilize."""
    try:
        page.wait_for_selector('.animate-spin', state='detached', timeout=timeout)
    except Exception:
        pass
    time.sleep(2.5)


def save_screenshot(page: Page, filename: str):
    """Saves screenshot both to outputs and brain directory for cross-reference."""
    target_path = os.path.join(SCREENSHOTS_DIR, filename)
    page.screenshot(path=target_path)
    brain_path = os.path.join(BRAIN_SCREENSHOTS_DIR, filename)
    try:
        shutil.copy2(target_path, brain_path)
    except Exception:
        pass
    size = os.path.getsize(target_path)
    print(f"  📸 تم حفظ اللقطة: {filename} (الحجم: {size:,} بايت)")


def handle_gov_onboarding(page: Page, human: HumanDriver, role_name: str = "قاضي"):
    """Handles Government onboarding wizard if intercepted by Onboarding Gate."""
    if "/onboarding" not in page.url:
        return

    print(f"\n[بوابة الإعداد: حساب {role_name} بحاجة لإكمال، بدء إكمال الإعداد بالفيزياء البشرية...]")
    time.sleep(1.5)

    # Step 1: User Type (if visible)
    gov_btn = page.locator('button:has-text("جهة حكومية"), button:has-text("قطاع حكومي")').first
    if gov_btn.is_visible():
        human.hover_and_click(gov_btn)
        time.sleep(0.5)
        next_btn = page.locator('button:has-text("التالي")').first
        if next_btn.is_enabled():
            human.hover_and_click(next_btn)
            time.sleep(1.5)

    # Step 2: What do you need?
    svc_card = page.locator('button:has-text("استشارات قانونية"), button:has-text("عقود ومستندات")').first
    if svc_card.is_visible():
        human.hover_and_click(svc_card)
        time.sleep(0.8)
        next_btn = page.locator('button:has-text("التالي")').first
        if next_btn.is_enabled():
            human.hover_and_click(next_btn)
            time.sleep(1.5)

    # Step 3: Phone & City
    phone_input = page.locator('#ob-phone').first
    if phone_input.is_visible():
        phone_num = f"057{random.randint(1000000, 9999999)}"
        human.human_type(phone_input, phone_num)
        time.sleep(0.5)
        city_select = page.locator('select').first
        if city_select.is_visible():
            city_select.select_option("الرياض")
            time.sleep(0.5)
        next_btn = page.locator('button:has-text("التالي")').first
        if next_btn.is_enabled():
            human.hover_and_click(next_btn)
            time.sleep(1.5)

    # Step 4: Finish / Notifications
    finish_btn = page.locator('button:has-text("إتمام الإعداد"), button:has-text("التالي")').first
    if finish_btn.is_visible():
        human.hover_and_click(finish_btn)
        time.sleep(3.0)

    # Step 5: Go to dashboard
    dash_link = page.locator('a:has-text("اذهب للوحة التحكم"), a[href*="/dashboard"]').first
    if dash_link.is_visible():
        human.hover_and_click(dash_link)
        time.sleep(2.5)

    print(f"✓ اكتمل إعداد حساب {role_name} بنجاح")


def run_government_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري الحي: الجهات والقطاعات الحكومية (Government)")
    print(f"الحسابات المستهدفة: قاضي ({JUDGE_EMAIL})، نيابة ({PROSECUTOR_EMAIL})، ضابط ({OFFICER_EMAIL})، مستشار ({COUNSEL_EMAIL})")
    print(f"البيئة المستهدفة: {LIVE_BASE_URL}")
    print("==================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage"
            ]
        )

        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            locale="ar-SA"
        )

        page = context.new_page()
        human = HumanDriver(page)

        def log_request(request):
            if any(api_sub in request.url for api_sub in ["/api/", "supabase.co"]):
                network_log.append({
                    "timestamp": datetime.now().isoformat(),
                    "method": request.method,
                    "url": request.url,
                    "headers": {k: v for k, v in request.headers.items() if "auth" not in k.lower()}
                })

        def log_response(response):
            if any(api_sub in response.url for api_sub in ["/api/", "supabase.co"]):
                network_log.append({
                    "timestamp": datetime.now().isoformat(),
                    "status": response.status,
                    "url": response.url,
                    "status_text": response.status_text
                })

        def log_console(msg):
            console_log.append({
                "timestamp": datetime.now().isoformat(),
                "type": msg.type,
                "text": msg.text,
                "location": msg.location
            })

        page.on("request", log_request)
        page.on("response", log_response)
        page.on("console", log_console)

        # =========================================================================
        # 1. القاضي (government-judge)
        # =========================================================================
        print("\n--- 1. جلسة القاضي (government-judge) ---")
        page.goto(f"{LIVE_BASE_URL}/login", wait_until="networkidle", timeout=45000)
        time.sleep(2.0)
        save_screenshot(page, "01_judge_login_page.png")

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, JUDGE_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "02_judge_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.0)

        # Handle onboarding if intercepted
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="قاضي")

        page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="قاضي")
            page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "03_judge_dashboard_top.png")

        human.human_scroll(500)
        time.sleep(1.5)
        save_screenshot(page, "04_judge_dashboard_tools.png")

        # Test Judge Cases
        print("  - فحص القضايا والأحكام للقاضي (/dashboard/government/cases?role=judge)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/government/cases?role=judge", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "05_judge_cases_page.png")

        # Test Judge Reports
        print("  - فحص التقارير القضائية (/dashboard/government/reports?role=judge)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/government/reports?role=judge", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "06_judge_reports_page.png")

        # Logout Judge
        print("  - تسجيل خروج القاضي")
        page.goto(f"{LIVE_BASE_URL}/logout", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        context.clear_cookies()

        # =========================================================================
        # 2. عضو النيابة العامة (government-prosecutor)
        # =========================================================================
        print("\n--- 2. جلسة عضو النيابة العامة (government-prosecutor) ---")
        page.goto(f"{LIVE_BASE_URL}/login", wait_until="networkidle", timeout=45000)
        time.sleep(2.0)

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, PROSECUTOR_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "07_prosecutor_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.0)

        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="نيابة")

        page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="نيابة")
            page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "08_prosecutor_dashboard_top.png")

        human.human_scroll(500)
        time.sleep(1.5)
        save_screenshot(page, "09_prosecutor_dashboard_tools.png")

        # Test Prosecutor Cases / Investigations
        print("  - فحص ملفات التحقيق للنيابة (/dashboard/government/cases?role=prosecutor)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/government/cases?role=prosecutor", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "10_prosecutor_cases_page.png")

        # Logout Prosecutor
        print("  - تسجيل خروج عضو النيابة")
        page.goto(f"{LIVE_BASE_URL}/logout", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        context.clear_cookies()

        # =========================================================================
        # 3. ضابط التحقيق والضبط الجنائي (government-officer)
        # =========================================================================
        print("\n--- 3. جلسة ضابط الضبط الجنائي (government-officer) ---")
        page.goto(f"{LIVE_BASE_URL}/login", wait_until="networkidle", timeout=45000)
        time.sleep(2.0)

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, OFFICER_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "11_officer_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.0)

        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="ضابط")

        page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="ضابط")
            page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "12_officer_dashboard_top.png")

        human.human_scroll(500)
        time.sleep(1.5)
        save_screenshot(page, "13_officer_dashboard_tools.png")

        # Logout Officer
        print("  - تسجيل خروج الضابط")
        page.goto(f"{LIVE_BASE_URL}/logout", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        context.clear_cookies()

        # =========================================================================
        # 4. المستشار القانوني الحكومي (government-gov_counsel)
        # =========================================================================
        print("\n--- 4. جلسة المستشار القانوني الحكومي (government-gov_counsel) ---")
        page.goto(f"{LIVE_BASE_URL}/login", wait_until="networkidle", timeout=45000)
        time.sleep(2.0)

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, COUNSEL_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "14_gov_counsel_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.0)

        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="مستشار حكومي")

        page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_gov_onboarding(page, human, role_name="مستشار حكومي")
            page.goto(f"{LIVE_BASE_URL}/dashboard/government", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "15_gov_counsel_dashboard_top.png")

        human.human_scroll(500)
        time.sleep(1.5)
        save_screenshot(page, "16_gov_counsel_dashboard_tools.png")

        # Test Government Contracts
        print("  - فحص العقود الحكومية والمنافسات (/dashboard/government/contracts)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/government/contracts", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "17_government_contracts_page.png")

        # Test Government Compliance
        print("  - فحص الامتثال القانوني والرقابي (/dashboard/government/compliance)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/government/compliance", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "18_government_compliance_page.png")

        # Final logout
        page.goto(f"{LIVE_BASE_URL}/logout", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        context.close()
        browser.close()

    # Write logs
    net_log_path = os.path.join(OUTPUT_DIR, "government_network_log.json")
    with open(net_log_path, "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    console_log_path = os.path.join(OUTPUT_DIR, "government_console_log.json")
    with open(console_log_path, "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print("✓ اكتملت بنجاح محاكاة السلوك البشري للجهات الحكومية (Government Entities)!")
    print(f"إجمالي الطلبات المسجلة: {len(network_log)}")
    print(f"إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    run_government_simulation()
