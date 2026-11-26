"""CS 213 SA 3 Live Loopback Browser E2E Verification.
Starts local Wrangler Worker with wrangler.cs213.jsonc (no DEV_USER_EMAIL),
verifies PBKDF2 login UI, wrong password denial, Lead Reports + Data Mart ETL + Reconciliation,
Sign Out, and Member restricted-access enforcement (403 on direct API & hidden Reports nav).
"""
import json
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = ROOT / "docs" / "cs213" / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:8787"


def wait_for_health(timeout_s=35):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            with urllib.request.urlopen(f"{BASE}/api/health", timeout=2) as r:
                if r.status == 200:
                    return json.loads(r.read().decode("utf-8"))
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Timed out waiting for CS 213 Wrangler server")


def main():
    node = shutil.which("node")
    assert node, "Node.js is required"
    wrangler = str(ROOT / "node_modules" / "wrangler" / "bin" / "wrangler.js")
    py = str(Path(__import__("sys").executable))

    for cmd in [
        [py, "scripts/prepare_cs213_local.py"],
        [node, wrangler, "d1", "migrations", "apply", "DB", "--local", "--config", "wrangler.cs213.jsonc", "--persist-to", ".cs213-state"],
        [node, wrangler, "d1", "execute", "DB", "--local", "--config", "wrangler.cs213.jsonc", "--persist-to", ".cs213-state", "--file", "scripts/m3_local_demo_seed.sql"],
        [node, wrangler, "d1", "execute", "DB", "--local", "--config", "wrangler.cs213.jsonc", "--persist-to", ".cs213-state", "--file", "scripts/cs213_demo_seed.sql"],
    ]:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            raise RuntimeError(f"Setup failed: {cmd}\n{r.stdout}\n{r.stderr}")

    proc = subprocess.Popen(
        [node, wrangler, "dev", "--local", "--config", "wrangler.cs213.jsonc", "--persist-to", ".cs213-state", "--ip", "127.0.0.1", "--port", "8787"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    results = {"executedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": []}
    try:
        health = wait_for_health(35)
        assert health.get("ok") is True

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": 1440, "height": 960})
            page = ctx.new_page()
            page_errors = []
            page.on("pageerror", lambda e: page_errors.append(str(e)))

            # 1. Unauthenticated visit must show Sign In form
            page.goto(BASE)
            page.locator("#login-form").wait_for(timeout=15000)

            # 2. Wrong password rejected
            page.locator('#login-form input[name="email"]').fill("demo.lead@example.test")
            page.locator('#login-form input[name="password"]').fill("WrongPassword#999")
            page.locator("#login-submit-button").click()
            err = page.locator("#login-error")
            expect(err).to_be_visible()
            results["checks"].append({"step": "wrong_password_denied", "errorText": err.inner_text().strip(), "passed": True})

            # 3. Valid Lead login succeeds
            page.locator('#login-form input[name="password"]').fill("LeadPass#2026")
            page.locator("#login-submit-button").click()
            page.locator('[data-page="reports"]').wait_for(timeout=15000)
            results["checks"].append({"step": "lead_login_success", "passed": True})

            # 4. Open Reports -> Verify Detailed, Summary, Exception, and run Data Mart ETL Load
            page.locator('[data-page="reports"]').click()
            page.locator("#run-datamart-etl-button").wait_for(timeout=15000)
            page.locator("#run-datamart-etl-button").click()
            page.locator('[data-dm-reconciled="true"]').wait_for(timeout=15000)
            reconcile_text = page.locator('[data-dm-reconciled="true"]').inner_text().strip()
            results["checks"].append({"step": "reports_and_datamart_reconciled", "badge": reconcile_text, "passed": True})

            # 4b. Open Departments as Lead -> verify + New Department button is visible
            page.locator('[data-page="departments"]').click()
            page.locator("#new-department-button").wait_for(timeout=15000)
            results["checks"].append({"step": "lead_department_manage_visible", "passed": True})

            # 5. Sign Out -> Protected reload requires login
            page.locator("#logout-button").click()
            page.locator("#login-form").wait_for(timeout=15000)
            page.reload()
            page.locator("#login-form").wait_for(timeout=15000)
            results["checks"].append({"step": "logout_and_protected_reload", "passed": True})

            # 6. Sign in as Member -> Reports nav hidden, + New Department hidden, & direct APIs return 403
            page.locator('#login-form input[name="email"]').fill("demo.member@example.test")
            page.locator('#login-form input[name="password"]').fill("MemberPass#2026")
            page.locator("#login-submit-button").click()
            page.locator('[data-page="dashboard"]').wait_for(timeout=15000)
            assert page.locator('[data-page="reports"]').count() == 0
            page.locator('[data-page="departments"]').click()
            page.locator(".department-card").first.wait_for(timeout=15000)
            assert page.locator("#new-department-button").count() == 0
            direct_status = page.evaluate("async () => (await fetch('/api/reports/overview')).status")
            assert direct_status == 403, f"Expected 403 for Member on /api/reports/overview, got {direct_status}"
            dept_post_status = page.evaluate("async () => (await fetch('/api/departments', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:'Blocked'})})).status")
            assert dept_post_status == 403, f"Expected 403 for Member on POST /api/departments, got {dept_post_status}"
            results["checks"].append({"step": "member_restricted_reports_and_dept_403", "reportsApiStatus": direct_status, "deptPostStatus": dept_post_status, "passed": True})

            assert not page_errors, f"Unexpected page errors: {page_errors}"
            ctx.close()
            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    (EVIDENCE_DIR / "cs213_browser_e2e_results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("CS 213 live browser E2E PASSED:", json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
