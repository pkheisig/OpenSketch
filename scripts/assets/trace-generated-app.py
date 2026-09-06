"""Trace committed approved PNG masters into bounded editable application SVGs.
Install Pillow==11.3.0 and vtracer==0.6.15. Original artwork is never modified.
"""
import hashlib, io, json, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image
import vtracer
import xml.etree.ElementTree as ET
commit = sys.argv[1]
assert len(commit) == 40 and all(c in '0123456789abcdef' for c in commit)
inventories = [p for p in subprocess.check_output(['git','ls-tree','-r','--name-only',commit],text=True).splitlines() if p.endswith('/inventory-progress.json')]
assert len(inventories) == 1
base = inventories[0].rsplit('/',1)[0]+'/'
def read(path): return subprocess.check_output(['git','show',f'{commit}:{base}{path}'])
def sha(data): return hashlib.sha256(data).hexdigest()
progress = json.loads(read('inventory-progress.json'))
folder = Path('apps/web/public/assets/opensketch-generated'); folder.mkdir(parents=True,exist_ok=True)
receipt = Path('docs/opensketch-generated-derivatives.json')
previous = {e['id']:e for e in json.loads(receipt.read_text())['assets']}
checkpoint = Path(tempfile.gettempdir())/f'opensketch-trace-{commit}.json'
if checkpoint.exists(): previous.update({e['id']:e for e in json.loads(checkpoint.read_text())})
records=[]; seen=set(); ET.register_namespace('', 'http://www.w3.org/2000/svg')
for key,e in progress['assets'].items():
    if e.get('status')!='complete' or e['svg_sha256'] in seen or e.get('alias_of'): continue
    seen.add(e['svg_sha256']); data=read(e['png']); assert sha(data)==e['png_sha256']
    out=folder/f'{key}.svg'; old=previous.get(key)
    if old and out.exists() and old['sourcePngSha256']==sha(data) and old['sourceSvgSha256']==e['svg_sha256'] and old['appSvgSha256']==sha(out.read_bytes()):
        records.append({k:v for k,v in old.items() if k!='sourcePng'});continue
    print('Tracing '+key,flush=True)
    # Reduce raster sampling only when detailed masters exceed the editor's path budget.
    for max_side in [1024,768,512,384]:
        im=Image.open(io.BytesIO(data)).convert('RGBA'); im.thumbnail((max_side,max_side),Image.Resampling.LANCZOS)
        quant=im.quantize(colors=48,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).convert('RGBA')
        quant.putalpha(im.getchannel('A').point(lambda p:255 if p>=128 else 0))
        with tempfile.TemporaryDirectory() as tmp:
            src=Path(tmp)/'trace.png';target=Path(tmp)/'trace.svg';quant.save(src)
            vtracer.convert_image_to_svg_py(str(src),str(target),colormode='color',hierarchical='stacked',mode='spline',filter_speckle=4,color_precision=8,layer_difference=1,corner_threshold=60,length_threshold=4.0,max_iterations=10,splice_threshold=45,path_precision=2)
            root=ET.parse(target).getroot()
        paths=list(root)
        if 0<len(paths)<=4000:break
    assert 0<len(paths)<=4000,(key,len(paths))
    root.set('viewBox',f'0 0 {im.width} {im.height}')
    palette={rgb[:3] for count,rgb in quant.getcolors(1000000) if rgb[3]>0}
    for i,path in enumerate(paths):
        path.set('id',f'{key}-region-{i+1}')
        fill=path.get('fill','');assert fill.startswith('#') and len(fill)==7
        rgb=tuple(int(fill[j:j+2],16) for j in (1,3,5))
        nearest=min(sorted(palette),key=lambda c:sum((a-b)**2 for a,b in zip(c,rgb)))
        path.set('fill','#'+''.join(f'{c:02x}' for c in nearest))
    ET.ElementTree(root).write(out,encoding='unicode')
    records.append({'id':key,'sourcePngSha256':sha(data),'sourceSvgSha256':e['svg_sha256'],'appSvgSha256':sha(out.read_bytes()),'paths':len(paths),'width':im.width,'height':im.height,'maxSide':max_side})
    checkpoint.write_text(json.dumps(records))
receipt.write_text(json.dumps({'sourceCommit':commit,'recipe':{'vtracer':'0.6.15','Pillow':'11.3.0','maxSide':1024,'adaptiveMaxSides':[1024,768,512,384],'maxPaths':4000,'colors':48,'filterSpeckle':4},'assets':records},indent=2)+'\n')
print(f'Traced {len(records)} assets; maximum {max(e["paths"] for e in records)} paths.')
