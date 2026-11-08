"""
Builds the STUDIO e-mail signature GIF (same layout as Michal's fixed signature: circle + cream pill) in the studio's
colours: wordmark "Sweetbaby" (from src/assets/logo-green-hero.png) + the site's colourful heart, with the accent colour
cycling between green / pink / peach / sage like the site. First frame = finished green version (Outlook / blocked images).
Usage: python3 scripts/make-studio-signature-gif.py <out.gif> ["#f8ede4"]   (bg MUST equal the mail card colour)
"""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; bg_hex = sys.argv[2] if len(sys.argv) > 2 else "#f8ede4"
BG = tuple(int(bg_hex.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
K = 3; W, H = 660, 176
logo = Image.open("src/assets/logo-green-hero.png").convert("RGBA")
heart = Image.open("src/assets/heart-gradient.png").convert("RGBA")
FONT = "/usr/share/fonts/truetype/freefont/FreeSans.ttf"; FONTB = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
def f(sz, b=False): return ImageFont.truetype(FONTB if b else FONT, sz * K)
TINTS = [(45, 61, 43), (222, 126, 150), (240, 160, 125), (122, 160, 126), (45, 61, 43)]
def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def he(s): return s[::-1]
def draw_rtl(d, x_right, y, parts, font, fill):
    """parts: list of (text, is_hebrew) in logical order, laid out right-to-left."""
    x = x_right
    for text, heb in parts:
        t = text  # raqm does the bidi itself
        w = d.textlength(t, font=font)
        x -= w; d.text((x, y), t, font=font, fill=fill); x -= d.textlength(" ", font=font) * 1.0
    return x
def frame(tint):
    im = Image.new("RGB", (W * K, H * K), BG); d = ImageDraw.Draw(im)
    # pill
    d.rounded_rectangle((70 * K, 22 * K, 655 * K, 154 * K), radius=66 * K, fill=(255, 251, 246), outline=lerp(tint, BG, 0.6), width=2 * K)
    # circle with heart
    cx, cy, r = 86, 88, 82
    d.ellipse(((cx - r) * K, (cy - r) * K, (cx + r) * K, (cy + r) * K), fill=(253, 238, 232), outline=tint, width=4 * K)
    hs = int(88 * K); hh = heart.resize((hs, int(hs * heart.height / heart.width)), Image.LANCZOS)
    im.paste(hh, (int(cx * K - hh.width / 2), int(cy * K - hh.height / 2)), hh)
    # wordmark recoloured
    lw = 236 * K; lg = logo.resize((lw, int(lw * logo.height / logo.width)), Image.LANCZOS)
    mask = lg.split()[3]; col = Image.new("RGB", lg.size, tint)
    im.paste(col, (612 * K - lw, 30 * K), mask)
    sub = (110, 92, 78); d = ImageDraw.Draw(im)
    # line 2 (LTR details)
    t2 = "054-8529277  \\\\  s0548529277@gmail.com  \\\\  sweetbabyphoto.shop"
    d.text((612 * K - d.textlength(t2, font=f(12)), 106 * K), t2, font=f(12), fill=sub)
    # line 3 (Hebrew, RTL)
    draw_rtl(d, 612 * K, 126 * K, [("תלמוד ירושלמי", True), ("24,", False), ("בית שמש", True), ("\\\\", False), ("השכרת סטודיו", True), ("\\\\", False), ("אביזרים", True), ("\\\\", False), ("מימוש סל לידה", True)], f(12), tint if tint != TINTS[0] else (45, 61, 43))
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
import os; print(len(frames), "frames", os.path.getsize(out) // 1024, "KB")
