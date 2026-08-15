#!/usr/bin/env python3
"""Draw the Q-style level board chrome. Output: 1424x665 transparent PNG."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H = 1424, 665
SS = 4
OUT = Path(__file__).resolve().parents[1] / "assets/resources/ui/board-score-q.png"

ORANGE = (255, 140, 42, 255)
ORANGE_HI = (255, 196, 96, 255)
ORANGE_MID = (255, 156, 56, 255)
ORANGE_DEEP = (214, 88, 28, 255)
CREAM = (255, 248, 230, 255)
CREAM_HI = (255, 253, 246, 255)
CREAM_LO = (255, 236, 204, 255)
INNER = (255, 232, 176, 255)
SHADOW = (80, 48, 28, 78)


def _round_rect(size, radius, color):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=color)
    return im


def _v_grad(size, top, bot):
    w, h = size
    grad = Image.new("RGBA", (1, h))
    px = grad.load()
    for y in range(h):
        t = y / float(max(h - 1, 1))
        px[0, y] = tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(4))
    return grad.resize(size, Image.BILINEAR)


def _paste(dst, src, xy, mask=None):
    dst.alpha_composite(src, dest=xy) if mask is None else dst.paste(src, xy, mask)


def draw():
    sw, sh = W * SS, H * SS
    canvas = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))

    pad = 40 * SS
    x0, y0 = pad, int(28 * SS)
    x1, y1 = sw - pad, sh - int(48 * SS)
    cw, ch = x1 - x0, y1 - y0
    r = int(ch * 0.28)
    rim = max(22 * SS, int(ch * 0.064))

    shadow = _round_rect((cw, ch), r, SHADOW)
    shadow_layer = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    shadow_layer.paste(shadow, (x0 + 4 * SS, y0 + 16 * SS), shadow)
    canvas.alpha_composite(shadow_layer.filter(ImageFilter.GaussianBlur(radius=8 * SS)))

    shell_mask = _round_rect((cw, ch), r, (255, 255, 255, 255))
    shell = _v_grad((cw, ch), ORANGE, ORANGE_DEEP)
    shell.putalpha(shell_mask.split()[-1])
    _paste(canvas, shell, (x0, y0))

    # cream well
    ix0, iy0 = rim, rim
    iw, ih = cw - rim * 2, ch - rim * 2
    ir = max(8 * SS, r - rim)
    well_mask = _round_rect((iw, ih), ir, (255, 255, 255, 255))
    well = _v_grad((iw, ih), CREAM_HI, CREAM)
    well.putalpha(well_mask.split()[-1])
    _paste(canvas, well, (x0 + ix0, y0 + iy0))

    draw = ImageDraw.Draw(canvas)
    inset = 6 * SS
    draw.rounded_rectangle(
        (x0 + ix0 + inset, y0 + iy0 + inset, x0 + ix0 + iw - inset - 1, y0 + iy0 + ih - inset - 1),
        radius=max(6 * SS, ir - inset),
        outline=INNER,
        width=max(2 * SS, int(2.6 * SS)),
    )

    # thin cream edge between rim and well
    draw.rounded_rectangle(
        (x0 + ix0 - 2 * SS, y0 + iy0 - 2 * SS, x0 + ix0 + iw + 2 * SS - 1, y0 + iy0 + ih + 2 * SS - 1),
        radius=ir + 2 * SS,
        outline=(255, 214, 150, 255),
        width=max(SS, int(1.6 * SS)),
    )

    return canvas.resize((W, H), Image.LANCZOS)


def main():
    im = draw()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "PNG")
    print(f"wrote {OUT} {im.size}")


if __name__ == "__main__":
    main()
