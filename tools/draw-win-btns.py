#!/usr/bin/env python3
"""Draw win/shop pills at 2x. True RGBA, supersampled — no AI recut."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
W, H = 800, 320
SS = 4


def lerp(a, b, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(a, b))


def stadium_mask(w, h, pad, fill=255):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    box = [pad, pad, w - pad - 1, h - pad - 1]
    d.rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=fill)
    return m


def paint(top, bot, inner):
    sw, sh = W * SS, H * SS
    pad = 8 * SS
    rim = 18 * SS
    stroke = 6 * SS

    white = Image.new("RGBA", (sw, sh), (255, 255, 255, 255))
    white.putalpha(stadium_mask(sw, sh, pad))

    stroke_m = stadium_mask(sw, sh, pad + rim)
    stroke_im = Image.new("RGBA", (sw, sh), inner + (255,))
    stroke_im.putalpha(stroke_m)

    body_m = stadium_mask(sw, sh, pad + rim + stroke)
    px = np.zeros((sh, sw, 4), dtype=np.uint8)
    ys = np.linspace(0, 1, sh)
    for y, t in enumerate(ys):
        c = lerp(top, bot, float(t))
        px[y, :, 0] = c[0]
        px[y, :, 1] = c[1]
        px[y, :, 2] = c[2]
        px[y, :, 3] = 255
    body = Image.fromarray(px, "RGBA")
    body.putalpha(body_m)

    gloss = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    gpad = pad + rim + stroke + 10 * SS
    gbox = [gpad, gpad, sw - gpad - 1, int(sh * 0.46)]
    gd.rounded_rectangle(gbox, radius=max(8, (gbox[3] - gbox[1]) // 2), fill=(255, 255, 255, 80))

    im = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    im = Image.alpha_composite(im, white)
    im = Image.alpha_composite(im, stroke_im)
    im = Image.alpha_composite(im, body)
    im = Image.alpha_composite(im, gloss)
    return im.resize((W, H), Image.LANCZOS)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs = (
        ("btn-win-action.png", (170, 227, 254), (88, 168, 236), (48, 132, 214)),
        ("btn-win-double.png", (255, 220, 64), (252, 176, 16), (214, 120, 24)),
    )
    for name, top, bot, inner in jobs:
        im = paint(top, bot, inner)
        dest = OUT_DIR / name
        im.save(dest, "PNG")
        print("drew", dest.name, im.size, im.mode, "corner", im.getpixel((0, 0)))


if __name__ == "__main__":
    main()
