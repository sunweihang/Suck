#!/usr/bin/env python3
"""Mint pill chrome + bubble glyphs matching the latest 关卡02 effect shot."""

from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
PINGFANG = "/System/Library/Fonts/PingFang.ttc"
ARIAL_ROUND = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"

# sampled from image-7b4f7984-8302-49fd-942c-20b24e0f6a5b.png
FILL_TOP = (92, 176, 107, 255)
FILL_BOT = (64, 132, 76, 255)
STROKE = (53, 112, 64, 255)
HALO = (255, 255, 255, 255)
BORDER = (181, 222, 177, 255)
DIAMOND = (86, 168, 100, 255)
SHADOW = (132, 148, 128, 90)

UUID = {
    "level-badge": "c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a41",
    "lv-prefix": "c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a44",
    "lv-guan": "c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a42",
    "lv-ka": "c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a43",
    **{f"lv-{n}": f"c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a5{n}" for n in range(10)},
}


def write_meta(path: Path, uuid: str, w: int, h: int) -> None:
    hw, hh = w / 2.0, h / 2.0
    path.with_suffix(".png.meta").write_text(
        f"""{{
  "ver": "1.0.27",
  "importer": "image",
  "imported": true,
  "uuid": "{uuid}",
  "files": [".json", ".png"],
  "subMetas": {{
    "6c48a": {{
      "importer": "texture",
      "uuid": "{uuid}@6c48a",
      "displayName": "{path.stem}",
      "id": "6c48a",
      "name": "texture",
      "userData": {{
        "wrapModeS": "clamp-to-edge",
        "wrapModeT": "clamp-to-edge",
        "minfilter": "linear",
        "magfilter": "linear",
        "mipfilter": "none",
        "anisotropy": 0,
        "isUuid": true,
        "imageUuidOrDatabaseUri": "{uuid}",
        "visible": false
      }},
      "ver": "1.0.22",
      "imported": true,
      "files": [".json"],
      "subMetas": {{}}
    }},
    "f9941": {{
      "importer": "sprite-frame",
      "uuid": "{uuid}@f9941",
      "displayName": "{path.stem}",
      "id": "f9941",
      "name": "spriteFrame",
      "userData": {{
        "trimThreshold": 1,
        "rotated": false,
        "offsetX": 0,
        "offsetY": 0,
        "trimX": 0,
        "trimY": 0,
        "width": {w},
        "height": {h},
        "rawWidth": {w},
        "rawHeight": {h},
        "borderTop": 0,
        "borderBottom": 0,
        "borderLeft": 0,
        "borderRight": 0,
        "packable": false,
        "pixelsToUnit": 100,
        "pivotX": 0.5,
        "pivotY": 0.5,
        "meshType": 0,
        "vertices": {{
          "rawPosition": [{-hw}, {-hh}, 0, {hw}, {-hh}, 0, {-hw}, {hh}, 0, {hw}, {hh}, 0],
          "indexes": [0, 1, 2, 2, 1, 3],
          "uv": [0, {h}, {w}, {h}, 0, 0, {w}, 0],
          "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
          "minPos": [{-hw}, {-hh}, 0],
          "maxPos": [{hw}, {hh}, 0]
        }},
        "isUuid": true,
        "imageUuidOrDatabaseUri": "{uuid}@6c48a",
        "atlasUuid": "",
        "trimType": "none"
      }},
      "ver": "1.0.12",
      "imported": true,
      "files": [".json"],
      "subMetas": {{}}
    }}
  }},
  "userData": {{
    "type": "sprite-frame",
    "fixAlphaTransparencyArtifacts": false,
    "hasAlpha": true,
    "redirect": "{uuid}@6c48a"
  }}
}}
""",
        encoding="utf-8",
    )


def round_mask(mask: Image.Image, radius: float, cut: int = 96) -> Image.Image:
    if radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=radius))
    return mask.point(lambda p: 255 if p >= cut else 0)


def stamp_text(size: int, ch: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), ch, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (size - tw) / 2 - bb[0]
    y = (size - th) / 2 - bb[1] + size * 0.03
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).text((x, y), ch, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def layer(mask: Image.Image, color: Tuple[int, int, int, int]) -> Image.Image:
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def gradient_fill(mask: Image.Image) -> Image.Image:
    w, h = mask.size
    grad = Image.new("RGBA", (1, h))
    px = grad.load()
    for y in range(h):
        t = y / float(max(h - 1, 1))
        # slight top highlight, then forest body
        if t < 0.22:
            u = t / 0.22
            c = tuple(int(FILL_TOP[i] * (1 - u * 0.08) + FILL_BOT[i] * (u * 0.08)) for i in range(4))
        else:
            u = (t - 0.22) / 0.78
            c = tuple(int(FILL_TOP[i] * (1 - u) + FILL_BOT[i] * u) for i in range(4))
        px[0, y] = c
    fill = grad.resize((w, h), Image.BILINEAR)
    fill.putalpha(mask)
    return fill


def hole_mask(body: Image.Image) -> Image.Image:
    """Pixels inside counters (0/4/6/8/9/关) that must stay transparent."""
    empty = body.point(lambda p: 0 if p else 255)
    rgb = Image.merge("RGB", (empty, empty, empty))
    for pt in ((0, 0), (body.size[0] - 1, 0), (0, body.size[1] - 1), (body.size[0] - 1, body.size[1] - 1)):
        ImageDraw.floodfill(rgb, pt, (0, 0, 0))
    return rgb.split()[0]


def punch_holes(im: Image.Image, holes: Image.Image, keep: int) -> Image.Image:
    if holes.getbbox() is None:
        return im
    ring = holes.filter(ImageFilter.MaxFilter(max(1, keep * 2 + 1)))
    punch = Image.new("L", im.size, 0)
    punch.paste(holes)
    # keep a thin dark rim around the counter
    punch = Image.fromarray(
        np.where((np.array(holes) > 0) & (np.array(ring) > 0), 255, 0).astype(np.uint8),
        "L",
    )
    # actually punch the hole interior only
    eroded = holes.filter(ImageFilter.MinFilter(max(1, keep * 2 + 1)))
    arr = np.array(im)
    cut = np.array(eroded) > 0
    arr[cut, 3] = 0
    return Image.fromarray(arr, "RGBA")


def bubble(ch: str, cell: int = 256) -> Image.Image:
    ss = 4
    s = cell * ss
    if ch.isdigit() and Path(ARIAL_ROUND).exists():
        font = ImageFont.truetype(ARIAL_ROUND, int(s * 0.56))
        fat, round_r = int(0.018 * s), s * 0.012
    else:
        font = ImageFont.truetype(PINGFANG, int(s * 0.50), index=8)
        fat, round_r = int(0.028 * s), s * 0.016

    body = round_mask(stamp_text(s, ch, font, fat), round_r, 100)
    outline = round_mask(stamp_text(s, ch, font, fat + int(0.034 * s)), round_r * 1.1, 92)
    halo = round_mask(stamp_text(s, ch, font, fat + int(0.078 * s)), round_r * 1.35, 80)
    holes = hole_mask(body)
    if holes.getbbox():
        cut = holes.filter(ImageFilter.MinFilter(max(3, int(0.012 * s) | 1)))
        def clear_inside(m):
            a = np.array(m)
            a[np.array(cut) > 0] = 0
            return Image.fromarray(a, "L")
        outline = clear_inside(outline)
        halo = clear_inside(halo)

    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    drop = halo.filter(ImageFilter.GaussianBlur(radius=int(0.018 * s)))
    canvas.alpha_composite(layer(drop, (70, 110, 80, 70)), dest=(0, int(0.022 * s)))
    canvas.alpha_composite(layer(halo, HALO))
    step = max(1, int(0.006 * s))
    depth = int(0.048 * s)
    for dy in range(step, depth + 1, step):
        canvas.alpha_composite(layer(outline, STROKE), dest=(0, dy))
    canvas.alpha_composite(layer(outline, STROKE))
    canvas.alpha_composite(gradient_fill(body))
    canvas = punch_holes(canvas, holes, max(2, int(0.01 * s)))
    return canvas.resize((cell, cell), Image.LANCZOS)


def draw_chrome() -> Image.Image:
    # 4x the in-game 360x84 board so SIMPLE scale stays even
    w, h = 1440, 336
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pill_w, pill_h = 1360, 248
    x0 = (w - pill_w) // 2
    y0 = 18
    x1, y1 = x0 + pill_w, y0 + pill_h
    r = pill_h / 2

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0 + 10, y0 + 18, x1 + 10, y1 + 22), radius=r, fill=SHADOW)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=16))
    im.alpha_composite(shadow)

    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=(255, 255, 255, 255))

    inset = 22
    sw = 7
    box = (x0 + inset, y0 + inset, x1 - inset, y1 - inset)
    ir = max(8, r - inset)
    dr.rounded_rectangle(box, radius=ir, outline=BORDER, width=sw)

    # diamonds sit on the left/right of the inner stroke
    cy = (y0 + y1) / 2
    d = 18
    for cx in (x0 + inset, x1 - inset):
        pts = [(cx, cy - d), (cx + d, cy), (cx, cy + d), (cx - d, cy)]
        dr.polygon(pts, fill=DIAMOND)
    return im


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.size[0], x1 + pad)
    y1 = min(im.size[1], y1 + pad)
    return im.crop((x0, y0, x1, y1))


def save(im: Image.Image, name: str) -> None:
    path = OUT_DIR / f"{name}.png"
    im.save(path, "PNG")
    write_meta(path, UUID[name], *im.size)
    print("wrote", path.name, im.size)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    chrome = draw_chrome()
    save(chrome, "level-badge")
    chrome.save("/tmp/level-badge-chrome.png")

    prefix = Image.new("RGBA", (520, 256), (0, 0, 0, 0))
    g0, g1 = bubble("关"), bubble("卡")
    prefix.alpha_composite(g0, dest=(0, 0))
    prefix.alpha_composite(g1, dest=(236, 0))
    prefix = trim(prefix, 4)
    save(prefix, "lv-prefix")
    save(trim(g0, 6), "lv-guan")
    save(trim(g1, 6), "lv-ka")
    prefix.save("/tmp/lv-prefix.png")

    digits = []
    for n in range(10):
        g = trim(bubble(str(n)), 6)
        save(g, f"lv-{n}")
        digits.append(g)
        g.save(f"/tmp/lv-{n}.png")

    # cream preview of 关卡02 on the pill, for visual QA
    preview = Image.new("RGBA", chrome.size, (255, 251, 217, 255))
    preview.alpha_composite(chrome)
    text = Image.new("RGBA", (900, 256), (0, 0, 0, 0))
    text.alpha_composite(prefix, dest=(0, 0))
    d0 = digits[0].resize((210, 210), Image.LANCZOS)
    d2 = digits[2].resize((210, 210), Image.LANCZOS)
    text.alpha_composite(d0, dest=(prefix.size[0] + 8, 22))
    text.alpha_composite(d2, dest=(prefix.size[0] + 168, 22))
    text = trim(text, 0)
    tw, th = text.size
    scale = 168 / th
    text = text.resize((max(1, int(tw * scale)), 168), Image.LANCZOS)
    px = (chrome.size[0] - text.size[0]) // 2
    py = (chrome.size[1] - text.size[1]) // 2 - 6
    preview.alpha_composite(text, dest=(px, py))
    preview.save("/tmp/level-badge-preview.png")
    print("preview", preview.size)


if __name__ == "__main__":
    main()
