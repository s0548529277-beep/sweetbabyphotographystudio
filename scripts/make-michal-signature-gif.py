import sys, math
import numpy as np
from PIL import Image

SRC = "/home/claude/michal-sibony-s-creative-hub/public/images/"
OUT = sys.argv[1]
BG = tuple(int(sys.argv[2].lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
OUTW = 600
SS = 2  # supersample

logo = Image.open(SRC + "michal-logo.png").convert("RGBA")
heart = Image.open(SRC + "michal-heart.png").convert("RGBA")
W, H = logo.size  # 936x276
RW, RH = OUTW * SS, round(OUTW * SS * H / W)
logo_r = logo.resize((RW, RH), Image.LANCZOS)
la = np.asarray(logo_r).astype(np.float32)

hw = round(RW * 0.0438)
hh = round(hw * heart.size[1] / heart.size[0])
heart_r = heart.resize((hw, hh), Image.LANCZOS)
hx = RW * 0.4957
hy = RH * 0.279
ox, oy = hw * 0.5, hh * 0.6  # transform origin

def bezier(x1, y1, x2, y2):
    def f(t):
        lo, hi = 0.0, 1.0
        for _ in range(40):
            m = (lo + hi) / 2
            x = 3*(1-m)**2*m*x1 + 3*(1-m)*m*m*x2 + m**3
            if x < t: lo = m
            else: hi = m
        m = (lo + hi) / 2
        return 3*(1-m)**2*m*y1 + 3*(1-m)*m*m*y2 + m**3
    return f

ease_write = bezier(0.45, 0.05, 0.35, 1.0)
ease_pop = bezier(0.3, 1.6, 0.5, 1.0)
ease_io = bezier(0.42, 0, 0.58, 1.0)

def write_alpha(s):
    # mask: opaque to 40% of a 2.5W wide gradient, transparent from 60%; position 100%->0%
    x = np.arange(RW, dtype=np.float32)
    m = x + 1.5 * RW * (1 - s)
    frac = m / (2.5 * RW)
    return np.clip((0.6 - frac) / 0.2, 0, 1)[None, :]

def heart_scale_pop(t):  # t seconds since pop start (2.7s)
    if t <= 0: return 0.0, 0.0
    p = min(t / 0.7, 1.0)
    e = ease_pop(p)
    return 0.2 + 0.8 * e, min(1.0, p / 1.0 * 1.0) if False else e if e < 1 else 1.0

def beat_scale(t):  # t seconds since beat start
    c = (t % 3.4) / 3.4 * 100
    keys = [(0,1),(60,1),(68,1.28),(76,1),(84,1.18),(92,1),(100,1)]
    for (a, va), (b, vb) in zip(keys, keys[1:]):
        if a <= c <= b:
            if b == a: return vb
            return va + (vb - va) * ease_io((c - a) / (b - a))
    return 1.0

def render(T, full=False):
    s = 1.0 if full else ease_write(min(max((T - 0.3) / 2.6, 0), 1))
    a = la[..., 3] / 255.0 * write_alpha(s)
    base = np.empty((RH, RW, 3), np.float32)
    base[:] = BG
    rgb = la[..., :3]
    out = base * (1 - a[..., None]) + rgb * a[..., None]
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")
    # heart
    if full:
        sc, op = 1.0, 1.0
    elif T < 2.7:
        sc, op = 0.0, 0.0
    elif T < 3.4:
        p = (T - 2.7) / 0.7
        sc = 0.2 + 0.8 * ease_pop(p)
        op = min(1.0, p / 0.5)
    else:
        sc, op = 1.0, 1.0
        if T >= 4.2:
            sc = beat_scale(T - 4.2)
    if op > 0 and sc > 0.01:
        nw, nh = max(1, round(hw * sc)), max(1, round(hh * sc))
        hs = heart_r.resize((nw, nh), Image.LANCZOS)
        if op < 1:
            al = hs.getchannel("A").point(lambda v: int(v * op))
            hs.putalpha(al)
        px = round(hx + ox - nw * 0.5)
        py = round(hy + oy - nh * 0.6)
        img.paste(hs, (px, py), hs)
    return img.resize((OUTW, round(OUTW * H / W)), Image.LANCZOS)

frames, durs = [], []
FPS_MS = 40
frames.append(render(0, full=True)); durs.append(1600)           # first frame = finished logo (Outlook / blocked images)
t = 0.0
while t <= 3.4:                                                   # writing + heart pop
    frames.append(render(t)); durs.append(FPS_MS); t += FPS_MS / 1000
frames.append(render(3.5)); durs.append(2800)                     # rest
t = 6.24
while t <= 7.4:                                                   # double heartbeat
    frames.append(render(4.2 + (t - 4.2))); durs.append(FPS_MS); t += FPS_MS / 1000
frames.append(render(7.5)); durs.append(3500)                     # hold the finished signature

pal_src = frames[0].quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE)
# make the background colour EXACT in the palette (otherwise the GIF shows as a slightly different box on the card)
pal = pal_src.getpalette()[:96 * 3]
best = min(range(96), key=lambda i: sum((pal[i * 3 + k] - BG[k]) ** 2 for k in range(3)))
pal[best * 3:best * 3 + 3] = list(BG)
pal_src.putpalette(pal + [0] * (768 - len(pal)))
PAL = np.array(pal, dtype=np.int32).reshape(-1, 3)
def to_p(f):
    a = np.asarray(f, dtype=np.int32).reshape(-1, 1, 3)
    d = ((a - PAL[None, :, :]) ** 2).sum(axis=2)          # exact nearest palette colour (PIL's own lookup is approximate)
    out = Image.fromarray(d.argmin(axis=1).astype(np.uint8).reshape(f.size[1], f.size[0]), "P")
    out.putpalette(pal + [0] * (768 - len(pal)))
    return out
q = [to_p(f) for f in frames]
q[0].save(OUT, save_all=True, append_images=q[1:], duration=durs, loop=2, optimize=True, disposal=1)
print(len(q), "frames")
