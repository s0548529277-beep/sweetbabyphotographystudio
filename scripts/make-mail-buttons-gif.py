"""
Animated e-mail BUTTONS (GIF) whose colours rotate like the funnel / bot buttons on the site, with a soft light sweep;
the gallery button also floats gently. E-mail clients ignore CSS animation, a GIF works everywhere (the link wraps the image).
First frame = the finished first colour (Outlook / blocked images).
Usage: python3 scripts/make-mail-buttons-gif.py <out_dir>
Backgrounds MUST equal the mail card colours: studio #f8ede4, photographer #f7f3ee.
"""
import sys, math, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
K = 3; W, H = 320, 100          # displayed at 160x50
FONTB = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
STUDIO = [(61, 90, 58), (200, 100, 128), (205, 120, 88), (96, 140, 110)]      # green, rose, terracotta, sage
MICHAL = [(161, 130, 102), (167, 136, 108), (172, 141, 113), (163, 132, 104)]       # exactly the logo brown #a18266 (owner 11-11), only a whisper of movement
def hexrgb(h): return tuple(int(h.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
def cyc(pal, p):
    n = len(pal); x = (p % 1.0) * n; i = int(x) % n; return lerp(pal[i], pal[(i + 1) % n], x - int(x))
def make(label, pal, bg_hex, name, float_amp=0, frames_n=24, soft=False, ink=(255, 255, 255)):
    BG = hexrgb(bg_hex); fr = []
    font = ImageFont.truetype(FONTB, 30 * K)
    for i in range(frames_n):
        p = i / frames_n
        c1, c2 = cyc(pal, p), cyc(pal, p + 0.25)
        dy = round(float_amp * math.sin(2 * math.pi * p * 2) * K)
        im = Image.new("RGB", (W * K, H * K), BG)
        # gradient pill
        x0, y0, x1, y1 = 10 * K, 22 * K + dy, (W - 10) * K, (H - 22) * K + dy
        grad = Image.new("RGB", (x1 - x0, y1 - y0))
        gx = np.linspace(0, 1, x1 - x0)[None, :, None]
        a = np.array(c1)[None, None, :] * (1 - gx) + np.array(c2)[None, None, :] * gx
        # soft light sweep
        sweep = (p * 1.6 - 0.3); band = 0
        a = np.clip(a + band, 0, 255)
        arr = np.repeat(a, y1 - y0, axis=0).astype(np.uint8)
        grad = Image.fromarray(arr, "RGB")
        mask = Image.new("L", grad.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, grad.width - 1, grad.height - 1), radius=(y1 - y0) // 2, fill=255)
        im.paste(grad, (x0, y0), mask)
        if soft:
            ImageDraw.Draw(im).rounded_rectangle((x0, y0, x1 - 1, y1 - 1), radius=(y1 - y0) // 2, outline=tuple(round(v * 0.82) for v in c1), width=2 * K)
        d = ImageDraw.Draw(im)
        tw = d.textlength(label, font=font)
        d.text(((W * K - tw) / 2 + K, (H * K - 30 * K) / 2 - 2 * K + dy + K), label, font=font, fill=tuple(round(v * 0.55) for v in c1)) if not soft else None  # soft shadow
        d.text(((W * K - tw) / 2, (H * K - 30 * K) / 2 - 2 * K + dy), label, font=font, fill=ink if soft else (255, 255, 255))
        fr.append(im.resize((W, H), Image.LANCZOS))
    def to_p(im):
        arr = np.asarray(im); m = (arr == np.array(BG)).all(axis=2)
        p = im.quantize(colors=63, method=Image.MEDIANCUT, dither=Image.NONE)
        base = p.getpalette()[:63 * 3]; base += [0] * (63 * 3 - len(base))
        idx = np.asarray(p).copy(); idx[m] = 63
        o = Image.fromarray(idx.astype(np.uint8), "P"); pal2 = base + list(BG); o.putpalette(pal2 + [0] * (768 - len(pal2))); return o
    ps = [to_p(f) for f in fr]
    path = os.path.join(out, name)
    ps[0].save(path, save_all=True, append_images=ps[1:], duration=[1500] + [(380 if soft else 300)] * (frames_n - 1), loop=0, optimize=False, disposal=1)
    print(name, os.path.getsize(path) // 1024, "KB")
SOFT_STUDIO = [(207, 227, 194), (247, 210, 195), (243, 205, 216), (214, 232, 222)]
SOFT_MICHAL = [(239, 228, 211), (230, 211, 187), (243, 235, 221), (233, 218, 198)]
# importance: primary = saturated + white text; secondary = soft pastel + dark text (all rotate slowly)
make("לאתר הסטודיו", STUDIO, "#f8ede4", "btn-studio-site.gif")
make("ניווט בוויז", SOFT_STUDIO, "#f8ede4", "btn-studio-waze.gif", soft=True, ink=(45, 61, 43))
make("שליחת מייל", SOFT_STUDIO[::-1], "#f8ede4", "btn-studio-mail.gif", soft=True, ink=(45, 61, 43))
make("לגלריה שלי", MICHAL, "#f7f3ee", "btn-michal-gallery.gif", float_amp=3)
make("לאתר הסטודיו", SOFT_MICHAL, "#f7f3ee", "btn-michal-site.gif", soft=True, ink=(74, 47, 38))
make("שליחת מייל", SOFT_MICHAL[::-1], "#f7f3ee", "btn-michal-mail.gif", soft=True, ink=(74, 47, 38))
