#!/usr/bin/env python3
"""Scoop power digits: portal rmbg cut, pure white fill, fat black stroke."""

import importlib.util
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/toys"
WORK = ROOT / "tools/ai-power"
PREVIEW = ROOT / "tools/power-digits-preview.png"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)

CELL = 640
COLS = 5
ROWS = 2
OUT_H = 160
PAD = 36
FACE_PX = 400
STROKE = 44
FILL = (255, 255, 255)
RING = (8, 8, 8)
STUDIO = (48, 168, 255)

FONTS = (
    Path("/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Black.ttf"),
    ROOT / "tools/fonts/Fredoka-Bold.ttf",
)


def load_font(px):
    for path in FONTS:
        if path.exists():
            return ImageFont.truetype(str(path), px)
    raise FileNotFoundError("no heavy digit font")


def load_rmbg_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def portal_mask(src):
    Client = load_rmbg_client()

    class Sharp(Client):
        @staticmethod
        def _build_prompt(image_name):
            prompt = Client._build_prompt(image_name)
            prompt["13"]["inputs"]["process_res"] = 2048
            prompt["13"]["inputs"]["mask_blur"] = 0
            prompt["13"]["inputs"]["mask_offset"] = 0
            prompt["13"]["inputs"]["refine_foreground"] = True
            return prompt

    last = None
    for base in PORTALS:
        if not base:
            continue
        print("portal rmbg", base, flush=True)
        try:
            return Sharp(base=base).remove_background(src)
        except Exception as err:
            last = err
            print("  fail", base, err, flush=True)
    raise RuntimeError("portal rmbg failed: %s" % last)


def flatten_fill(im):
    a = np.array(im)
    lum = a[:, :, :3].astype(np.float32).mean(axis=2)
    white = (lum >= 140) & (a[:, :, 3] > 20)
    a[white, 0] = 255
    a[white, 1] = 255
    a[white, 2] = 255
    black = (lum < 140) & (a[:, :, 3] > 20)
    a[black, 0] = RING[0]
    a[black, 1] = RING[1]
    a[black, 2] = RING[2]
    return Image.fromarray(a, "RGBA")


def bleed_rgb(im, steps=8):
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    known = arr[:, :, 3] > 16
    for _ in range(steps):
        nxt = rgb.copy()
        nxt_k = known.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            src_k = np.roll(np.roll(known, dy, 0), dx, 1)
            src_c = np.roll(np.roll(rgb, dy, 0), dx, 1)
            if dy < 0:
                src_k[dy:, :] = False
            elif dy > 0:
                src_k[:dy, :] = False
            if dx < 0:
                src_k[:, dx:] = False
            elif dx > 0:
                src_k[:, :dx] = False
            take = (~nxt_k) & src_k
            nxt[take] = src_c[take]
            nxt_k |= take
        rgb, known = nxt, nxt_k
    arr[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def resize_h(im, height):
    w = max(2, int(round(im.size[0] * height / float(im.size[1]))))
    arr = np.array(im, dtype=np.float32)
    alpha = arr[:, :, 3:4] / 255.0
    arr[:, :, :3] *= alpha
    small = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA").resize((w, height), Image.LANCZOS)
    out = np.array(small, dtype=np.float32)
    a = out[:, :, 3:4]
    out[:, :, :3] = np.where(a > 0, out[:, :, :3] * 255.0 / np.maximum(a, 1.0), 255)
    out[:, :, 3] = a[:, :, 0]
    arr = np.array(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA"))
    lum = arr[:, :, :3].astype(np.float32).mean(axis=2)
    fill = (lum >= 160) & (arr[:, :, 3] > 40)
    arr[fill] = (255, 255, 255, 255)
    stroke = (lum < 160) & (arr[:, :, 3] > 80)
    arr[stroke] = (0, 0, 0, 255)
    arr[arr[:, :, 3] < 120] = (0, 0, 0, 0)
    hard = Image.fromarray(arr, "RGBA")
    pad = 12
    boxed = Image.new("RGBA", (hard.size[0] + pad * 2, hard.size[1] + pad * 2), (0, 0, 0, 0))
    boxed.paste(hard, (pad, pad))
    return boxed


def glyph_rgba(ch, fnt):
    im = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    ink = ImageDraw.Draw(im)
    box = ink.textbbox((0, 0), ch, font=fnt, stroke_width=STROKE)
    x = (CELL - (box[2] - box[0])) / 2 - box[0]
    y = (CELL - (box[3] - box[1])) / 2 - box[1]
    ink.text((x, y), ch, font=fnt, fill=RING + (255,), stroke_width=STROKE, stroke_fill=RING + (255,))
    ink.text((x, y), ch, font=fnt, fill=FILL + (255,))
    arr = np.array(im)
    white = (arr[:, :, 0] > 200) & (arr[:, :, 3] > 200)
    fat = ndimage.binary_dilation(white, iterations=5)
    arr[fat & (arr[:, :, 3] > 200)] = FILL + (255,)
    return flatten_fill(Image.fromarray(arr, "RGBA"))


def sheet_from(glyphs):
    sheet = Image.new("RGB", (CELL * COLS, CELL * ROWS), STUDIO)
    for d, g in enumerate(glyphs):
        x = (d % COLS) * CELL
        y = (d // COLS) * CELL
        cell = Image.new("RGB", (CELL, CELL), STUDIO)
        cell.paste(g, (0, 0), g)
        sheet.paste(cell, (x, y))
    return sheet


def apply_portal_alpha(glyphs, cut):
    """Portal alpha only on the outer fringe. Fill stays opaque pure white."""
    cut = cut.convert("RGBA").resize((CELL * COLS, CELL * ROWS), Image.LANCZOS)
    out = []
    for d, g in enumerate(glyphs):
        x = (d % COLS) * CELL
        y = (d // COLS) * CELL
        orig = np.array(g)
        portal = np.array(cut.crop((x, y, x + CELL, y + CELL)))[:, :, 3]
        lum = orig[:, :, :3].astype(np.float32).mean(axis=2)
        body = orig[:, :, 3] > 80
        fill = body & (lum >= 160)
        stroke = body & (lum < 160)
        rgba = np.zeros_like(orig)
        rgba[fill] = (255, 255, 255, 255)
        rgba[stroke] = (0, 0, 0, 255)
        edge = (~body) & (portal > 160)
        rgba[edge] = (0, 0, 0, 255)
        out.append(Image.fromarray(rgba, "RGBA"))
    return out


def shared_crop(images):
    boxes = []
    for im in images:
        a = np.array(im)[:, :, 3]
        ys, xs = np.where(a > 16)
        if len(xs) == 0:
            boxes.append((0, 0, im.size[0], im.size[1]))
            continue
        boxes.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    top = max(0, min(b[1] for b in boxes) - PAD)
    bot = min(images[0].size[1], max(b[3] for b in boxes) + PAD)
    out = []
    for im, box in zip(images, boxes):
        left = max(0, box[0] - PAD)
        right = min(im.size[0], box[2] + PAD)
        out.append(im.crop((left, top, right, bot)))
    return out


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


def stamp_number(digits, text, height=36):
    glyphs = [
        digits[int(ch)].resize(
            (max(2, int(round(digits[int(ch)].size[0] * height / float(digits[int(ch)].size[1])))), height),
            Image.LANCZOS,
        )
        for ch in text
    ]
    overlap = int(height * 0.16)
    widths = [g.size[0] for g in glyphs]
    total = sum(widths) - overlap * (len(glyphs) - 1)
    sheet = Image.new("RGBA", (total, height), (0, 0, 0, 0))
    x = 0
    for g, w in zip(glyphs, widths):
        sheet.alpha_composite(g, (x, 0))
        x += w - overlap
    return sheet


def preview(digits):
    colors = (
        (230, 70, 80),
        (150, 90, 220),
        (70, 200, 110),
        (150, 90, 220),
        (230, 70, 80),
        (70, 200, 110),
    )
    samples = ("23", "17", "14", "16", "24", "21")
    cell = 220
    sheet = Image.new("RGBA", (cell * 3, cell * 2), (40, 42, 48, 255))
    for i, text in enumerate(samples):
        x = (i % 3) * cell
        y = (i // 3) * cell
        blob = jelly(colors[i]).resize((188, 188), Image.LANCZOS)
        sheet.alpha_composite(blob, (x + 16, y + 22))
        num = stamp_number(digits, text, 36)
        sheet.alpha_composite(num, (x + (cell - num.size[0]) // 2, y + 90))
    return sheet


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    fnt = load_font(FACE_PX)
    print("font", fnt.getname(), flush=True)
    glyphs = [glyph_rgba(str(d), fnt) for d in range(10)]
    src = WORK / "power-sheet-src.png"
    sheet_from(glyphs).save(src)
    print("wrote", src, flush=True)
    cached = WORK / "power-sheet.rmbg.png"
    if cached.exists():
        cut = Image.open(cached).convert("RGBA")
        print("reuse portal cut", cut.size, flush=True)
    else:
        cut = portal_mask(src)
        cut.save(cached)
        print("portal cut", cut.size, "corner", cut.getpixel((0, 0))[3], flush=True)
    cut_glyphs = apply_portal_alpha(glyphs, cut)
    cropped = shared_crop(cut_glyphs)
    digits = []
    for d, im in enumerate(cropped):
        out = resize_h(im, OUT_H)
        digits.append(out)
        dest = OUT / ("power-%d.png" % d)
        out.save(dest)
        print("wrote %s %sx%s" % (dest, out.size[0], out.size[1]), flush=True)
    preview(digits).save(PREVIEW)
    print("wrote", PREVIEW, flush=True)


if __name__ == "__main__":
    os.environ.setdefault("RMBG_PORTAL_URL", "http://10.1.4.130:8080")
    os.environ.setdefault("RMBG_PORTAL_USER", "admin")
    os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")
    main()
