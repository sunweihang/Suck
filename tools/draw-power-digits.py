#!/usr/bin/env python3
"""Scoop-stamp digits: Fredoka Bold, cocoa, lightly embossed."""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/toys"
PREVIEW = ROOT / "tools/power-digits-preview.png"
FONT = ROOT / "tools/fonts/Fredoka-Bold.ttf"
SIZE = 256
HIRES = 512
SCALE = HIRES / float(SIZE)

FACE = (62, 34, 18)
SHADE = (40, 20, 10)
HIGH = (98, 58, 32)


def font(px):
    return ImageFont.truetype(str(FONT), px)


def glyph(ch):
    im = Image.new("L", (HIRES, HIRES), 0)
    ink = ImageDraw.Draw(im)
    fnt = font(int(188 * SCALE))
    box = ink.textbbox((0, 0), ch, font=fnt)
    x = (HIRES - (box[2] - box[0])) / 2 - box[0]
    y = (HIRES - (box[3] - box[1])) / 2 - box[1] - 6 * SCALE
    ink.text((x, y), ch, font=fnt, fill=255)
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def shift(mask, dx, dy):
    out = Image.new("L", mask.size, 0)
    out.paste(mask, (dx, dy))
    return out


def layer(mask, rgb):
    color = Image.new("RGBA", mask.size, rgb + (255,))
    color.putalpha(mask)
    return color


def draw_digit(ch):
    body = glyph(ch)
    hi = ImageChops.multiply(ImageChops.subtract(body, shift(body, 2, 3)), body)
    shade = ImageChops.multiply(ImageChops.subtract(body, shift(body, -2, -2)), body)
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    im.alpha_composite(layer(body, FACE))
    im.alpha_composite(layer(shade, SHADE))
    im.alpha_composite(layer(hi, HIGH))
    return im


def jelly(color, size=220):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = 8
    d.ellipse((pad, pad + 10, size - pad, size - pad + 6), fill=tuple(max(0, c - 38) for c in color) + (255,))
    d.ellipse((pad, pad, size - pad, size - pad - 8), fill=color + (255,))
    hi = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(hi).ellipse((size * 0.22, size * 0.14, size * 0.62, size * 0.42), fill=(255, 255, 255, 80))
    im.alpha_composite(hi)
    return im


def preview(digits):
    colors = (
        (255, 220, 70),
        (80, 220, 230),
        (120, 230, 170),
        (190, 150, 255),
        (255, 150, 190),
        (255, 170, 120),
    )
    samples = ("8", "10", "12", "16", "20", "24")
    cell = 240
    sheet = Image.new("RGBA", (cell * 3, cell * 2), (248, 244, 236, 255))
    for i, text in enumerate(samples):
        x = (i % 3) * cell
        y = (i // 3) * cell
        blob = jelly(colors[i]).resize((200, 200), Image.LANCZOS)
        sheet.alpha_composite(blob, (x + 20, y + 28))
        glyphs = [digits[int(ch)] for ch in text]
        span = 44 if len(glyphs) > 1 else 0
        start = x + cell / 2 - ((len(glyphs) - 1) * span) / 2
        for k, g in enumerate(glyphs):
            stamp_g = g.resize((84, 84), Image.LANCZOS)
            sheet.alpha_composite(stamp_g, (int(start + k * span - 42), y + 64))
    return sheet


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    digits = []
    for d in range(10):
        im = draw_digit(str(d))
        digits.append(im)
        dest = OUT / ("power-%d.png" % d)
        im.save(dest)
        print("wrote %s" % dest)
    preview(digits).save(PREVIEW)
    print("wrote %s" % PREVIEW)
    row = Image.new("RGBA", (SIZE * 10, SIZE), (248, 244, 236, 255))
    for d, im in enumerate(digits):
        row.alpha_composite(im, (d * SIZE, 0))
    row.save(ROOT / "tools/power-digits-row.png")


if __name__ == "__main__":
    main()
