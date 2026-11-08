"""
Michal's e-mail signature with colours that rotate in the photographer palette (brown -> rose -> gold -> blush),
same layout as the fixed signature (circle photo + cream pill). The circle photo is cut from the existing
public/email/michal-signature.gif; the pill text is redrawn so its colour can change. First frame = finished
brown version (Outlook / blocked images). Usage: python3 scripts/make-michal-color-signature-gif.py <out.gif> ["#f7f3ee"]
(bg MUST equal the mail card colour)
"""
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; bg_hex = sys.argv[2] if len(sys.argv) > 2 else "#f7f3ee"
BG = tuple(int(bg_hex.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
K = 3; W, H = 660, 176
src = Image.open("public/email/michal-signature.gif"); src.seek(src.n_frames - 3)
photo = src.convert("RGB").crop((0, 0, 172, 176)).resize((172 * K, 176 * K), Image.LANCZOS)
FONT = "/usr/share/fonts/truetype/freefont/FreeSans.ttf"; FONTB = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
def f(sz, b=False): return ImageFont.truetype(FONTB if b else FONT, sz * K)
TINTS = [(62, 48, 41), (194, 59, 109), (169, 120, 79), (217, 138, 166), (62, 48, 41)]
def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def spaced(d, x_right, y, text, font, fill, gap):
    w = sum(d.textlength(c, font=font) + gap for c in text) - gap; x = x_right - w
    for c in text: d.text((x, y), c, font=font, fill=fill); x += d.textlength(c, font=font) + gap
def draw_rtl(d, x_right, y, parts, font, fills):
    x = x_right
    for (text, _), fill in zip(parts, fills):
        w = d.textlength(text, font=font); x -= w; d.text((x, y), text, font=font, fill=fill); x -= d.textlength(" ", font=font)
def frame(tint):
    im = Image.new("RGB", (W * K, H * K), BG); d = ImageDraw.Draw(im)
    d.rounded_rectangle((70 * K, 22 * K, 655 * K, 154 * K), radius=66 * K, fill=(252, 249, 245), outline=lerp(tint, BG, 0.62), width=2 * K)
    cx, cy, r = 86, 88, 82
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).ellipse(((cx - r) * K, (cy - r) * K, (cx + r) * K, (cy + r) * K), fill=255)
    im.paste(photo, (0, 0), m.crop((0, 0, 172 * K, 176 * K)) if False else m.crop((0, 0, 172 * K, 176 * K)))
    d = ImageDraw.Draw(im)
    d.ellipse(((cx - r - 2) * K, (cy - r - 2) * K, (cx + r + 2) * K, (cy + r + 2) * K), outline=tint, width=4 * K)
    spaced(d, 612 * K, 34 * K, "MICHAL SIBONI", f(27), tint, 7 * K)
    sub = (110, 92, 78)
    t2 = "053-418-1051  \\\\  m0548529277@gmail.com  \\\\  michalsiboni.co.il"
    d.text((612 * K - d.textlength(t2, font=f(12)), 82 * K), t2, font=f(12), fill=sub)
    parts = [("צילומי ניו בורן", 1), ("\\\\", 0), ("משפחה", 1), ("\\\\", 0), ("מימוש סל לידה", 1), ("\\\\", 0), ("סטודיו סוויט בייבי", 1)]
    draw_rtl(d, 612 * K, 108 * K, parts, f(12), [sub, sub, sub, sub, sub, sub, tint])
    return im.resize((W, H), Image.LANCZOS)
def to_p(im):
    a = np.asarray(im); mask = (a == np.array(BG)).all(axis=2)
    p = im.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    base = p.getpalette()[:255 * 3]; base += [0] * (255 * 3 - len(base))
    idx = np.asarray(p).copy(); idx[mask] = 255
    o = Image.fromarray(idx.astype(np.uint8), "P"); pal = base + list(BG); o.putpalette(pal + [0] * (768 - len(pal))); return o
seq, dur = [TINTS[0]], [1500]
for i in range(len(TINTS) - 1):
    for s in range(1, 5):
        seq.append(lerp(TINTS[i], TINTS[i + 1], s / 4)); dur.append(1100 if s == 4 else 90)
frames = [to_p(frame(t)) for t in seq]
frames[0].save(out, save_all=True, append_images=frames[1:], duration=dur, loop=0, optimize=False, disposal=1)
print(len(frames), "frames", os.path.getsize(out) // 1024, "KB")
