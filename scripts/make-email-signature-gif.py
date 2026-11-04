"""
Re-colours Michal's fixed email-signature GIF (Drive: michal-siboni-signature-final-cream2.gif — circle photo +
cream pill with MICHAL SIBONI, phone, mail, site, services) for the site's draft emails:
  * its white outside area becomes the email card colour (so no white box on the cream card),
  * a copy of a finished frame is put FIRST (Outlook / blocked images show only the first frame),
  * all original frame timings are kept.
Usage: python3 scripts/make-email-signature-gif.py <source.gif> <out.gif> "#f7f3ee"
"""
import sys
import numpy as np
from PIL import Image

src, out, bg_hex = sys.argv[1], sys.argv[2], sys.argv[3]
BG = tuple(int(bg_hex.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))

im = Image.open(src)
frames, durs = [], []
for i in range(im.n_frames):
    im.seek(i)
    frames.append(im.convert("RGB"))
    durs.append(im.info.get("duration", 100))

def convert(f):
    a = np.asarray(f)
    mask = a.min(axis=2) >= 246                      # white / cream-white -> card colour
    p = f.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    base = p.getpalette()[:255 * 3]
    base = base + [0] * (255 * 3 - len(base))        # palette may be shorter than 255 entries
    pal = base + list(BG)
    idx = np.asarray(p).copy()
    idx[mask] = 255
    o = Image.fromarray(idx.astype(np.uint8), "P")
    o.putpalette(pal + [0] * (768 - len(pal)))
    return o

finished = len(frames) - 2                           # a complete frame (text + photo)
seq = [finished] + list(range(len(frames)))
dseq = [1000] + durs
q = [convert(frames[i]) for i in seq]
q[0].save(out, save_all=True, append_images=q[1:], duration=dseq, loop=0, optimize=False, disposal=1)
print(len(q), "frames ->", out)
