"""
Builds the STUDIO e-mail signature GIF with the SAME animation as Michal's signature: a round photo that rotates
between studio photos (cross-fade), the "Sweetbaby" wordmark that is written in (soft left-to-right reveal) and fades
out once per loop. The wordmark keeps ONE colour (logo green); the ring around the photo ROTATES (green / blush / pink / sage,
like the studio price cards and the Noa bot). First frame = finished version (Outlook / blocked images).
Usage: python3 scripts/make-studio-signature-gif.py <out.gif> ["#f8ede4"]   (bg MUST equal the mail card colour)
Photos: public/email/studio-photo-{1..4}.jpg (studio interior, sofa + child, newborn, child) from the studio page
"""
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out = sys.argv[1]; bg_hex = sys.argv[2] if len(sys.argv) > 2 else "#f8ede4"
BG = tuple(int(bg_hex.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
K = 2; W, H = 660, 176
logo = Image.open("src/assets/logo-green-hero.png").convert("RGBA")
FONT = "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
def f(sz): return ImageFont.truetype(FONT, sz * K)
LOGO = (45, 61, 43)
RING = [(45, 61, 43), (248, 196, 192), (224, 160, 192), (160, 192, 128)]
SUB = (110, 92, 78)
def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
R = 82; CX, CY = 86, 88
def circ_photo(path, cy_frac):
    im = Image.open(path).convert("RGB"); w, h = im.size; s = min(w, h)
    top = int((h - s) * cy_frac); im = im.crop((0, top, s, top + s)).resize((2 * R * K, 2 * R * K), Image.LANCZOS)
    return im
PH = [circ_photo("public/email/studio-photo-1.jpg", .5), circ_photo("public/email/studio-photo-2.jpg", .3), circ_photo("public/email/studio-photo-3.jpg", .4), circ_photo("public/email/studio-photo-4.jpg", .55)]
MASK = Image.new("L", (2 * R * K, 2 * R * K), 0); ImageDraw.Draw(MASK).ellipse((0, 0, 2 * R * K - 1, 2 * R * K - 1), fill=255)
lw = 236 * K; lg = logo.resize((lw, int(lw * logo.height / logo.width)), Image.LANCZOS); lmask = lg.split()[3]
def draw_rtl(d, x_right, y, parts, font, fill):
    x = x_right
    for text in parts:
        w = d.textlength(text, font=font); x -= w; d.text((x, y), text, font=font, fill=fill); x -= d.textlength(" ", font=font)
YY, XX = np.mgrid[0:2 * (R + 4) * K, 0:2 * (R + 4) * K]
def ring_img(phase):
    """annulus whose colour goes round the circle and rotates with `phase` (0..1)"""
    c = R + 4; ang = (np.arctan2(YY - c * K, XX - c * K) / (2 * np.pi) + phase) % 1.0
    pos = ang * len(RING); i0 = pos.astype(int) % len(RING); t = (pos - np.floor(pos))[..., None]
    pal = np.array(RING, dtype=float); col = pal[i0] * (1 - t) + pal[(i0 + 1) % len(RING)] * t
    dist = np.hypot(XX - c * K, YY - c * K); m = ((dist <= (R + 3) * K) & (dist >= (R - 3) * K)).astype(np.uint8) * 255
    return Image.fromarray(col.astype(np.uint8), "RGB"), Image.fromarray(m, "L").filter(ImageFilter.GaussianBlur(.6 * K))
def frame(i, j, mix, phase, word, details):
    """photo i -> j blended by mix; word = 0..1 reveal of the wordmark; details = 0..1 opacity of the small lines."""
    im = Image.new("RGB", (W * K, H * K), BG); d = ImageDraw.Draw(im)
    tint = LOGO
    d.rounded_rectangle((70 * K, 22 * K, 655 * K, 154 * K), radius=66 * K, fill=(255, 251, 246), outline=lerp(LOGO, BG, 0.75), width=2 * K)
    ph = Image.blend(PH[i], PH[j], mix) if mix else PH[i]
    im.paste(ph, ((CX - R) * K, (CY - R) * K), MASK)
    rc, rm = ring_img(phase); im.paste(rc, ((CX - R - 4) * K, (CY - R - 4) * K), rm)
    if word > 0:
        # soft left-to-right reveal of the wordmark, slightly blurred at the edge (like the letters being written)
        mk = np.asarray(lmask).astype(float); x0 = 612 * K - lw
        cols = np.arange(lw)[None, :] / lw
        edge = np.clip((word * 1.25 - cols) / 0.25, 0, 1)
        m = Image.fromarray((mk * edge).astype(np.uint8), "L")
        if word < 1: m = m.filter(ImageFilter.GaussianBlur(1.2 * K * (1 - word)))
        im.paste(Image.new("RGB", lg.size, tint), (x0, 30 * K), m)
    if details > 0:
        pill = (255, 251, 246); c1 = lerp(pill, SUB, details); c2 = lerp(pill, tint, details)
        t2 = "054-8529277  \\\\  s0548529277@gmail.com  \\\\  sweetbabyphoto.shop"
        d.text((612 * K - d.textlength(t2, font=f(12)), 106 * K), t2, font=f(12), fill=c1)
        draw_rtl(d, 612 * K, 126 * K, ["תלמוד ירושלמי", "24,", "בית שמש", "\\\\", "השכרת סטודיו", "\\\\", "אביזרים", "\\\\", "מימוש סל לידה"], f(12), c2)
    return im.resize((W, H), Image.LANCZOS)
def to_p(im):
    a = np.asarray(im); mask = (a == np.array(BG)).all(axis=2)
    p = im.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    base = p.getpalette()[:255 * 3]; base += [0] * (255 * 3 - len(base))
    idx = np.asarray(p).copy(); idx[mask] = 255
    o = Image.fromarray(idx.astype(np.uint8), "P"); pal = base + list(BG); o.putpalette(pal + [0] * (768 - len(pal))); return o
frames, dur = [], []
n = len(PH); HOLD, FADE = 5, 2
total = n * (HOLD + FADE) + 3 + 6; ctr = [0]
def add(i, j, mix, word, details, ms=100):
    ph = ctr[0] / total; ctr[0] += 1
    frames.append(to_p(frame(i, j, mix, ph, word, details))); dur.append(ms)
add(0, 0, 0, 1, 1, ms=1200)  # finished first frame (also what Outlook shows)
for c in range(n):
    nx = (c + 1) % n
    for s_ in range(1, HOLD + 1): add(c, c, 0, 1, 1, ms=130 if s_ < HOLD else 700)
    if nx == 0:  # back to photo 1: take the word away while the photo changes
        for s_ in range(1, 4): add(c, nx if s_ == 3 else c, 0.5 if s_ == 3 else 0, 1 - s_ / 3, 1 - s_ / 3)
    for s_ in range(1, FADE + 1): add(c, nx, s_ / (FADE + 1), 1 if nx else 0, 1 if nx else 0, ms=110)
# write the word in again on photo 1, then loop to the finished first frame
for s_ in range(1, 7): add(0, 0, 0, s_ / 6, 0 if s_ < 4 else (s_ - 3) / 3)
frames[0].save(out, save_all=True, append_images=frames[1:], duration=dur, loop=0, optimize=False, disposal=1)
print(len(frames), "frames", os.path.getsize(out) // 1024, "KB")
