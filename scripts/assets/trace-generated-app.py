"""Create bounded app derivatives of reviewed PNG masters; originals remain untouched.
Requires Pillow 11.3.0 and vtracer 0.6.15. Run before sync-generated.mjs.
"""
import hashlib, io, json, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image
import vtracer
import xml.etree.ElementTree as ET
commit = sys.argv[1]
assert len(commit)==40 and all(c in '0123456789abcdef' for c in commit)
base='experiments/ai-assets/nih-bioart-collection/'
def read(path): return subprocess.check_output(['git','show',f'{commit}:{base}{path}'])
def sha(data): return hashlib.sha256(data).hexdigest()
progress=json.loads(read('inventory-progress.json'))
folder=Path('apps/web/public/assets/opensketch-generated'); folder.mkdir(parents=True,exist_ok=True)
records=[]; seen=set(); ET.register_namespace('', 'http://www.w3.org/2000/svg')
for key,e in progress['assets'].items():
    if e.get('status')!='complete' or e['svg'] in seen or e.get('alias_of'): continue
    seen.add(e['svg']); data=read(e['png']); assert sha(data)==e['png_sha256']
    im=Image.open(io.BytesIO(data)).convert('RGBA'); im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
    # Forty-eight colors retain the approved palette while bounding editable regions.
    quant=im.quantize(colors=48,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).convert('RGBA')
    alpha=im.getchannel('A').point(lambda p:255 if p>=128 else 0); quant.putalpha(alpha)
    out=folder/f'{key}.svg'
    with tempfile.TemporaryDirectory() as tmp:
        src=Path(tmp)/'trace.png'; quant.save(src)
        vtracer.convert_image_to_svg_py(str(src),str(out),colormode='color',hierarchical='stacked',mode='spline',filter_speckle=4,color_precision=8,layer_difference=1,corner_threshold=60,length_threshold=4.0,max_iterations=10,splice_threshold=45,path_precision=2)
    tree=ET.parse(out); root=tree.getroot(); root.set('viewBox',f'0 0 {im.width} {im.height}')
    paths=list(root); assert 0<len(paths)<=4000,(key,len(paths))
    palette={rgb[:3] for count,rgb in quant.getcolors(1000000) if rgb[3]>0}
    for i,p in enumerate(paths):
        p.set('id',f'{key}-region-{i+1}')
        fill=p.get('fill',''); assert fill.startswith('#') and len(fill)==7
        rgb=tuple(int(fill[j:j+2],16) for j in (1,3,5))
        nearest=min(sorted(palette),key=lambda c:sum((a-b)**2 for a,b in zip(c,rgb)))
        p.set('fill','#'+''.join(f'{c:02x}' for c in nearest))
    tree.write(out,encoding='unicode')
    records.append({'id':key,'sourcePng':e['png'],'sourcePngSha256':sha(data),'sourceSvgSha256':e['svg_sha256'],'appSvgSha256':sha(out.read_bytes()),'paths':len(paths),'width':im.width,'height':im.height})
print(f'Traced {len(records)} app derivatives; max {max(x["paths"] for x in records)} regions.')
Path('docs/opensketch-generated-derivatives.json').write_text(json.dumps({'sourceCommit':commit,'recipe':{'vtracer':'0.6.15','Pillow':'11.3.0','maxSide':1024,'colors':48,'filterSpeckle':4},'assets':records},indent=2)+'\n')
