import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
A='/home/box/agent-data/agents/e4dc5761-9447-49c4-b7fa-05dc27e4a551/attachments/'
src=Image.open(A+'9ea2c2561e847b525e4698379da98d946f22e21d253ec0e1a5bc540c9d5c8064.jpg').convert('RGB')
a=np.asarray(src).astype(int)
H,W,_=a.shape
# estimate bg color from border
border=np.concatenate([a[0],a[-1],a[:,0],a[:,-1]])
bg=np.median(border,axis=0)
print('bg',bg)
d=np.sqrt(((a-bg)**2).sum(-1))
sat=a.max(-1)-a.min(-1)
cand=(d<30)&(sat<22)
lab,n=ndi.label(cand)
# background = components touching border or large
sizes=ndi.sum(np.ones_like(lab),lab,range(n+1))
edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))
bgmask=np.zeros_like(cand)
for i in range(1,n+1):
    if i in edge or sizes[i]>3000: bgmask|=(lab==i)
fg=~bgmask
fg=ndi.binary_opening(fg,iterations=1)
fg=ndi.binary_fill_holes(fg) if False else fg
lab2,n2=ndi.label(ndi.binary_dilation(fg,iterations=2))
objs=ndi.find_objects(lab2)
boxes=[]
for i,sl in enumerate(objs):
    if sl is None: continue
    h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
    if h*w<600: continue
    boxes.append((sl[0].start,sl[1].start,sl[0].stop,sl[1].stop,i+1))
# sort into rows
boxes.sort(key=lambda b:(b[0]+b[2])/2)
rows=[];
for b in boxes:
    cy=(b[0]+b[2])/2
    if rows and abs(cy-rows[-1][0])<40: rows[-1][1].append(b); rows[-1][0]=np.mean([(x[0]+x[2])/2 for x in rows[-1][1]])
    else: rows.append([cy,[b]])
out=[]
alpha_full=np.zeros((H,W),np.uint8)
# soft alpha: inside fg=255; edge pixels close to bg partially transparent
soft=np.clip((d-8)/22,0,1)
for r,(cy,bs) in enumerate(rows):
    bs.sort(key=lambda b:b[1])
    for c,(y0,x0,y1,x1,li) in enumerate(bs):
        m=(lab2[y0:y1,x0:x1]==li)&fg[y0:y1,x0:x1]
        al=m.astype(float)
        edgez=m&~ndi.binary_erosion(m,iterations=1)
        al[edgez]=soft[y0:y1,x0:x1][edgez]
        rgba=np.dstack([a[y0:y1,x0:x1],(al*255).astype(int)]).astype(np.uint8)
        im=Image.fromarray(rgba,'RGBA')
        name=f'r{r}c{c}'
        im.save(f'/workspace/nekotsuri-work/cat_{name}.png')
        out.append((name,im))
print(len(rows),[len(b) for _,b in rows])
# contact sheet
cw,ch=110,100
cols=16
sheet=Image.new('RGBA',(cols*cw,len(rows)*ch),(60,120,60,255))
dr=ImageDraw.Draw(sheet)
for name,im in out:
    r=int(name[1:name.index('c')]); c=int(name[name.index('c')+1:])
    sheet.alpha_composite(im,(c*cw+5,r*ch+12))
    dr.text((c*cw+2,r*ch),name,fill=(255,255,0,255))
sheet.save('/workspace/nekotsuri-work/cats_sheet.png')
