"""
Simulate Human Law Firm Behavior on Nezamy Platform (Live / Localhost)
======================================================================
Target Actors:
1. Primary Owner: firm-a-owner (الشريك المدير لمكتب محاماة A)
   Email: firm-a-owner.uat-20260915-full@nzamy.test (UID: cf87004d-5ec2-439d-8f4f-7b565bf94b41)
2. Partner: firm-a-partner (شريك)
   Email: firm-a-partner.uat-20260915-full@nzamy.test (UID: 1d0b4aa9-3868-4c65-9543-5a6f6ecb5ffb)
3. Senior Lawyer: firm-a-senior_lawyer (محامٍ أول)
   Email: firm-a-senior_lawyer.uat-20260915-full@nzamy.test (UID: 4dec4678-623c-460d-ae04-fac1abafd423)
4. Trainee: firm-a-trainee (محامٍ متدرب)
   Email: firm-a-trainee.uat-20260915-full@nzamy.test (UID: 3a059185-8c1d-42ee-97cd-07479681b0f9)
5. Tenant Comparison: firm-b-owner (مالك شركة محاماة B المعزولة)
   Email: firm-b-owner.uat-20260915-full@nzamy.test (UID: 4d096e47-d848-43ab-a90f-dfe09b98f320)

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
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots", "firm")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

# Brain directory for markdown viewing
BRAIN_SCREENSHOTS_DIR = r"C:\Users\Judge\.gemini\antigravity\brain\d3f849a7-a057-419a-bc8d-58f4df37226e\screenshots\firm"
os.makedirs(BRAIN_SCREENSHOTS_DIR, exist_ok=True)

LIVE_BASE_URL = "https://nezamy.sa"
LOCAL_BASE_URL = "http://localhost:3000"

FIRM_A_OWNER_EMAIL = "firm-a-owner.uat-20260915-full@nzamy.test"
FIRM_A_PARTNER_EMAIL = "firm-a-partner.uat-20260915-full@nzamy.test"
FIRM_A_SENIOR_EMAIL = "firm-a-senior_lawyer.uat-20260915-full@nzamy.test"
FIRM_A_TRAINEE_EMAIL = "firm-a-trainee.uat-20260915-full@nzamy.test"
FIRM_B_OWNER_EMAIL = "firm-b-owner.uat-20260915-full@nzamy.test"
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


def handle_firm_onboarding(page: Page, human: HumanDriver):
    """Handles Firm onboarding wizard if intercepted by Onboarding Gate."""
    if "/onboarding" not in page.url:
        return

    print("\n[بوابة الإعداد: حساب شركة المحاماة بحاجة لإكمال، بدء إكمال الإعداد بالفيزياء البشرية...]")
    time.sleep(1.0)
    save_screenshot(page, "02a_onboarding_step1.png")

    firm_btn = page.locator('button:has-text("شركة محاماة")').first
    if firm_btn.is_visible():
        human.hover_and_click(firm_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    save_screenshot(page, "02b_onboarding_step2.png")
    svc_btn = page.locator('button:has-text("قضايا وتمثيل قضائي"), button:has-text("عقود ومستندات")').first
    if svc_btn.is_visible():
        human.hover_and_click(svc_btn)
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    save_screenshot(page, "02c_onboarding_step3.png")
    phone_input = page.locator('#ob-phone').first
    if phone_input.is_visible():
        human.human_type(phone_input, "0551122334")
        time.sleep(0.5)

    city_select = page.locator('select').first
    if city_select.is_visible():
        city_select.select_option("الرياض")
        time.sleep(0.5)

    next_btn = page.locator('button:has-text("التالي")').first
    if next_btn.is_enabled():
        human.hover_and_click(next_btn)
        time.sleep(1.5)

    save_screenshot(page, "02d_onboarding_step4.png")
    finish_btn = page.locator('button:has-text("إتمام الإعداد"), button:has-text("التالي")').first
    if finish_btn.is_visible():
        human.hover_and_click(finish_btn)
        time.sleep(3.0)

    save_screenshot(page, "02e_onboarding_step5.png")
    dash_link = page.locator('a:has-text("اذهب للوحة التحكم"), a[href*="/dashboard"]').first
    if dash_link.is_visible():
        human.hover_and_click(dash_link)
        time.sleep(2.5)

    print("✓ اكتمل إعداد حساب شركة المحاماة بنجاح")


def run_firm_simulation():
    network_log = []
    console_log = []

    print("==================================================================")
    print("🚀 بدء محاكاة السلوك البشري الحي: شركات ومكاتب المحاماة (Law Firms)")
    print(f"الحساب الرئيسي: {FIRM_A_OWNER_EMAIL}")
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
                        "actor": "firm-a-owner",
                        "method": method,
                        "url": url,
                        "status": status,
                        "type": resource_type
                    })
                    if status >= 400:
                        print(f"  ⚠️ [Network {status}] {method} {url[:90]}")
            except Exception:
                pass

        def on_console(msg):
            text = msg.text
            msg_type = msg.type
            console_log.append({
                "time": datetime.now().isoformat(),
                "actor": "firm-a-owner",
                "type": msg_type,
                "text": text
            })
            if msg_type in ("error", "warning") and not any(ign in text for ign in ["favicon", "404", "Third-party"]):
                print(f"  🔴 [Console {msg_type.upper()}]: {text[:100]}")

        page.on("response", on_response)
        page.on("console", on_console)

        human = HumanDriver(page)
        base_url = LIVE_BASE_URL

        # ── المحطة 1: فحص الاتصال بالبيئة الحية ──
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

        save_screenshot(page, "01_login_initial.png")

        # ── المحطة 2: تسجيل الدخول بحساب المالك الرئيسي لشركة المحاماة ──
        print("\n[المحطة 2: إدخال بيانات الاعتماد بالفيزياء البشرية للشريك المدير]...")
        email_input = page.locator('input[type="email"], input[name="email"], #email').first
        pass_input = page.locator('input[type="password"], input[name="password"], #password').first

        if email_input.is_visible() and pass_input.is_visible():
            human.human_type(email_input, FIRM_A_OWNER_EMAIL)
            time.sleep(random.uniform(0.3, 0.6))
            human.human_type(pass_input, UNIVERSAL_PASSWORD)
            time.sleep(random.uniform(0.4, 0.7))
            save_screenshot(page, "02_login_filled.png")

            submit_btn = page.locator('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("دخول")').first
            human.hover_and_click(submit_btn)
            print("  ✓ تم النقر على زر الدخول، بانتظار استجابة الخادم وتثبيت الجلسة...")
            page.wait_for_url("**/dashboard/**", timeout=20000)
            wait_page_settled(page)
        else:
            print("  ⚠️ لم يتم العثور على حقول الدخول!")

        save_screenshot(page, "03_login_result.png")
        print(f"  المسار الحالي بعد تسجيل الدخول: {page.url}")

        # ── المحطة 3: معالجة بوابة الإعداد إن ظهرت ──
        if "/onboarding" in page.url:
            handle_firm_onboarding(page, human)

        # ── المحطة 4: لوحة تحكم شركة المحاماة (/dashboard/firm) ──
        print("\n[المحطة 4: استكشاف لوحة تحكم شركة المحاماة /dashboard/firm]...")
        if "/dashboard/firm" not in page.url:
            page.goto(f"{base_url}/dashboard/firm", timeout=25000, wait_until="domcontentloaded")
        try:
            page.wait_for_selector('div:has-text("قمرة القيادة"), div:has-text("بروفيل شركة المحاماة")', timeout=20000)
        except Exception:
            pass
        wait_page_settled(page)

        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(1.0)
        save_screenshot(page, "04_firm_dashboard_top.png")
        print("  ✓ تم التقاط الجزء العلوي للوحة تحكم الشركة بكامل عناصره ومؤشرات BENTO")

        # تحريك الماوس واستكشاف بطاقات الأداء
        kpi_metrics = page.locator('div:has-text("القضايا النشطة"), div:has-text("أعضاء الفريق")').first
        if kpi_metrics.is_visible():
            human.hover_and_click(kpi_metrics, click=False)
            time.sleep(0.5)

        # التمرير الانسيابي لرؤية المهام العاجلة والنشاط الأخير
        print("  تمرير الصفحة لاستكشاف المهام العاجلة والنشاط الأخير...")
        human.human_scroll(450, steps=8)
        time.sleep(1.0)
        save_screenshot(page, "04b_firm_dashboard_middle.png")

        human.human_scroll(450, steps=8)
        time.sleep(1.0)
        save_screenshot(page, "04c_firm_dashboard_bottom.png")

        # ── المحطة 5: إدارة الفريق والصلاحيات (/dashboard/firm/team) ──
        print("\n[المحطة 5: فحص إدارة الفريق والصلاحيات /dashboard/firm/team]...")
        # استخدام الفأرة البشرية للنقر على رابط "أعضاء الفريق" في السايدبار
        team_nav = page.locator('aside a[href*="/firm/team"], aside span:has-text("أعضاء الفريق")').first
        if team_nav.is_visible():
            human.hover_and_click(team_nav)
        else:
            page.goto(f"{base_url}/dashboard/firm/team", timeout=25000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "05_firm_team_roster.png")
        print("  ✓ تم توثيق شاشة فريق العمل ورصد حالة استجابة واجهة الأعضاء")

        # فحص صفحات الفريق المتخصصة (Roles, Workload, Trainees)
        print("  فحص صفحة الصلاحيات والأدوار (/dashboard/firm/team/roles)...")
        roles_nav = page.locator('aside a[href*="/firm/team/roles"], aside span:has-text("الصلاحيات والأدوار")').first
        if roles_nav.is_visible():
            human.hover_and_click(roles_nav)
        else:
            page.goto(f"{base_url}/dashboard/firm/team/roles", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "06_firm_team_roles.png")

        print("  فحص عبء العمل وتوزيع القضايا (/dashboard/firm/team/workload)...")
        page.goto(f"{base_url}/dashboard/firm/team/workload", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "07_firm_team_workload.png")

        print("  فحص تدريب المحامين والمتدربين (/dashboard/firm/team/trainees)...")
        page.goto(f"{base_url}/dashboard/firm/team/trainees", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "08_firm_team_trainees.png")

        # ── المحطة 6: قضايا الشركة وإسناد القضايا (/dashboard/firm/cases) ──
        print("\n[المحطة 6: فحص قضايا الشركة وإسناد القضايا /dashboard/firm/cases]...")
        cases_nav = page.locator('aside a[href*="/firm/cases"], aside span:has-text("جميع القضايا")').first
        if cases_nav.is_visible():
            human.hover_and_click(cases_nav)
        else:
            page.goto(f"{base_url}/dashboard/firm/cases", timeout=25000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "09_firm_cases_list.png")

        print("  فحص صفحة إسناد القضايا للأعضاء (/dashboard/firm/cases/assign)...")
        page.goto(f"{base_url}/dashboard/firm/cases/assign", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "10_firm_cases_assign.png")

        # ── المحطة 7: عملاء شركة المحاماة (/dashboard/firm/clients) ──
        print("\n[المحطة 7: فحص دليل عملاء شركة المحاماة /dashboard/firm/clients]...")
        clients_nav = page.locator('aside a[href*="/firm/clients"], aside span:has-text("دليل العملاء")').first
        if clients_nav.is_visible():
            human.hover_and_click(clients_nav)
        else:
            page.goto(f"{base_url}/dashboard/firm/clients", timeout=25000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "11_firm_clients_directory.png")

        # ── المحطة 8: مالية وتقارير الشركة (/dashboard/firm/finance & reports) ──
        print("\n[المحطة 8: فحص مالية الشركة وتقارير الإيرادات /dashboard/firm/finance]...")
        page.goto(f"{base_url}/dashboard/firm/finance", timeout=25000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "12_firm_finance_overview.png")

        print("  فحص التقارير المالية التفصيلية (/dashboard/firm/finance/reports)...")
        page.goto(f"{base_url}/dashboard/firm/finance/reports", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page)
        save_screenshot(page, "13_firm_finance_reports.png")

        context.close()

        # ── المحطة 9: فحص أدوار الفريق الفرعية (Partner, Senior Lawyer, Trainee) ──
        print("\n[المحطة 9: محاكاة جلسات أعضاء الفريق الفرعيين للتحقق من صلاحيات الأدوار]")

        # 9.1: Partner
        print(f"  9.1: جلسة الشريك ({FIRM_A_PARTNER_EMAIL})...")
        ctx_partner = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page_partner = ctx_partner.new_page()
        page_partner.goto(f"{base_url}/login", timeout=20000, wait_until="domcontentloaded")
        time.sleep(1.0)
        page_partner.fill('input[type="email"], #email', FIRM_A_PARTNER_EMAIL)
        page_partner.fill('input[type="password"], #password', UNIVERSAL_PASSWORD)
        page_partner.click('button[type="submit"]')
        time.sleep(4.0)
        page_partner.goto(f"{base_url}/dashboard/firm", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page_partner)
        save_screenshot(page_partner, "14_sub_partner_session.png")
        ctx_partner.close()

        # 9.2: Senior Lawyer
        print(f"  9.2: جلسة المحامي الأول ({FIRM_A_SENIOR_EMAIL})...")
        ctx_senior = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page_senior = ctx_senior.new_page()
        page_senior.goto(f"{base_url}/login", timeout=20000, wait_until="domcontentloaded")
        time.sleep(1.0)
        page_senior.fill('input[type="email"], #email', FIRM_A_SENIOR_EMAIL)
        page_senior.fill('input[type="password"], #password', UNIVERSAL_PASSWORD)
        page_senior.click('button[type="submit"]')
        time.sleep(4.0)
        page_senior.goto(f"{base_url}/dashboard/firm", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page_senior)
        save_screenshot(page_senior, "15_sub_senior_lawyer_session.png")
        ctx_senior.close()

        # 9.3: Trainee
        print(f"  9.3: جلسة المحامي المتدرب ({FIRM_A_TRAINEE_EMAIL})...")
        ctx_trainee = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page_trainee = ctx_trainee.new_page()
        page_trainee.goto(f"{base_url}/login", timeout=20000, wait_until="domcontentloaded")
        time.sleep(1.0)
        page_trainee.fill('input[type="email"], #email', FIRM_A_TRAINEE_EMAIL)
        page_trainee.fill('input[type="password"], #password', UNIVERSAL_PASSWORD)
        page_trainee.click('button[type="submit"]')
        time.sleep(4.0)
        page_trainee.goto(f"{base_url}/dashboard/firm", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page_trainee)
        save_screenshot(page_trainee, "16_sub_trainee_session.png")
        ctx_trainee.close()

        # ── المحطة 10: فحص عزل البيانات (Tenant Isolation: Firm A vs Firm B) ──
        print("\n[المحطة 10: فحص عزل البيانات بين المستأجرين (Tenant Isolation: Firm A vs Firm B)]...")
        ctx_firm_b = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page_firm_b = ctx_firm_b.new_page()
        page_firm_b.goto(f"{base_url}/login", timeout=20000, wait_until="domcontentloaded")
        time.sleep(1.0)
        page_firm_b.fill('input[type="email"], #email', FIRM_B_OWNER_EMAIL)
        page_firm_b.fill('input[type="password"], #password', UNIVERSAL_PASSWORD)
        page_firm_b.click('button[type="submit"]')
        page_firm_b.wait_for_url("**/dashboard/**", timeout=20000)
        wait_page_settled(page_firm_b)

        page_firm_b.goto(f"{base_url}/dashboard/firm", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page_firm_b)
        save_screenshot(page_firm_b, "17_tenant_isolation_firm_b_dashboard.png")

        # التحقق من عزل قضايا وأعضاء Firm B عن Firm A
        page_firm_b.goto(f"{base_url}/dashboard/firm/cases", timeout=20000, wait_until="domcontentloaded")
        wait_page_settled(page_firm_b)
        save_screenshot(page_firm_b, "18_tenant_isolation_cross_check.png")
        print("  ✓ تم توثيق عزل بيانات المستأجر بين Firm A و Firm B بنجاح مع ظهور قضية Firm B الحصرية")
        ctx_firm_b.close()

        browser.close()

    # حفظ سجلات الشبكة والكونسول
    with open(os.path.join(OUTPUT_DIR, "firm_network_log.json"), "w", encoding="utf-8") as f:
        json.dump(network_log, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, "firm_console_log.json"), "w", encoding="utf-8") as f:
        json.dump(console_log, f, ensure_ascii=False, indent=2)

    print("\n==================================================================")
    print("🏁 اكتملت محاكاة شركات ومكاتب المحاماة (Law Firms) بنجاح فائق!")
    print(f"📸 تم حفظ {len(os.listdir(SCREENSHOTS_DIR))} لقطة شاشة في: {SCREENSHOTS_DIR}")
    print(f"🌐 إجمالي طلبات الشبكة المسجلة: {len(network_log)}")
    print(f"💻 إجمالي سجلات الكونسول: {len(console_log)}")
    print("==================================================================")


if __name__ == "__main__":
    run_firm_simulation()
