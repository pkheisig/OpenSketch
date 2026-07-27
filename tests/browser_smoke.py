import os
from pathlib import Path

from playwright.sync_api import sync_playwright


SCREENSHOTS = Path("/tmp/OpenSketch-smoke")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)
BASE_URL = os.environ.get(
    "OPENSKETCH_URL", "http://127.0.0.1:5173/OpenSketch/"
)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    console_errors: list[str] = []
    external_requests: list[str] = []
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    page.on(
        "request",
        lambda request: external_requests.append(request.url)
        if not request.url.startswith(("http://127.0.0.1:", "http://localhost:"))
        else None,
    )

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.get_by_role("heading", name="New figure").wait_for()
    page.screenshot(path=SCREENSHOTS / "home.png", full_page=True)

    page.get_by_role("button", name="Create blank figure").click()
    page.get_by_label("OpenSketch figure artboard").wait_for()
    page.get_by_role("tab", name="Shapes", exact=True).click()
    page.get_by_role("button", name="Rectangle").click()
    page.get_by_text("rectangle", exact=True).last.wait_for()
    page.get_by_text("Saving…").wait_for(timeout=5_000)
    page.screenshot(path=SCREENSHOTS / "editor.png", full_page=True)

    with page.expect_download() as download_info:
        page.get_by_role("button", name="Export").click()
        page.get_by_role("button", name="Export SVG").click()
    assert download_info.value.suggested_filename.endswith(".svg")

    page.get_by_text("Saved locally").wait_for(timeout=5_000)
    page.get_by_role("button", name="Back to projects").click()
    try:
        page.get_by_role("heading", name="Projects").wait_for(timeout=5_000)
    except Exception:
        page.screenshot(path=SCREENSHOTS / "home-return-failure.png", full_page=True)
        raise AssertionError(
            f"Home navigation failed.\nBody: {page.locator('body').inner_text()}\n"
            f"Console: {console_errors}"
        )
    page.get_by_role("button", name="Untitled figure").click()
    page.get_by_text("rectangle", exact=True).last.wait_for()

    assert not console_errors, "\n".join(console_errors)
    assert not external_requests, "\n".join(external_requests)
    browser.close()
