"""Cut the orange-tabby sprite sheet (4x4, blue chroma background) into transparent frames,
recolor it into all 13 breeds, and write per-breed atlases + js/sprites.js (frame metadata).
usage: python3 tools/cut_sheet.py <sheet.jpg>"""
import sys, json, colorsys, os

def save_png(img, path):
    q = img.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(path, optimize=True)

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'cats')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'cat_sheet.jpg')
POSES = ['walk1', 'walk2', 'walk3', 'walk4', 'stalk1', 'stalk2', 'run1', 'run2',
         'sit', 'paw', 'jump', 'lie', 'bite', 'alert', 'happy', 'pull']
LINE_FRAMES = {'bite', 'pull'}

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
border = np.concatenate([im[:4].reshape(-1, 3), im[-4:].reshape(-1, 3), im[:, :4].reshape(-1, 3), im[:, -4:].reshape(-1, 3)])
BG = np.median(border, axis=0)
print('bg', BG)
key = im[..., 2] - np.maximum(im[..., 0], im[..., 1])
bgkey = BG[2] - max(BG[0], BG[1])
FGK = -40.0
alpha = np.clip((bgkey - 12 - key) / (bgkey - 12 - FGK), 0, 1)
alpha[alpha < 0.06] = 0
alpha[alpha > 0.94] = 1
# un-mix the blue background from semi transparent edge pixels, then despill
a3 = np.maximum(alpha, 1e-3)[..., None]
col = (im - (1 - alpha[..., None]) * BG) / a3
col = np.clip(col, 0, 255)
col[..., 2] = np.minimum(col[..., 2], np.maximum(col[..., 0], col[..., 1]))

mask = alpha > 0.5
lab, n = ndi.label(ndi.binary_dilation(mask, iterations=3))
sizes = ndi.sum(np.ones_like(lab), lab, range(n + 1))
big = [i for i in range(1, n + 1) if sizes[i] > 4000]
objs = []
for i in big:
    sl = ndi.find_objects((lab == i).astype(int))[0]
    objs.append((i, sl))
assert len(objs) == 16, len(objs)
# rows by y centre, then x
objs.sort(key=lambda o: (o[1][0].start + o[1][0].stop) / 2)
rows = [sorted(objs[r * 4:(r + 1) * 4], key=lambda o: o[1][1].start) for r in range(4)]
objs = [o for r in rows for o in r]

frames = {}
disk = lambda r: (np.add.outer(np.arange(-r, r + 1) ** 2, np.arange(-r, r + 1) ** 2) <= r * r)
for pose, (i, sl) in zip(POSES, objs):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    m = (lab[y0:y1, x0:x1] == i)
    al = alpha[y0:y1, x0:x1] * ndi.binary_dilation(m, iterations=2)
    c = col[y0:y1, x0:x1].copy()
    mouth = None
    if pose in LINE_FRAMES:
        solid = al > 0.5
        body = ndi.binary_opening(solid, structure=disk(5))
        bl, bn = ndi.label(body)
        bs = ndi.sum(np.ones_like(bl), bl, range(bn + 1))
        body = bl == int(np.argmax(bs[1:]) + 1)
        keep = ndi.binary_dilation(body, structure=disk(7)) & solid
        keep = ndi.binary_fill_holes(keep)
        line = solid & ~keep
        touch = line & ndi.binary_dilation(keep, structure=disk(3))
        ys, xs = np.nonzero(touch)
        mouth = (float(xs.mean()), float(ys.mean())) if len(xs) else None
        soft = ndi.binary_dilation(keep, iterations=1)
        al = al * soft
    yy, xx = np.nonzero(al > 0.05)
    by0, by1, bx0, bx1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
    al = al[by0:by1, bx0:bx1]; c = c[by0:by1, bx0:bx1]
    if mouth: mouth = (mouth[0] - bx0, mouth[1] - by0)
    # ground anchor: bottom, horizontally at the alpha centroid of the lowest 25% (the feet)
    h, w = al.shape
    low = al[int(h * 0.75):]
    cxm = float((low.sum(0) * np.arange(w)).sum() / max(1e-6, low.sum()))
    frames[pose] = dict(alpha=al, rgb=c, ax=cxm, ay=float(h), mouth=mouth)
    print(pose, w, h, 'mouth', mouth)

# ---------- recolor ----------
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def field(seed, scale=6, sm=1.6):
    rs = np.random.RandomState(seed)
    f = ndi.gaussian_filter(rs.rand(scale * 8, scale * 8), sm * 4)
    f = (f - f.min()) / (f.max() - f.min()); return f

def sample(f, u, v):
    s = f.shape[0] - 1
    return f[np.clip((v * s).astype(int), 0, s), np.clip((u * s).astype(int), 0, s)]

def classify(rgb):
    r, g, b = rgb[..., 0] / 255, rgb[..., 1] / 255, rgb[..., 2] / 255
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    v = mx; s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hue = np.zeros_like(v)
    d = np.maximum(mx - mn, 1e-6)
    hr = ((g - b) / d) % 6; hg = (b - r) / d + 2; hb = (r - g) / d + 4
    hue = np.where(mx == r, hr, np.where(mx == g, hg, hb)) * 60
    warm = smooth(8, 16, hue) * (1 - smooth(52, 62, hue))       # orange/cream family (not pink)
    pinkish = (1 - warm) * smooth(0.15, 0.3, s)
    recol = warm * smooth(0.32, 0.55, v)                       # not the dark outline
    recol = np.maximum(recol, smooth(0.8, 0.9, v) * smooth(0.25, 0.1, s) * (1 - pinkish))  # whites/cream
    wf = smooth(0.26, 0.5, s)                                  # fur vs. belly(cream)
    return v, s, recol, wf

V_FUR = 0.96; V_BEL = 0.96
def recolor(fr, spec, seed):
    rgb = fr['rgb']; al = fr['alpha']
    if spec is None: return rgb
    v, s, recol, wf = classify(rgb)
    h, w = v.shape
    vv, uu = np.mgrid[0:h, 0:w]
    u = uu / max(1, w - 1); vn = vv / max(1, h - 1)
    lr = np.clip(v / V_FUR, 0, 1.1)
    fur = np.array(spec['fur'], np.float32)
    furc = fur[None, None, :] * np.ones((h, w, 1), np.float32)
    bel = np.array(spec['belly'], np.float32)[None, None, :] * np.ones((h, w, 1), np.float32)
    pat = spec.get('pattern')
    if pat == 'calico' or pat == 'maneki':
        f1 = sample(field(seed), u, vn); f2 = sample(field(seed + 7), u, vn)
        o_th, k_th = (0.52, 0.56) if pat == 'calico' else (0.6, 0.64)
        om = smooth(o_th - 0.03, o_th + 0.03, f1)[..., None]; km = smooth(k_th - 0.03, k_th + 0.03, f2)[..., None]
        furc = furc * (1 - om) + np.array([240, 150, 70])[None, None] * om
        furc = furc * (1 - km) + np.array([70, 62, 66])[None, None] * km
    if pat == 'sabi':
        f1 = sample(field(seed, 10, 0.8), u, vn)
        om = smooth(0.55, 0.65, f1)[..., None]
        furc = furc * (1 - om) + np.array([200, 115, 55])[None, None] * om
        bel = bel * (1 - om * 0.6) + np.array([200, 130, 70])[None, None] * om * 0.6
    if pat in ('point', 'lilac'):
        m = al > 0.5
        cy, cxx = np.nonzero(m); my, mxx = cy.mean(), cxx.mean()
        dist = np.hypot((uu - mxx) / w, (vv - my) / h * 0.8)
        pm = smooth(0.30, 0.46, dist)[..., None]
        ptc = np.array([80, 55, 45] if pat == 'point' else [125, 110, 140])[None, None]
        furc = furc * (1 - pm) + ptc * pm
        bel = bel * (1 - pm * 0.8) + ptc * pm * 0.8
    g = spec.get('gamma', 1.0)
    shade_f = lr ** g
    shade_b = np.clip(v / V_BEL, 0, 1.05) ** spec.get('bgamma', 1.0)
    new = wf[..., None] * furc * shade_f[..., None] + (1 - wf[..., None]) * bel * shade_b[..., None]
    if spec.get('shine'):
        hi = smooth(0.3, 0.0, np.abs(u - vn * 0.6 - 0.25))[..., None] * 0.25
        new = new * (1 - hi) + 255 * hi
    new = np.clip(new, 0, 255)
    out = rgb * (1 - recol[..., None]) + new * recol[..., None]
    if spec.get('outline'):
        dark = (1 - recol)[..., None] * smooth(0.45, 0.2, v)[..., None]
        out = out * (1 - dark * 0.5) + np.array(spec['outline'])[None, None] * dark * 0.5
    return np.clip(out, 0, 255)

SPECS = {
    'chatora': None,
    'kijitora': dict(fur=[160, 122, 82], belly=[228, 214, 190], gamma=2.4),
    'kuro': dict(fur=[78, 72, 88], belly=[92, 86, 100], gamma=1.0, bgamma=1.0, outline=[25, 20, 30]),
    'sabatora': dict(fur=[172, 176, 184], belly=[238, 238, 242], gamma=2.6),
    'shiro': dict(fur=[250, 248, 244], belly=[255, 255, 255], gamma=0.35, bgamma=0.6),
    'hachiware': dict(fur=[74, 70, 82], belly=[252, 252, 250], gamma=0.9, outline=[25, 20, 30]),
    'cream': dict(fur=[247, 216, 160], belly=[253, 246, 232], gamma=0.9),
    'mike': dict(fur=[250, 247, 240], belly=[255, 253, 248], gamma=0.35, pattern='calico'),
    'sabi': dict(fur=[78, 56, 46], belly=[98, 74, 58], gamma=1.0, pattern='sabi', outline=[25, 15, 10]),
    'siamese': dict(fur=[240, 226, 200], belly=[250, 242, 228], gamma=0.5, pattern='point'),
    'oshare': dict(fur=[246, 238, 236], belly=[252, 248, 248], gamma=0.5, pattern='lilac'),
    'maneki': dict(fur=[252, 250, 246], belly=[255, 255, 252], gamma=0.3, pattern='maneki'),
    'kin': dict(fur=[246, 196, 52], belly=[255, 232, 140], gamma=1.6, shine=True),
}

# ---------- atlas layout (shared by all breeds) ----------
PAD = 6
S = 0.7  # atlas scale (keeps the download small; still crisp in the close-up window)
order = POSES
cols = 4
cw = max(f['alpha'].shape[1] for f in frames.values()) + PAD * 2
chh = max(f['alpha'].shape[0] for f in frames.values()) + PAD * 2
AW, AH = cw * cols, chh * ((len(order) + cols - 1) // cols)
meta = {}
for k, p in enumerate(order):
    f = frames[p]; h, w = f['alpha'].shape
    ox = (k % cols) * cw + PAD; oy = (k // cols) * chh + PAD
    m = dict(x=int(ox), y=int(oy), w=int(w), h=int(h), ax=round(f['ax'], 1), ay=round(f['ay'], 1))
    if f['mouth']: m['mx'] = round(f['mouth'][0], 1); m['my'] = round(f['mouth'][1], 1)
    meta[p] = m

ICONS = ['sit', 'happy', 'jump', 'walk1', 'lie']
for bi, (bid, spec) in enumerate(SPECS.items()):
    atlas = np.zeros((AH, AW, 4), np.float32)
    for p in order:
        f = frames[p]; m = meta[p]
        rgb = recolor(f, spec, 1000 + bi * 31)
        atlas[m['y']:m['y'] + m['h'], m['x']:m['x'] + m['w'], :3] = rgb
        atlas[m['y']:m['y'] + m['h'], m['x']:m['x'] + m['w'], 3] = f['alpha'] * 255
        if p in ICONS:
            ic = np.dstack([rgb, f['alpha'] * 255]).astype(np.uint8)
            save_png(Image.fromarray(ic, 'RGBA'), os.path.join(OUT, '%s_%s.png' % (bid, p)))
    img = Image.fromarray(atlas.astype(np.uint8), 'RGBA').resize((round(AW * S), round(AH * S)), Image.LANCZOS)
    save_png(img, os.path.join(OUT, 'atlas_%s.png' % bid))

for p, m in meta.items():
    for k in list(m.keys()): m[k] = round(m[k] * S, 1)
    x0 = int(m['x']) ; y0 = int(m['y'])
    dx, dy = m['x'] - x0, m['y'] - y0
    m['w'] = round(m['w'] + dx, 1); m['h'] = round(m['h'] + dy, 1)
    m['ax'] = round(m['ax'] + dx, 1); m['ay'] = round(m['ay'] + dy, 1)
    if 'mx' in m: m['mx'] = round(m['mx'] + dx, 1); m['my'] = round(m['my'] + dy, 1)
    m['x'] = x0; m['y'] = y0
AW2, AH2 = round(AW * S), round(AH * S)
js = '/* generated by tools/cut_sheet.py — frame rects inside assets/cats/atlas_<breed>.png (same for all breeds).\n   ax/ay = ground anchor (feet), mx/my = mouth (where the fishing line attaches). All cats face RIGHT. */\n'
js += 'window.NK_SPRITES = ' + json.dumps({'poses': meta, 'w': AW2, 'h': AH2}, separators=(',', ':')) + ';\n'
open(os.path.join(ROOT, 'game', 'js', 'sprites.js'), 'w').write(js)
print('atlas', AW, AH)
