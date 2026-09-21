"""
Simulate Human Justice Providers Behavior on Nezamy Platform (Live / Localhost)
================================================================================
Target Actors:
1. Provider Notary: provider-notary (موثّق معتمد)
   Email: default below, override via env UAT_PROVIDER_NOTARY_EMAIL
2. Provider Arbitrator: provider-arbitrator (محكّم معتمد)
   Email: default below, override via env UAT_PROVIDER_ARBITRATOR_EMAIL
3. Provider Bailiff: provider-bailiff (موجّه / مراجع معتمد)
   Email: default below, override via env UAT_PROVIDER_BAILIFF_EMAIL

Password: set via env UAT_PASSWORD (required, no default)
Target: local by default (http://localhost:3000); --live + env UAT_ALLOW_LIVE=1 required for production

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
import argparse
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright, Page, Locator

BASE_DIR = r"D:\Data\Data\antigravity ai\GIT NZAMY\latest-nzamy-full"
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "uat", "runs", "uat-live-human-run")
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "provider")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

BRAIN_CONV_ID = "27ac1089-e845-4eb8-9bfa-f462c2d34cad"
BRAIN_SCREENSHOTS_DIR = os.environ.get("UAT_BRAIN_SCREENSHOTS_DIR")
if BRAIN_SCREENSHOTS_DIR:
    os.makedirs(BRAIN_SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

NOTARY_EMAIL = os.environ.get("UAT_PROVIDER_NOTARY_EMAIL", "provider-notary.uat-20260915-full@nzamy.test")
ARBITRATOR_EMAIL = os.environ.get("UAT_PROVIDER_ARBITRATOR_EMAIL", "provider-arbitrator.uat-20260915-full@nzamy.test")
BAILIFF_EMAIL = os.environ.get("UAT_PROVIDER_BAILIFF_EMAIL", "provider-bailiff.uat-20260915-full@nzamy.test")
UNIVERSAL_PASSWORD = os.environ.get("UAT_PASSWORD")
if not UNIVERSAL_PASSWORD:
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
    if BRAIN_SCREENSHOTS_DIR:
        brain_path = os.path.join(BRAIN_SCREENSHOTS_DIR, filename)
        try:
            shutil.copy2(target_path, brain_path)
        except Exception:
            pass
    size = os.path.getsize(target_path)
    print(f"  📸 تم حفظ اللقطة: {filename} (الحجم: {size:,} بايت)")


def handle_provider_onboarding(page: Page, human: HumanDriver, sub_role_name: str = "موثّق"):
    """Handles Provider onboarding wizard if intercepted by Onboarding Gate."""
    if "/onboarding" not in page.url:
        return

    print(f"\n[بوابة الإعداد: حساب {sub_role_name} بحاجة لإكمال، بدء إكمال الإعداد بالفيزياء البشرية...]")
    time.sleep(1.5)

    # Step 1: User Type (if present)
    prov_btn = page.locator('button:has-text("مزوّد خدمة"), button:has-text("مقدم خدمة")').first
    if prov_btn.is_visible():
        human.hover_and_click(prov_btn)
        time.sleep(0.5)
        next_btn = page.locator('button:has-text("التالي")').first
        if next_btn.is_enabled():
            human.hover_and_click(next_btn)
            time.sleep(1.5)

    # Step 2: Specialization / Services
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
        phone_num = f"056{random.randint(1000000, 9999999)}"
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

    print(f"✓ اكتمل إعداد حساب {sub_role_name} بنجاح")


def run_provider_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري الحي: مقدمو العدالة (Justice Providers)")
    print(f"الحسابات المستهدفة: موثق ({NOTARY_EMAIL})، محكم ({ARBITRATOR_EMAIL})، منفذ ({BAILIFF_EMAIL})")
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
        # 1. الموثّق الرسمي (provider-notary)
        # =========================================================================
        print("\n--- 1. جلسة الموثّق الرسمي (provider-notary) ---")
        page.goto(f"{LIVE_BASE_URL}/login", wait_until="networkidle", timeout=45000)
        time.sleep(2.0)
        save_screenshot(page, "01_notary_login_page.png")

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, NOTARY_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "02_notary_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.0)

        # Handle onboarding if intercepted
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_provider_onboarding(page, human, sub_role_name="موثق")

        # Navigate to provider dashboard
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_provider_onboarding(page, human, sub_role_name="موثق")
            page.goto(f"{LIVE_BASE_URL}/dashboard/provider", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "03_notary_dashboard_top.png")

        # Scroll to inspect lower sections
        human.human_scroll(500)
        time.sleep(1.5)
        save_screenshot(page, "04_notary_dashboard_middle.png")

        human.human_scroll(600)
        time.sleep(1.5)
        save_screenshot(page, "05_notary_dashboard_bottom.png")

        # Test Notary Requests
        print("  - فحص طلبات التوثيق (/dashboard/provider/notary/requests)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/notary/requests", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "06_notary_requests_page.png")

        # Test Notary Drafts
        print("  - فحص مسودات التوثيق (/dashboard/provider/notary/drafts)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/notary/drafts", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "07_notary_drafts_page.png")

        # Test Provider Calendar
        print("  - فحص تقويم المواعيد (/dashboard/provider/calendar)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/calendar", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "08_notary_calendar_page.png")

        # Test Provider Earnings
        print("  - فحص الأرباح والمستحقات (/dashboard/provider/earnings)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/earnings", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "09_notary_earnings_page.png")

        # Test Provider Profile
        print("  - فحص الملف التعريفي لمزود الخدمة (/dashboard/provider/profile)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/profile", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "10_notary_profile_page.png")

        # Logout Notary
        print("  - تسجيل خروج الموثّق")
        page.goto(f"{LIVE_BASE_URL}/logout", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        context.clear_cookies()

        # =========================================================================
        # 2. المحكّم المعتمد (provider-arbitrator)
        # =========================================================================
        print("\n--- 2. جلسة المحكّم المعتمد (provider-arbitrator) ---")
        page.goto(f"{LIVE_BASE_URL}/login", wait_until="networkidle", timeout=45000)
        time.sleep(2.0)

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, ARBITRATOR_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "11_arbitrator_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.0)

        # Handle onboarding if intercepted
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_provider_onboarding(page, human, sub_role_name="محكم")

        # Navigate to provider dashboard to test Arbitrator fork
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_provider_onboarding(page, human, sub_role_name="محكم")
            page.goto(f"{LIVE_BASE_URL}/dashboard/provider", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "12_arbitrator_dashboard_main.png")

        # Test Arbitration Cases
        print("  - فحص قضايا التحكيم (/dashboard/provider/arbitration/cases)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/arbitration/cases", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "13_arbitration_cases_page.png")

        # Test Arbitration Hearings
        print("  - فحص جلسات التحكيم (/dashboard/provider/arbitration/hearings)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/arbitration/hearings", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "14_arbitration_hearings_page.png")

        # Test Arbitration Awards / Decisions
        print("  - فحص أحكام وقرارات التحكيم (/dashboard/provider/arbitration/awards)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/arbitration/awards", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "15_arbitration_awards_page.png")

        # Test Arbitration Parties
        print("  - فحص أطراف التحكيم وممثلي الدعوى (/dashboard/provider/arbitration/parties)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/arbitration/parties", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "16_arbitration_parties_page.png")

        # Logout Arbitrator
        print("  - تسجيل خروج المحكّم")
        page.goto(f"{LIVE_BASE_URL}/logout", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        context.clear_cookies()

        # =========================================================================
        # 3. منفّذ الخدمة / المراجع الحكومي (provider-bailiff)
        # =========================================================================
        print("\n--- 3. جلسة المراجع/المنفذ المعتمد (provider-bailiff) ---")
        page.goto(f"{LIVE_BASE_URL}/login", wait_until="networkidle", timeout=45000)
        time.sleep(2.0)

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, BAILIFF_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "17_bailiff_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.0)

        # Handle onboarding if intercepted
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_provider_onboarding(page, human, sub_role_name="منفذ")

        # Navigate to provider dashboard
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        if "/onboarding" in page.url:
            handle_provider_onboarding(page, human, sub_role_name="منفذ")
            page.goto(f"{LIVE_BASE_URL}/dashboard/provider", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "18_bailiff_dashboard_top.png")

        # Test Bailiff Requests
        print("  - فحص طلبات التنفيذ والتعقيب (/dashboard/provider/bailiff/requests)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/bailiff/requests", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "19_bailiff_requests_page.png")

        # Test General Provider Requests
        print("  - فحص كل الطلبات الواردة (/dashboard/provider/requests)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/requests", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "20_provider_all_requests_page.png")

        # Test Provider Reviews
        print("  - فحص التقييمات والسمعة المهنية (/dashboard/provider/reviews)")
        page.goto(f"{LIVE_BASE_URL}/dashboard/provider/reviews", wait_until="networkidle", timeout=30000)
        wait_page_settled(page)
        save_screenshot(page, "21_provider_reviews_page.png")

        # Final logout
        page.goto(f"{LIVE_BASE_URL}/logout", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        context.close()
        browser.close()

    # Write logs
    net_log_path = os.path.join(OUTPUT_DIR, "provider_network_log.json")
    with open(net_log_path, "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    console_log_path = os.path.join(OUTPUT_DIR, "provider_console_log.json")
    with open(console_log_path, "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print("✓ اكتملت بنجاح محاكاة السلوك البشري لمقدمي العدالة (Justice Providers)!")
    print(f"إجمالي الطلبات المسجلة: {len(network_log)}")
    print(f"إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate Human Justice Providers Behavior")
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
    run_provider_simulation()
