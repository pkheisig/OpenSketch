"""Package generated RGBA originals and trace editable SVGs. No image API calls.

Requires Pillow, Playwright with Chromium, and vtracer==0.6.15.
Run from any directory after choosing originals in batch-02.json.
"""
from pathlib import Path
import base64
import hashlib
import html
import json
import tempfile
import xml.etree.ElementTree as ET

from PIL import Image
from playwright.sync_api import sync_playwright
import vtracer

ROOT = Path(__file__).resolve().parents[1]
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

# Canvas expansion is a 1:1 copy. Binary alpha is used only for vector tracing,
# where near-transparent RGB fringe pixels otherwise become opaque regions.
PREPARE = """async ({url}) => {
  const im = new Image(); im.src = url; await im.decode();
  const side = Math.max(im.width, im.height), pad = Math.round(side * .20);
  const c = document.createElement('canvas'); c.width = c.height = side + pad * 2;
  const ctx = c.getContext('2d');
  ctx.drawImage(im, Math.floor((side-im.width)/2)+pad, Math.floor((side-im.height)/2)+pad);
  const master = c.toDataURL('image/png').split(',')[1];
  const pixels = ctx.getImageData(0, 0, c.width, c.height), d = pixels.data;
  for (let i=0; i<d.length; i+=4) {
    if(d[i+3]<128) d[i]=d[i+1]=d[i+2]=d[i+3]=0;
    else d[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  return {master, trace:c.toDataURL('image/png').split(',')[1], side:c.width};
}"""


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    batch = json.loads((ROOT / "batch-02.json").read_text())
    records = []
    with sync_playwright() as p, tempfile.TemporaryDirectory(prefix="opensketch-trace-") as tmp:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 800})
        for item in batch["assets"]:
            name = item["id"]
            source = ROOT / item["selected_original"]
            with Image.open(source) as im:
                assert im.mode == "RGBA", f"{name}: no alpha channel"
                lo, hi = im.getchannel("A").getextrema()
                assert lo == 0 and hi >= 250, f"{name}: background not transparent"
            result = page.evaluate(PREPARE, {"url": "data:image/png;base64," + base64.b64encode(source.read_bytes()).decode()})
            png = ROOT / "png" / f"{name}-bioart-transparent.png"
            png.write_bytes(base64.b64decode(result["master"]))
            trace_input = Path(tmp) / f"{name}.png"
            trace_input.write_bytes(base64.b64decode(result["trace"]))
            svg = ROOT / "svg" / f"{name}-bioart-traced.svg"
            fine_detail = name in {"laboratory-mouse", "microcentrifuge-tube"}
            vtracer.convert_image_to_svg_py(str(trace_input), str(svg), colormode="color",
                hierarchical="stacked", mode="spline", filter_speckle=4 if fine_detail else 10, color_precision=8 if fine_detail else 6,
                layer_difference=8 if fine_detail else 24, corner_threshold=60, length_threshold=4.0,
                max_iterations=10, splice_threshold=45, path_precision=2)
            tree = ET.parse(svg)
            doc = tree.getroot()
            side = result["side"]
            doc.set("viewBox", f"0 0 {side} {side}")
            paths = doc.findall(f"{{{SVG_NS}}}path")
            for i, path in enumerate(paths):
                path.set("id", f"{name}-region-{i+1:04d}")
            tree.write(svg, encoding="unicode", xml_declaration=True)
            tags = {e.tag.split("}")[-1] for e in doc.iter()}
            assert tags <= {"svg", "path"} and paths, f"{name}: unexpected SVG content"
            assert not any("href" in k for e in doc.iter() for k in e.attrib)
            with Image.open(png) as im:
                alpha = im.getchannel("A")
                box = alpha.getbbox()
                margins = [box[0], box[1], side-box[2], side-box[3]]
                assert min(margins) >= side * .13, f"{name}: insufficient padding"
            records.append({"id": name, "png": str(png.relative_to(ROOT)), "svg": str(svg.relative_to(ROOT)),
                "png_dimensions": [side, side], "png_alpha_extrema": list(alpha.getextrema()), "transparent_margins_px": margins,
                "svg_paths": len(paths), "svg_embedded_rasters": 0, "original_sha256": digest(source),
                "png_sha256": digest(png), "svg_sha256": digest(svg)})
            page.set_content('<style>body{margin:0}svg{width:800px;height:800px}</style>'+svg.read_text())
            page.screenshot(path=str(ROOT / "qa" / f"{name}-svg-preview.png"), omit_background=True)
        browser.close()
    (ROOT / "qa" / "validation.json").write_text(json.dumps({"assets":records,"trace_alpha_threshold":128,
        "vtracer_version":"0.6.15","visual_qa":"Inspect comparison screenshots separately; these checks establish file properties."},indent=2)+"\n")
    build_gallery(batch)
    print(json.dumps(records, indent=2))


def build_gallery(batch):
    assets = [{"id":"macrophage","name":"Macrophage","category":"Approved reference"},
              {"id":"mitochondrion","name":"Mitochondrion","category":"Approved reference"},
              {"id":"cd8-receptor","name":"CD8 receptor","category":"Approved reference"}] + batch["assets"]
    style = """body{margin:0;background:#edf0f4;color:#253247;font-family:Arial,sans-serif}header{padding:26px 28px 8px}h1{font-size:25px;margin:0 0 10px}p{margin:0 0 12px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;padding:20px 28px}article{background:white;border-radius:12px;overflow:hidden}h2{font-size:17px;margin:16px 14px 6px}small{display:block;margin:0 14px 10px;color:#667085;font-size:11px}img{width:100%;height:270px;object-fit:contain}.art{background:linear-gradient(90deg,#fff 50%,#29364b 50%)}nav{display:flex;gap:8px}button{font:inherit;padding:7px 12px;background:white;border:1px solid #bcc4d1;border-radius:6px;cursor:pointer}a{color:inherit}"""
    cards = []
    for a in assets:
        cards.append(f'<article><h2>{html.escape(a["name"].title())}</h2><small>{html.escape(a["category"])}</small><div class="art"><img alt="{html.escape(a["name"])}" data-id="{a["id"]}" src="../svg/{a["id"]}-bioart-traced.svg"></div></article>')
    controls = """<nav><button onclick="format('svg')">Editable SVGs</button><button onclick="format('png')">PNG masters</button><button onclick="background('split')">Split background</button><button onclick="background('white')">White</button><button onclick="background('dark')">Dark</button></nav>"""
    script = """function format(f){document.querySelectorAll('img').forEach(i=>i.src='../'+f+'/'+i.dataset.id+'-bioart-'+(f==='svg'?'traced.svg':'transparent.png'));document.querySelector('#format').textContent=f==='svg'?'Editable SVGs':'PNG masters'}function background(b){document.querySelectorAll('.art').forEach(e=>e.style.background=b==='split'?'linear-gradient(90deg,#fff 50%,#29364b 50%)':b==='dark'?'#29364b':'white')}"""
    (ROOT / "qa" / "gallery.html").write_text('<!doctype html><html><head><meta charset="utf-8"><title>OpenSketch BioArt collection</title><style>'+style+'</style></head><body><header><h1>OpenSketch · BioArt consistency study</h1><p>Three approved references and seven new assets · <span id="format">Editable SVGs</span></p>'+controls+'</header><main>'+''.join(cards)+'</main><script>'+script+'</script></body></html>')


if __name__ == "__main__":
    main()
