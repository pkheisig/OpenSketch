"""Resumable inventory packaging. Image generation remains in the built-in image tool."""
from pathlib import Path
import argparse,base64,html,json,re,shutil,tempfile,xml.etree.ElementTree as ET
from PIL import Image
from playwright.sync_api import sync_playwright
import vtracer
from build_collection import ROOT,PREPARE,SVG_NS,digest

PROGRESS=ROOT/"inventory-progress.json"
REPO=ROOT.parents[2]
ALIASES={"CD8 alpha-beta receptor":"cd8-receptor","generic IgG antibody":"igg-antibody"}
def slug(name):
    return ALIASES.get(name,re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-"))
def save(path,obj):
    path.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+"\n")
def init():
    assert not PROGRESS.exists(),"Progress already initialized"
    rows=[]
    for source in ["docs/ai-bioart-asset-inventory.md","docs/ai-bioart-asset-inventory-additions.md"]:
        category=""
        for lineno,line in enumerate((REPO/source).read_text().splitlines(),1):
            if line.startswith("## "): category=line[3:]
            match=re.match(r"- \[[ xX]\] (.+)",line)
            if match:
                name=match[1]; ident=slug(name)
                rows.append({"name":name,"id":ident,"category":category,"source":source,"line":lineno})
    assets={}
    for row in rows:
        ident=row["id"]
        if ident in assets: continue
        png=ROOT/"png"/f"{ident}-bioart-transparent.png"; svg=ROOT/"svg"/f"{ident}-bioart-traced.svg"
        exists=png.exists() and svg.exists()
        assets[ident]={"name":row["name"],"category":row["category"],"status":"complete" if exists else "pending"}
        if exists: assets[ident].update(png=str(png.relative_to(ROOT)),svg=str(svg.relative_to(ROOT)),png_sha256=digest(png),svg_sha256=digest(svg),provenance="Approved batches 01/02")
    save(PROGRESS,{"frozen_dev":"2aea75a8ccd7956d7addbc60547bf5d884ccf590","branch":"experimental/ai-bioart-assets-20260904","entries":rows,"assets":assets})
    status()
def status():
    data=json.loads(PROGRESS.read_text()); assets=data["assets"]
    print(json.dumps({"inventory_entries":len(data["entries"]),"unique_asset_names":len(assets),"complete":sum(a["status"]=="complete" for a in assets.values()),"next":[dict(id=k,**v) for k,v in assets.items() if v["status"]!="complete"][:5]},indent=2))
def prepare(args):
    data=json.loads(PROGRESS.read_text()); asset=data["assets"][args.id]
    assert asset["status"]=="pending" or (args.resume and asset["status"]=="awaiting_visual_review"),asset["status"]
    original=ROOT/"originals"/"inventory"/args.id/"generated.png"
    original.parent.mkdir(parents=True,exist_ok=True)
    source=Path(args.source)
    if original.exists(): assert digest(original)==digest(source),"Preserve prior original; select a new version explicitly"
    else: shutil.copyfile(source,original)
    record=json.loads(Path(args.prompt).read_text())
    record.update(id=args.id,name=asset["name"],generated_source=str(source),original=str(original.relative_to(ROOT)),original_sha256=digest(original))
    save(original.parent/"prompt.json",record)
    with Image.open(original) as im:
        assert im.mode=="RGBA","No actual alpha channel; request transparent image edit"
        lo,hi=im.getchannel("A").getextrema()
        assert lo==0 and hi>=250,"Alpha does not represent a transparent cutout"
    png=ROOT/"png"/f"{args.id}-bioart-transparent.png"; svg=ROOT/"svg"/f"{args.id}-bioart-traced.svg"
    assert args.resume or (not png.exists() and not svg.exists()),"Use --resume only for this pending asset's interrupted packaging"
    qa=ROOT/"qa"/"inventory"/args.id; qa.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p,tempfile.TemporaryDirectory(prefix="bioart-one-") as tmp:
        browser=p.chromium.launch(headless=True)
        context=browser.new_context(viewport={"width":1400,"height":860},record_video_dir=tmp,record_video_size={"width":1400,"height":860})
        page=context.new_page()
        prepared=page.evaluate(PREPARE,{"url":"data:image/png;base64,"+base64.b64encode(original.read_bytes()).decode()})
        png.write_bytes(base64.b64decode(prepared["master"]))
        trace=Path(tmp)/"trace.png"; trace.write_bytes(base64.b64decode(prepared["trace"]))
        vtracer.convert_image_to_svg_py(str(trace),str(svg),colormode="color",hierarchical="stacked",mode="spline",filter_speckle=6,color_precision=8,layer_difference=8,corner_threshold=60,length_threshold=4.0,max_iterations=10,splice_threshold=45,path_precision=2)
        tree=ET.parse(svg); doc=tree.getroot(); side=prepared["side"]; doc.set("viewBox",f"0 0 {side} {side}")
        paths=doc.findall(f"{{{SVG_NS}}}path")
        for i,path in enumerate(paths): path.set("id",f"{args.id}-region-{i+1:04d}")
        tree.write(svg,encoding="unicode",xml_declaration=True)
        assert paths and {e.tag.split("}")[-1] for e in doc.iter()} <= {"svg","path"}
        assert not any("href" in k for e in doc.iter() for k in e.attrib)
        with Image.open(png) as im:
            alpha=im.getchannel("A"); box=alpha.getbbox()
            margins=[box[0],box[1],side-box[2],side-box[3]]
            assert min(margins)>=side*.13
            extrema=list(alpha.getextrema())
        panel='<h1>'+html.escape(asset["name"])+'</h1><p>PNG master / editable SVG · light and dark transparency comparison</p><main>'
        for bg in ["white","#29364b"]:
            for fmt,file in [("PNG",png),("SVG",svg)]:
                mime="image/png" if fmt=="PNG" else "image/svg+xml"
                url="data:"+mime+";base64,"+base64.b64encode(file.read_bytes()).decode()
                panel+=f'<section style="background:{bg}"><b>{fmt}</b><img src="{url}"></section>'
        panel+='</main>'
        page.goto("about:blank")
        page.set_content('<style>body{margin:20px;font:16px Arial;background:#edf0f4;color:#24334b}h1{font-size:23px;margin:0 0 5px}main{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}section{height:350px;position:relative;border-radius:9px}b{position:absolute;top:12px;left:14px;color:#8792a3}img{width:100%;height:100%;object-fit:contain}</style>'+panel)
        page.locator("img").evaluate_all("(imgs)=>Promise.all(imgs.map(i=>i.decode()))")
        page.screenshot(path=str(qa/"comparison.png"))
        page.wait_for_timeout(900)
        video=page.video; context.close(); shutil.copyfile(video.path(),qa/"inspection.webm"); browser.close()
    asset.update(status="awaiting_visual_review",png=str(png.relative_to(ROOT)),svg=str(svg.relative_to(ROOT)),png_sha256=digest(png),svg_sha256=digest(svg),original_sha256=digest(original),png_dimensions=[side,side],alpha_extrema=extrema,transparent_margins_px=margins,svg_paths=len(paths),embedded_rasters=0,prompt=str((original.parent/"prompt.json").relative_to(ROOT)),qa=str(qa.relative_to(ROOT)))
    save(PROGRESS,data)
    print(json.dumps({"id":args.id,"status":asset["status"],"svg_paths":len(paths),"preview":str(qa/"comparison.png")}))
def accept(args):
    assert args.note,"Record actual visual inspection"
    data=json.loads(PROGRESS.read_text()); a=data["assets"][args.id]
    assert a["status"]=="awaiting_visual_review"
    a.update(status="complete",visual_review=args.note)
    save(PROGRESS,data); status()
def alias(args):
    data=json.loads(PROGRESS.read_text()); target=data["assets"][args.target]; a=data["assets"][args.id]
    assert a["status"]=="pending" and target["status"]=="complete"
    a.update(status="complete",alias_of=args.target,alias_reason=args.reason,reference=args.reference)
    for key in ["png","svg","png_sha256","svg_sha256"]: a[key]=target[key]
    save(PROGRESS,data); status()
parser=argparse.ArgumentParser()
sub=parser.add_subparsers(dest="action",required=True)
sub.add_parser("init");sub.add_parser("status")
p=sub.add_parser("prepare");p.add_argument("id");p.add_argument("source");p.add_argument("prompt");p.add_argument("--resume",action="store_true")
p=sub.add_parser("accept");p.add_argument("id");p.add_argument("--note",required=True)
p=sub.add_parser("alias");p.add_argument("id");p.add_argument("target");p.add_argument("--reason",required=True);p.add_argument("--reference",required=True)
args=parser.parse_args()
if args.action=="init":init()
elif args.action=="status":status()
elif args.action=="prepare":prepare(args)
elif args.action=="accept":accept(args)
elif args.action=="alias":alias(args)
