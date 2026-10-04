"""
Simulate Human Lawyer Behavior on Nezamy Platform (Live / Localhost)
=====================================================================
Target Actor: lawyer-solo (المحامي الفرد)
Email: default below, override via env UAT_LAWYER_EMAIL
Password: set via env UAT_PASSWORD (required, no default)
Target: local by default (http://localhost:3000); --live + env UAT_ALLOW_LIVE=1 required for production

Physics: Fast Realistic Human Simulation
- Cubic Bezier mouse curves with velocity ease-in-out profiling
- Natural target bounding box offset (35-65% region)
- Pre-click hesitation (150-300ms)
- Mouse hold duration (60-120ms)
- Rhythmic typing (50-120ms per character, extra on punctuation 120-220ms)
- Smooth wheel scrolling with multi-step ease
"""

import sys
import os
import time
import math
import random
import json
import argparse
import urllib.request
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright, Page, Locator

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "uat", "runs", "uat-live-human-run")
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

ACTOR_EMAIL = os.environ.get("UAT_LAWYER_EMAIL", "lawyer-solo.uat-20260915-full@nzamy.test")
ACTOR_PASSWORD = os.environ.get("UAT_PASSWORD")
if not ACTOR_PASSWORD:
    print("[Config] UAT_PASSWORD environment variable is not set. Set it before running this script.")
    sys.exit(2)


def check_target_environment(mode: str = "auto") -> str:
    """Probe network connectivity and select between Live and Local environments."""
    if mode == "live":
        print(f"[EnvSelector] Forced live target: {LIVE_BASE_URL}")
        return LIVE_BASE_URL
    if mode == "local":
        print(f"[EnvSelector] Forced local target: {LOCAL_BASE_URL}")
        return LOCAL_BASE_URL

    print(f"[EnvSelector] Probing live environment connectivity at {LIVE_BASE_URL} ...")
    try:
        req = urllib.request.Request(
            f"{LIVE_BASE_URL}/login",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            },
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.getcode() == 200:
                print(f"  [OK] Live environment {LIVE_BASE_URL} is online and responsive.")
                return LIVE_BASE_URL
    except Exception as e:
        print(f"  [Warning] Live environment check failed ({e}).")

    print(f"  --> Falling back to local environment: {LOCAL_BASE_URL}")
    return LOCAL_BASE_URL


class HumanDriver:
    """Simulates realistic human mouse and keyboard interactions."""

    def __init__(self, page: Page):
        self.page = page
        self.cur_x = random.randint(150, 350)
        self.cur_y = random.randint(150, 350)
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

        # Normal vector perpendicular to trajectory
        nx = -dy / dist
        ny = dx / dist

        # Curvature deviation
        arc1 = (random.random() - 0.5) * 0.25 * dist
        arc2 = (random.random() - 0.5) * 0.25 * dist

        p1 = (p0[0] + 0.33 * dx + nx * arc1, p0[1] + 0.33 * dy + ny * arc1)
        p2 = (p0[0] + 0.66 * dx + nx * arc2, p0[1] + 0.66 * dy + ny * arc2)

        steps = max(12, int(dist / (18 * speed_factor)))
        for step in range(1, steps + 1):
            raw_t = step / steps
            # Ease-in-out curve
            t = 3 * (raw_t ** 2) - 2 * (raw_t ** 3)
            bx, by = self._bezier_point(p0, p1, p2, p3, t)

            # Micro jitter near target
            if raw_t > 0.85 and step < steps:
                bx += random.uniform(-0.6, 0.6)
                by += random.uniform(-0.6, 0.6)

            self.page.mouse.move(bx, by)
            time.sleep(random.uniform(0.005, 0.012))

        self.cur_x, self.cur_y = target_x, target_y

    def hover_and_click(self, locator: Locator, click: bool = True, button: str = "left"):
        """Human-like hover and click on element."""
        locator.scroll_into_view_if_needed()
        box = locator.bounding_box()
        if not box:
            print("  [HumanDriver] Notice: Element bounding box not visible, attempting standard click")
            if click:
                locator.click()
            return

        # Slight random offset from center
        offset_x = box["x"] + box["width"] * random.uniform(0.35, 0.65)
        offset_y = box["y"] + box["height"] * random.uniform(0.35, 0.65)

        # Bezier move
        self.move_to(offset_x, offset_y)

        # Natural hesitation before click: 150-300ms
        time.sleep(random.uniform(0.15, 0.30))

        if click:
            self.page.mouse.down(button=button)
            # Mouse hold duration: 60-120ms
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
            if ch in (' ', '\n', '،', '-', '.', ':', '؟'):
                time.sleep(random.uniform(0.12, 0.22))
            else:
                time.sleep(random.uniform(0.05, 0.12))

    def human_scroll(self, delta_y: int, steps: int = 6):
        """Scroll smoothly using wheel steps."""
        step_dy = delta_y / steps
        for _ in range(steps):
            self.page.mouse.wheel(0, step_dy)
            time.sleep(random.uniform(0.03, 0.07))


class UatAuditor:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.network_logs = []
        self.console_logs = []
        self.findings = []
        self.stations = {}

    def log_response(self, res):
        req = res.request
        url = res.url
        if any(marker in url for marker in ["/api/", "/rest/v1/", "/auth/v1/"]):
            entry = {
                "timestamp": datetime.now().isoformat(),
                "method": req.method,
                "url": url,
                "status": res.status,
                "headers": dict(res.headers),
            }
            try:
                ct = res.headers.get("content-type", "")
                if "application/json" in ct or "text" in ct:
                    entry["body_preview"] = res.text()[:500]
            except Exception:
                pass
            self.network_logs.append(entry)

    def log_console(self, msg):
        self.console_logs.append({
            "timestamp": datetime.now().isoformat(),
            "type": msg.type,
            "text": msg.text,
            "location": msg.location,
        })


def run_simulation(target_mode: str = "auto"):
    target_url = check_target_environment(target_mode)

    print("=" * 70)
    print("STARTING UAT HUMAN SIMULATION: LAWYER-SOLO")
    print(f"Target Base URL: {target_url}")
    print(f"Actor Email:     {ACTOR_EMAIL}")
    print("=" * 70)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ],
        )

        context = browser.new_context(
            viewport={"width": 1366, "height": 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            locale="ar-SA",
            timezone_id="Asia/Riyadh",
        )

        page = context.new_page()
        human = HumanDriver(page)
        auditor = UatAuditor(target_url)

        page.on("response", auditor.log_response)
        page.on("console", auditor.log_console)

        results = {
            "run_id": f"uat-human-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "base_url": target_url,
            "actor": ACTOR_EMAIL,
            "stations": {},
            "findings": [],
        }

        # -------------------------------------------------------------
        # STATION 01: LOGIN (/login)
        # -------------------------------------------------------------
        print("\n--- STATION 01: LOGIN ---")
        try:
            page.goto(f"{target_url}/login", wait_until="networkidle", timeout=30000)
            human.human_scroll(100)
            time.sleep(0.5)

            shot1 = os.path.join(SCREENSHOTS_DIR, "01_login_initial.png")
            page.screenshot(path=shot1, full_page=True)
            print(f"  [Screenshot] {shot1}")

            # Fill Email
            email_input = page.locator('input[type="email"]').first
            print("  [Human] Typing email...")
            human.human_type(email_input, ACTOR_EMAIL)

            # Fill Password
            pwd_input = page.locator('input[type="password"]').first
            print("  [Human] Typing password...")
            human.human_type(pwd_input, ACTOR_PASSWORD)

            shot2 = os.path.join(SCREENSHOTS_DIR, "02_login_filled.png")
            page.screenshot(path=shot2, full_page=True)
            print(f"  [Screenshot] {shot2}")

            # Click Submit
            submit_btn = page.locator('button:has-text("دخول"), button:has-text("Sign In")').first
            print("  [Human] Hovering and clicking submit button...")
            human.hover_and_click(submit_btn)

            # Wait for navigation or token
            page.wait_for_timeout(5000)
            page.wait_for_load_state("networkidle", timeout=10000)

            shot3 = os.path.join(SCREENSHOTS_DIR, "03_login_result.png")
            page.screenshot(path=shot3, full_page=True)
            print(f"  [Screenshot] {shot3}")

            current_url = page.url
            print(f"  URL after login attempt: {current_url}")

            login_success = "/dashboard/lawyer" in current_url or "/dashboard" in current_url
            results["stations"]["station_01_login"] = {
                "status": "passed" if login_success else "failed",
                "current_url": current_url,
                "screenshot": "03_login_result.png",
            }
            if not login_success:
                results["findings"].append({
                    "id": "AUTH-001",
                    "severity": "P0",
                    "title": "Login failed to redirect to lawyer dashboard",
                    "url": current_url,
                })
        except Exception as e:
            print(f"  [Error Station 01] {e}")
            results["stations"]["station_01_login"] = {"status": "error", "error": str(e)}

        # -------------------------------------------------------------
        # STATION 02: LAWYER DASHBOARD (/dashboard/lawyer)
        # -------------------------------------------------------------
        print("\n--- STATION 02: LAWYER DASHBOARD ---")
        try:
            if page.url != f"{target_url}/dashboard/lawyer":
                print("  Navigating to /dashboard/lawyer...")
                page.goto(f"{target_url}/dashboard/lawyer", wait_until="networkidle", timeout=30000)

            time.sleep(2)
            human.human_scroll(250)
            time.sleep(0.5)
            human.human_scroll(-150)
            time.sleep(0.5)

            shot4 = os.path.join(SCREENSHOTS_DIR, "04_lawyer_dashboard.png")
            page.screenshot(path=shot4, full_page=True)
            print(f"  [Screenshot] {shot4}")

            # Precise error check: look for actual error banners or alert roles (NOT decorative red badges)
            has_error = (
                page.locator('[role="alert"]').count() > 0 or
                page.locator('.error-banner').count() > 0 or
                page.locator('.toast-error').count() > 0 or
                page.locator('text="حدث خطأ"').count() > 0 or
                page.locator('text="تعذّر تحميل"').count() > 0
            )
            dash_title = page.title()

            results["stations"]["station_02_dashboard"] = {
                "status": "passed" if "/dashboard/lawyer" in page.url else "failed",
                "title": dash_title,
                "url": page.url,
                "has_error_visual": has_error,
                "screenshot": "04_lawyer_dashboard.png",
            }
        except Exception as e:
            print(f"  [Error Station 02] {e}")
            results["stations"]["station_02_dashboard"] = {"status": "error", "error": str(e)}

        # -------------------------------------------------------------
        # STATION 03: CASES & ADD CASE MODAL (/dashboard/lawyer/cases)
        # -------------------------------------------------------------
        print("\n--- STATION 03: CASES & ADD CASE MODAL ---")
        try:
            print("  Navigating to /dashboard/lawyer/cases...")
            page.goto(f"{target_url}/dashboard/lawyer/cases", wait_until="networkidle", timeout=30000)
            time.sleep(1.5)

            shot5 = os.path.join(SCREENSHOTS_DIR, "05_cases_page.png")
            page.screenshot(path=shot5, full_page=True)
            print(f"  [Screenshot] {shot5}")

            # Locate "قضية جديدة" button
            add_case_btn = page.locator('button:has-text("قضية جديدة")').first
            if add_case_btn.is_visible():
                print("  [Human] Clicking 'قضية جديدة' button...")
                human.hover_and_click(add_case_btn)
                time.sleep(1)

                shot6 = os.path.join(SCREENSHOTS_DIR, "06_cases_modal_empty.png")
                page.screenshot(path=shot6, full_page=True)
                print(f"  [Screenshot] {shot6}")

                # Enter Case Details: Step 1
                print("  [Human] Entering client name...")
                client_input = page.locator('input[placeholder*="اختر الموكل"], input[placeholder*="الموكل"]').first
                human.human_type(client_input, "عبدالله بن سعود الشمري")

                print("  [Human] Entering case title...")
                title_input = page.locator('input[placeholder*="مطالبة مالية"], input[placeholder*="عنوان القضية"]').first
                human.human_type(title_input, "دعوى مطالبة بمستحقات عقد مقاولة وتوريد")

                shot7 = os.path.join(SCREENSHOTS_DIR, "07_cases_modal_step1_filled.png")
                page.screenshot(path=shot7, full_page=True)
                print(f"  [Screenshot] {shot7}")

                # Click "التالي"
                next_btn = page.locator('button:has-text("التالي")').first
                print("  [Human] Clicking 'التالي' button after filling...")
                human.hover_and_click(next_btn)
                time.sleep(1)

                # Step 2: Priority and Description
                print("  [Human] Selecting priority 'عاجلة'...")
                urgent_btn = page.locator('button:has-text("عاجلة")').first
                if urgent_btn.is_visible():
                    human.hover_and_click(urgent_btn)

                print("  [Human] Entering description...")
                desc_input = page.locator('textarea[placeholder*="ملخص"], textarea').first
                human.human_type(desc_input, "مطالبة بمبلغ 250,000 ريال بموجب فواتير مصدقة وشهادة إنجاز أعمال غير مسددة.")

                shot8 = os.path.join(SCREENSHOTS_DIR, "08_cases_modal_step2_filled.png")
                page.screenshot(path=shot8, full_page=True)
                print(f"  [Screenshot] {shot8}")

                # Click "حفظ واعتماد"
                save_btn = page.locator('button:has-text("حفظ واعتماد")').first
                print("  [Human] Clicking 'حفظ واعتماد' button...")
                human.hover_and_click(save_btn)

                # Wait for API mutation response
                time.sleep(4)

                shot9 = os.path.join(SCREENSHOTS_DIR, "09_cases_modal_save_result.png")
                page.screenshot(path=shot9, full_page=True)
                print(f"  [Screenshot] {shot9}")

                # Check if modal closed or success/error message
                modal_error = page.locator('text=تعذّر إضافة القضية').first
                has_save_error = modal_error.is_visible()
                save_err_text = modal_error.inner_text() if has_save_error else None

                success_msg = page.locator('text=تم إضافة القضية بنجاح').first
                has_save_success = success_msg.is_visible()

                # Refresh page to check if case was persisted in DB
                print("  Reloading cases page to verify persistence...")
                page.reload(wait_until="networkidle")
                time.sleep(2)

                shot10 = os.path.join(SCREENSHOTS_DIR, "10_cases_list_after_save.png")
                page.screenshot(path=shot10, full_page=True)
                print(f"  [Screenshot] {shot10}")

                results["stations"]["station_03_cases"] = {
                    "modal_opened": True,
                    "save_attempted": True,
                    "save_success_visual": has_save_success,
                    "save_error_visual": has_save_error,
                    "save_error_text": save_err_text,
                    "screenshot_modal": "09_cases_modal_save_result.png",
                    "screenshot_list": "10_cases_list_after_save.png",
                }

                if has_save_error:
                    results["findings"].append({
                        "id": "UAT-CASE-001",
                        "severity": "P1",
                        "title": f"Case creation failed: {save_err_text}",
                        "file": "src/app/dashboard/lawyer/_components/AddCaseModal.tsx",
                    })
            else:
                print("  [Warning] 'قضية جديدة' button not found on cases page")
                results["stations"]["station_03_cases"] = {"modal_opened": False}
        except Exception as e:
            print(f"  [Error Station 03] {e}")
            results["stations"]["station_03_cases"] = {"status": "error", "error": str(e)}

        # -------------------------------------------------------------
        # STATION 04: HEARINGS (/dashboard/lawyer/hearings)
        # -------------------------------------------------------------
        print("\n--- STATION 04: HEARINGS ---")
        try:
            print("  Navigating to /dashboard/lawyer/hearings...")
            page.goto(f"{target_url}/dashboard/lawyer/hearings", wait_until="networkidle", timeout=30000)
            time.sleep(2)
            human.human_scroll(200)
            time.sleep(0.5)

            shot11 = os.path.join(SCREENSHOTS_DIR, "11_hearings_page.png")
            page.screenshot(path=shot11, full_page=True)
            print(f"  [Screenshot] {shot11}")

            has_hearings_error = page.query_selector('text=تعذّر تحميل') is not None
            results["stations"]["station_04_hearings"] = {
                "status": "passed" if "/dashboard/lawyer/hearings" in page.url else "failed",
                "url": page.url,
                "has_error": has_hearings_error,
                "screenshot": "11_hearings_page.png",
            }
        except Exception as e:
            print(f"  [Error Station 04] {e}")
            results["stations"]["station_04_hearings"] = {"status": "error", "error": str(e)}

        # -------------------------------------------------------------
        # STATION 05: CLIENTS (/dashboard/lawyer/clients)
        # -------------------------------------------------------------
        print("\n--- STATION 05: CLIENTS ---")
        try:
            print("  Navigating to /dashboard/lawyer/clients...")
            page.goto(f"{target_url}/dashboard/lawyer/clients", wait_until="networkidle", timeout=30000)
            time.sleep(2)
            human.human_scroll(200)
            time.sleep(0.5)

            shot12 = os.path.join(SCREENSHOTS_DIR, "12_clients_page.png")
            page.screenshot(path=shot12, full_page=True)
            print(f"  [Screenshot] {shot12}")

            has_clients_error = page.query_selector('text=تعذّر تحميل') is not None
            results["stations"]["station_05_clients"] = {
                "status": "passed" if "/dashboard/lawyer/clients" in page.url else "failed",
                "url": page.url,
                "has_error": has_clients_error,
                "screenshot": "12_clients_page.png",
            }
        except Exception as e:
            print(f"  [Error Station 05] {e}")
            results["stations"]["station_05_clients"] = {"status": "error", "error": str(e)}

        # -------------------------------------------------------------
        # STATION 06: AI LEGAL DRAFT (/ai/draft)
        # -------------------------------------------------------------
        print("\n--- STATION 06: AI LEGAL DRAFT ---")
        try:
            print("  Navigating to /ai/draft...")
            page.goto(f"{target_url}/ai/draft", wait_until="networkidle", timeout=30000)
            time.sleep(2)

            shot13 = os.path.join(SCREENSHOTS_DIR, "13_ai_draft_page.png")
            page.screenshot(path=shot13, full_page=True)
            print(f"  [Screenshot] {shot13}")

            current_url = page.url
            is_redirected_to_login = "/login" in current_url
            has_forbidden = page.query_selector('text=صلاحيات غير كافية') is not None

            # Interactive exploration: human scroll and card hover
            human.human_scroll(180)
            time.sleep(0.5)

            results["stations"]["station_06_ai_draft"] = {
                "target_url": f"{target_url}/ai/draft",
                "final_url": current_url,
                "session_persisted": not is_redirected_to_login,
                "has_forbidden": has_forbidden,
                "screenshot": "13_ai_draft_page.png",
            }

            if is_redirected_to_login:
                results["findings"].append({
                    "id": "UAT-SESSION-001",
                    "severity": "P0",
                    "title": "Opening /ai/draft redirected authenticated lawyer to /login",
                    "url": current_url,
                    "file": "src/proxy.ts",
                })
            elif has_forbidden:
                results["findings"].append({
                    "id": "UAT-DRAFT-001",
                    "severity": "P1",
                    "title": "AI Draft displayed 'صلاحيات غير كافية' to lawyer",
                    "file": "src/app/ai/layout.tsx",
                })
        except Exception as e:
            print(f"  [Error Station 06] {e}")
            results["stations"]["station_06_ai_draft"] = {"status": "error", "error": str(e)}

        # -------------------------------------------------------------
        # STATION 07: AI DIRECTION SUPPORT (/ai/direction-support)
        # -------------------------------------------------------------
        print("\n--- STATION 07: AI DIRECTION SUPPORT ---")
        try:
            print("  Navigating to /ai/direction-support...")
            page.goto(f"{target_url}/ai/direction-support", wait_until="networkidle", timeout=30000)
            time.sleep(2)

            shot14 = os.path.join(SCREENSHOTS_DIR, "14_ai_direction_support_page.png")
            page.screenshot(path=shot14, full_page=True)
            print(f"  [Screenshot] {shot14}")

            current_url = page.url
            is_redirected_to_login = "/login" in current_url
            has_forbidden = page.query_selector('text=صلاحيات غير كافية') is not None
            has_tool_title = page.locator('h1, h2, h3, p:has-text("داعم الاتجاه")').count() > 0

            # Interactive Human Action: Input legal claim and select legal branch
            direction_textarea = page.locator('textarea').first
            if direction_textarea.is_visible():
                print("  [Human] Typing legal direction claim in textarea...")
                human.human_type(
                    direction_textarea,
                    "أريد نصوصاً وأحكاماً قضائية تدعم موقفي في المطالبة بالتعويض عن الإخلال بعقد المقاولة والتوريد والتأخر في التسليم."
                )
                time.sleep(1)

                # Click legal branch 'تجاري'
                commercial_btn = page.locator('button:has-text("تجاري")').first
                if commercial_btn.is_visible():
                    print("  [Human] Selecting 'تجاري' legal branch...")
                    human.hover_and_click(commercial_btn)
                    time.sleep(1)

                shot15 = os.path.join(SCREENSHOTS_DIR, "15_ai_direction_support_filled.png")
                page.screenshot(path=shot15, full_page=True)
                print(f"  [Screenshot] {shot15}")

            results["stations"]["station_07_direction_support"] = {
                "target_url": f"{target_url}/ai/direction-support",
                "final_url": current_url,
                "session_persisted": not is_redirected_to_login,
                "has_forbidden": has_forbidden,
                "tool_rendered": has_tool_title,
                "screenshot": "14_ai_direction_support_page.png",
                "screenshot_interactive": "15_ai_direction_support_filled.png",
            }

            if has_forbidden:
                results["findings"].append({
                    "id": "UAT-AI-001",
                    "severity": "P1",
                    "title": "/ai/direction-support displays 'صلاحيات غير كافية' to authenticated lawyer",
                    "file": "src/app/ai/layout.tsx and src/proxy.ts",
                })
            elif is_redirected_to_login:
                results["findings"].append({
                    "id": "UAT-SESSION-002",
                    "severity": "P0",
                    "title": "Opening /ai/direction-support redirected lawyer to /login",
                    "url": current_url,
                })
        except Exception as e:
            print(f"  [Error Station 07] {e}")
            results["stations"]["station_07_direction_support"] = {"status": "error", "error": str(e)}

        # Save logs and summary
        with open(os.path.join(OUTPUT_DIR, "network_log.json"), "w", encoding="utf-8") as f:
            json.dump(auditor.network_logs, f, ensure_ascii=False, indent=2)

        with open(os.path.join(OUTPUT_DIR, "console_log.json"), "w", encoding="utf-8") as f:
            json.dump(auditor.console_logs, f, ensure_ascii=False, indent=2)

        with open(os.path.join(OUTPUT_DIR, "run_summary.json"), "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        print("\n" + "=" * 70)
        print("SIMULATION COMPLETE")
        print(f"Summary written to: {os.path.join(OUTPUT_DIR, 'run_summary.json')}")
        print("=" * 70)

        browser.close()
        return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate Human Lawyer Behavior")
    parser.add_argument("--target", choices=["live", "local", "auto"], default="local",
                         help="Target environment (default: local; 'auto' no longer probes production on its own)")
    parser.add_argument("--live", action="store_true",
                         help="Required (together with env UAT_ALLOW_LIVE=1) to target the live production site")
    args = parser.parse_args()

    if args.target == "live" and not args.live:
        print("[EnvSelector] --target live also requires --live to be passed explicitly. Refusing to target production.")
        sys.exit(2)

    if args.live:
        if os.environ.get("UAT_ALLOW_LIVE") != "1":
            print("[EnvSelector] --live requires env UAT_ALLOW_LIVE=1 to be set. Refusing to target production.")
            sys.exit(2)
        target_mode = "live"
    elif args.target == "auto":
        print("[EnvSelector] 'auto' no longer probes production automatically; defaulting to local. Pass --live to target production.")
        target_mode = "local"
    else:
        target_mode = args.target

    print(f"[EnvSelector] Target: {LIVE_BASE_URL if target_mode == 'live' else LOCAL_BASE_URL}")
    run_simulation(target_mode=target_mode)
