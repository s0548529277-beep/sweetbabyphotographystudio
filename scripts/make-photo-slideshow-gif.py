"""Rotating-photos GIF for e-mails (slow cross-fade between photos). Usage: python3 make-photo-slideshow-gif.py out.gif bg_hex photo1 photo2 ...
First frame = first photo (Outlook shows only that)."""
import sys
from PIL import Image
out, bg = sys.argv[1], sys.argv[2]; files = sys.argv[3:]
W, H = 480, 320
def fit(f):
    im = Image.open(f).convert("RGB"); k = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((l, t, l + W, t + H))
ph = [fit(f) for f in files]; frames, dur = [], []
N = len(ph)
for i in range(N):
    a, b = ph[i], ph[(i + 1) % N]
    frames.append(a); dur.append(2600)
    for s in (0.33, 0.66):
        frames.append(Image.blend(a, b, s)); dur.append(120)
q = [f.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE) for f in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=True, disposal=1)
import os; print(out, os.path.getsize(out) // 1024, "KB", len(frames), "frames")
