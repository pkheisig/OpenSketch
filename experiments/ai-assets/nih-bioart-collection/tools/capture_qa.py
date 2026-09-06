"""Capture standalone asset comparisons without loading the OpenSketch app."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile
import shutil

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p, tempfile.TemporaryDirectory(prefix="bioart-video-") as tmp:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width":1600,"height":960}, device_scale_factor=1, record_video_dir=tmp, record_video_size={"width":1600,"height":960})
    page = context.new_page()
    page.goto((ROOT/"qa"/"gallery.html").as_uri())
    page.locator("img").evaluate_all("(imgs)=>Promise.all(imgs.map(i=>i.decode()))")
    page.screenshot(path=str(ROOT/"qa"/"collection-svg.png"), full_page=True)
    for fmt in ["png","svg"]:
        page.evaluate("f=>format(f)",fmt)
        page.locator("img").evaluate_all("(imgs)=>Promise.all(imgs.map(i=>i.decode()))")
        for bg in ["white","dark"]:
            page.evaluate("b=>background(b)",bg)
            page.wait_for_timeout(700)
            page.screenshot(path=str(ROOT/"qa"/f"collection-{fmt}-{bg}.png"),full_page=True)
    video = page.video
    context.close()
    shutil.copyfile(video.path(),ROOT/"qa"/"transparency-inspection.webm")
    browser.close()
print("Captured SVG and PNG comparisons on white and dark backgrounds.")
