from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs" / "images"
APP_URL = "http://127.0.0.1:5173/OpenSketch/"


SHOWCASE_ASSETS = (
    ("96 Well Plate Top View", 360, 220),
    ("Macrophage", 650, 220),
    ("Lab Mouse", 950, 220),
    ("Confocal Microscope", 390, 500),
    ("Dendritic Cell", 680, 500),
    ("DNA Double Helix", 980, 500),
)


def add_asset(page, title: str, x: int, y: int) -> None:
    search = page.get_by_placeholder("Search cells, proteins, equipment…")
    search.fill(title)
    insert = page.get_by_role("button", name=f"Insert {title}", exact=True).first
    insert.wait_for()
    card = insert.locator("xpath=ancestor::article")
    card.locator('[data-preview-ready="true"]').wait_for()
    card.drag_to(page.locator(".artboard-stage"), target_position={"x": x, "y": y})
    page.wait_for_timeout(500)


def capture() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1600, "height": 1000},
            device_scale_factor=1,
            reduced_motion="reduce",
        )
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(APP_URL, wait_until="networkidle")

        page.get_by_role("button", name="New figure", exact=True).click()
        page.locator('.workspace-plane[data-canvas-ready="true"]').wait_for()

        for title, x, y in SHOWCASE_ASSETS:
            add_asset(page, title, x, y)

        page.get_by_role("button", name="Close panel").click()
        page.locator(".artboard-stage").click(position={"x": 1_150, "y": 680})
        page.wait_for_timeout(250)
        page.screenshot(path=OUTPUT / "editor.png", animations="disabled")

        page.get_by_role("tab", name="Assets", exact=True).click()
        page.get_by_role("tabpanel", name="assets tools").wait_for()
        page.get_by_placeholder("Search cells, proteins, equipment…").fill("cell")
        page.locator('[data-preview-ready="true"]').first.wait_for()
        page.wait_for_timeout(250)
        page.screenshot(path=OUTPUT / "asset-library.png", animations="disabled")

        page.get_by_role("button", name="Back to projects").click()
        page.get_by_role("heading", name="Projects", exact=True).wait_for()
        page.wait_for_timeout(1_000)
        page.screenshot(path=OUTPUT / "projects.png", animations="disabled")

        context.close()
        browser.close()

    if errors:
        raise RuntimeError("Headless browser errors:\n" + "\n".join(errors))


if __name__ == "__main__":
    capture()
