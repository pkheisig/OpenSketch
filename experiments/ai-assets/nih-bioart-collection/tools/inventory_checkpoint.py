"""Upload newly reviewed inventory QA and refresh the GitHub progress page."""
from pathlib import Path
import json,os,urllib.request
import boto3
from build_collection import ROOT,digest
path=ROOT/"inventory-progress.json"
data=json.loads(path.read_text())
client=boto3.client("s3",endpoint_url="https://"+os.environ["CLOUDFLARE_ACCOUNT_ID"]+".r2.cloudflarestorage.com",aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],region_name="auto")
for ident,a in data["assets"].items():
    if a["status"]!="complete": continue
    for fmt in ["png","svg"]:
        assert digest(ROOT/a[fmt])==a[fmt+"_sha256"],ident
    if "qa" not in a or "qa_urls" in a: continue
    urls={}
    for name,mime in [("comparison.png","image/png"),("inspection.webm","video/webm")]:
        key="opensketch/experimental-ai-assets-20260904/inventory/"+ident+"/"+name
        client.upload_file(str(ROOT/a["qa"]/name),os.environ["R2_BUCKET"],key,ExtraArgs={"ContentType":mime})
        url=os.environ["R2_PUBLIC_BASE_URL"].rstrip("/")+"/"+key
        with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})) as response: assert response.status==200
        urls[name]=url
    a["qa_urls"]=urls
    print(ident,urls["comparison.png"])
path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+"\n")
complete=[(k,a) for k,a in data["assets"].items() if a["status"]=="complete"]
artwork_count=len({a["png"] for _,a in complete})
rows=["# Inventory production progress","",f"{len(complete)} of {len(data['assets'])} unique inventory names covered across {len(data['entries'])} checklist entries.","","The inventory files currently contain 770 checklist rows; their prose count is stale. Two exact repeated names share a single asset. The existing ten approved pairs are preserved. Completion requires a saved PNG, editable SVG, file validation, and visual review.","","Production remains on the experimental branch. Each asset is generated as a transparent PNG, then traced and reviewed on light and dark backgrounds. Completed assets are pushed periodically. The full inventory is still in progress.","","[Machine-readable ledger](inventory-progress.json) records every source entry and its status. [Originals and prompts](originals/inventory/) preserve generation provenance. The thread continuation resumes this ledger until all entries are covered.","","| Completed asset | PNG | SVG | Comparison |","| --- | --- | --- | --- |"]
for ident,a in complete:
    qa=a.get("qa_urls",{}).get("comparison.png")
    preview=f"[View]({qa})" if qa else (f"Reuses {a['alias_of']}: [rationale]({a['reference']})" if "alias_of" in a else "Approved earlier batch")
    rows.append(f"| {a['name']} | [PNG]({a['png']}) | [SVG]({a['svg']}) | {preview} |")
rows.insert(4,f"These cover {artwork_count} distinct PNG/SVG pairs and {len(complete)-artwork_count} explicit archetype aliases. Alias reasons are recorded in the ledger.")
(ROOT/"PROGRESS.md").write_text("\n".join(rows)+"\n")
print(f"Checkpoint: {len(complete)}/{len(data['assets'])} complete.")
