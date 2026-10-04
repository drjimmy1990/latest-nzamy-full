"""
Simulate Human System Admin Behavior on Nezamy Platform (Live / Localhost)
==========================================================================
Target Actor:
Admin Core: admin (إدارة المنصة المركزية)
Email: default below, override via env UAT_ADMIN_EMAIL
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
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "admin")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

BRAIN_CONV_ID = "27ac1089-e845-4eb8-9bfa-f462c2d34cad"
BRAIN_SCREENSHOTS_DIR = os.environ.get("UAT_BRAIN_SCREENSHOTS_DIR")
if BRAIN_SCREENSHOTS_DIR:
    os.makedirs(BRAIN_SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

ADMIN_EMAIL = os.environ.get("UAT_ADMIN_EMAIL", "admin.uat-20260915-full@nzamy.test")
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


def safe_goto(page: Page, url: str):
    """Navigates to URL and waits for DOM and spinners without getting hung up on open connections."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
    except Exception as e:
        print(f"  [Nav note] {e}")
    wait_page_settled(page)


def run_admin_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري الحي: إدارة المنصة المركزية (Admin)")
    print(f"الحساب المستهدف: {ADMIN_EMAIL}")
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

        # 1. Login Admin
        print("\n--- 1. تسجيل دخول مدير المنصة (admin-core) ---")
        safe_goto(page, f"{LIVE_BASE_URL}/login")
        save_screenshot(page, "01_admin_login_page.png")

        email_input = page.locator('input[type="email"], #email').first
        pass_input = page.locator('input[type="password"], #password').first
        submit_btn = page.locator('button[type="submit"]').first

        human.human_type(email_input, ADMIN_EMAIL)
        time.sleep(0.4)
        human.human_type(pass_input, UNIVERSAL_PASSWORD)
        time.sleep(0.6)
        save_screenshot(page, "02_admin_creds_filled.png")

        human.hover_and_click(submit_btn)
        page.wait_for_load_state("networkidle", timeout=30000)
        time.sleep(3.5)

        # Navigate to Admin Dashboard
        if "/dashboard/admin" not in page.url:
            safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin")
        wait_page_settled(page)
        save_screenshot(page, "03_admin_dashboard_top.png")

        # Scroll to inspect dashboard overview
        human.human_scroll(500)
        time.sleep(1.5)
        save_screenshot(page, "04_admin_dashboard_kpis.png")

        human.human_scroll(600)
        time.sleep(1.5)
        save_screenshot(page, "05_admin_dashboard_actions.png")

        # 2. Admin Users Management
        print("  - فحص إدارة المستخدمين (/dashboard/admin/users)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/users")
        save_screenshot(page, "06_admin_users_page.png")

        # 3. Admin Subscriptions
        print("  - فحص إدارة الاشتراكات والباقات (/dashboard/admin/subscriptions)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/subscriptions")
        save_screenshot(page, "07_admin_subscriptions_page.png")

        # 4. Service Orders
        print("  - فحص طلبات الخدمات والعقود (/dashboard/admin/service-orders)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/service-orders")
        save_screenshot(page, "08_admin_service_orders_page.png")

        # 5. Provider Verification Queue
        print("  - فحص طابور التحقق المهني للمزودين (/dashboard/admin/provider-verification)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/provider-verification")
        save_screenshot(page, "09_admin_verification_queue_page.png")

        # 6. Pricing Packages
        print("  - فحص أسعار وحزم المنصة (/dashboard/admin/pricing)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/pricing")
        save_screenshot(page, "10_admin_pricing_page.png")

        # 7. Audit Log
        print("  - فحص سجل التدقيق والأمان (/dashboard/admin/audit-log)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/audit-log")
        save_screenshot(page, "11_admin_audit_log_page.png")

        # 8. Security & Platform Health
        print("  - فحص حماية المنصة وجاهزية النظام (/dashboard/admin/security)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/security")
        save_screenshot(page, "12_admin_security_page.png")

        # 9. AI Usage & Tokens
        print("  - فحص استهلاك الذكاء الاصطناعي (/dashboard/admin/ai-usage)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/ai-usage")
        save_screenshot(page, "13_admin_ai_usage_page.png")

        # 10. Disputes & Escrow
        print("  - فحص النزاعات والضمان المالي (/dashboard/admin/disputes)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/disputes")
        save_screenshot(page, "14_admin_disputes_page.png")

        # 11. System Health
        print("  - فحص لوحة النظام العامة (/dashboard/admin/system)")
        safe_goto(page, f"{LIVE_BASE_URL}/dashboard/admin/system")
        save_screenshot(page, "15_admin_system_page.png")

        # Logout
        print("  - تسجيل خروج مدير المنصة")
        safe_goto(page, f"{LIVE_BASE_URL}/logout")
        time.sleep(2.0)
        context.close()
        browser.close()

    # Write logs
    net_log_path = os.path.join(OUTPUT_DIR, "admin_network_log.json")
    with open(net_log_path, "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    console_log_path = os.path.join(OUTPUT_DIR, "admin_console_log.json")
    with open(console_log_path, "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print("✓ اكتملت بنجاح محاكاة السلوك البشري لإدارة المنصة (System Admin)!")
    print(f"إجمالي الطلبات المسجلة: {len(network_log)}")
    print(f"إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate Human System Admin Behavior")
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
    run_admin_simulation()
