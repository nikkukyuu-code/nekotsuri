import numpy as np, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
A='/home/box/agent-data/agents/e4dc5761-9447-49c4-b7fa-05dc27e4a551/attachments/'
I2=A+'6789e191557668d42b5de6d61bb68586f1c9c0cc32b97b847def050f3771b86f.jpg'
I3=A+'0f1660db669f980a7f49c4f66d2d9884c18dd9f4aadaa88ab85cd7758c42c514.jpg'
S=1376/1024
def cut(path,box,mode,prefix,minarea=150):
    im=Image.open(path).convert('RGB')
    x0,y0,x1,y1=[int(v*S) for v in box]
    a=np.asarray(im.crop((x0,y0,x1,y1))).astype(int)
    r,g,b=a[...,0],a[...,1],a[...,2]
    if mode=='green':
        cand=(g>r+12)&(g>b+5)
    else:
        bord=np.concatenate([a[0],a[-1],a[:,0],a[:,-1]]); bg=np.median(bord,axis=0)
        d=np.sqrt(((a-bg)**2).sum(-1)); sat=a.max(-1)-a.min(-1)
        cand=(d<34)&(sat<26)
    lab,n=ndi.label(cand)
    sizes=ndi.sum(np.ones_like(lab),lab,range(n+1))
    edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))
    bgm=np.isin(lab,[i for i in range(1,n+1) if i in edge or sizes[i]>2500])
    fg=ndi.binary_opening(~bgm,iterations=1)
    lab2,n2=ndi.label(ndi.binary_dilation(fg,iterations=2))
    res=[]
    for i,sl in enumerate(ndi.find_objects(lab2)):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if h*w<minarea: continue
        m=(lab2[sl]==i+1)&fg[sl]
        m=ndi.binary_fill_holes(m) if mode!='green' else m
        rgba=np.dstack([a[sl],m*255]).astype(np.uint8)
        res.append(((sl[1].start,sl[0].start),Image.fromarray(rgba,'RGBA')))
    res.sort(key=lambda t:(t[0][1]//40,t[0][0]))
    for k,(p,img) in enumerate(res): img.save(f'/workspace/nekotsuri-work/{prefix}{k}.png')
    return res
allr=[]
for args in [(I2,(515,65,770,200),'green','it_rod'),(I2,(772,300,1015,435),'gray','it_bkt'),(I2,(515,438,775,560),'gray','it_low'),(I3,(772,440,840,565),'gray','it_med'),(I2,(266,258,768,438),'gray','it_pier')][:4]:
    allr+= [(args[3]+str(k),im) for k,(p,im) in enumerate(cut(*args))]
W=1400; x=y=0; rowh=0
sheet=Image.new('RGBA',(W,900),(40,60,110,255)); d=ImageDraw.Draw(sheet)
for name,im in allr:
    if x+im.width+10>W: x=0;y+=rowh+20;rowh=0
    sheet.alpha_composite(im,(x,y+14)); d.text((x,y),name,fill='yellow'); x+=max(im.width,50)+10; rowh=max(rowh,im.height+14)
sheet.save('/workspace/nekotsuri-work/items_sheet.png')
