#!/usr/bin/env python3
"""White shop/settings card. Supersampled rounded rect — no AI corner jaggies."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui" / "panel-clear.png"
SIZE = 640
SS = 8
PAD = 8
RADIUS = 96
STROKE = 6
STROKE_RGB = (138, 132, 193)


def rounded(w: int, h: int, pad: int, radius: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [pad, pad, w - pad - 1, h - pad - 1],
        radius=radius,
        fill=255,
    )
    return m


def main() -> None:
    sw = sh = SIZE * SS
    pad = PAD * SS
    radius = RADIUS * SS
    stroke = STROKE * SS

    outer = np.array(rounded(sw, sh, pad, radius), dtype=np.int16)
    inner = np.array(rounded(sw, sh, pad + stroke, max(8, radius - stroke)), dtype=np.int16)
    ring = np.clip(outer - inner, 0, 255).astype(np.uint8)

    card = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    fill = Image.new("RGBA", (sw, sh), (255, 255, 255, 255))
    fill.putalpha(Image.fromarray(inner.astype(np.uint8), "L"))
    rim = Image.new("RGBA", (sw, sh), STROKE_RGB + (255,))
    rim.putalpha(Image.fromarray(ring, "L"))
    card = Image.alpha_composite(card, fill)
    card = Image.alpha_composite(card, rim)
    out = card.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(OUT, "PNG")
    print("drew", OUT.name, out.size, "corner", out.getpixel((0, 0)))


if __name__ == "__main__":
    main()
