#!/usr/bin/env python3
"""Candy item icons + gold coin. Supersampled vectors — no AI outline jaggies."""

import math
from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui"
GOLD_UUID = "7e22bb20-0076-4b02-8002-000000000076"

YELLOW = (251, 225, 20)
YELLOW_DEEP = (236, 168, 12)
PURPLE = (173, 99, 239)
PURPLE_DEEP = (132, 62, 196)
PINK = (255, 92, 132)
CYAN = (86, 214, 246)
TEAL = (64, 196, 196)
TEAL_DEEP = (28, 140, 148)


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
    "fixAlphaTransparencyArtifacts": true,
    "hasAlpha": true,
    "redirect": "{uuid}@6c48a"
  }}
}}
""",
        encoding="utf-8",
    )


def sdf_alpha(sdf: np.ndarray) -> np.ndarray:
    return np.clip(0.5 - sdf, 0.0, 1.0)


def circle_sdf(x: np.ndarray, y: np.ndarray, cx: float, cy: float, r: float) -> np.ndarray:
    return np.hypot(x - cx, y - cy) - r


def annulus_sdf(x: np.ndarray, y: np.ndarray, cx: float, cy: float, r: float, half: float) -> np.ndarray:
    return np.abs(np.hypot(x - cx, y - cy) - r) - half


def ang_wrap(a: np.ndarray) -> np.ndarray:
    return (a + math.pi) % (2 * math.pi) - math.pi


def paint_rgba(alpha: np.ndarray, rgb: Tuple[int, int, int]) -> Image.Image:
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    im = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    im[:, :, 0] = rgb[0]
    im[:, :, 1] = rgb[1]
    im[:, :, 2] = rgb[2]
    im[:, :, 3] = a
    return Image.fromarray(im, "RGBA")


def composite(base: Image.Image, *layers: Image.Image) -> Image.Image:
    out = base
    for layer in layers:
        out = Image.alpha_composite(out, layer)
    return out


def grid(s: int) -> Tuple[np.ndarray, np.ndarray]:
    y, x = np.mgrid[0:s, 0:s]
    return x.astype(np.float64) + 0.5, y.astype(np.float64) + 0.5


def arrow_head_sdf(
    x: np.ndarray,
    y: np.ndarray,
    tip_x: float,
    tip_y: float,
    dir_x: float,
    dir_y: float,
    length: float,
    width: float,
) -> np.ndarray:
    ln = math.hypot(dir_x, dir_y) or 1.0
    dx, dy = dir_x / ln, dir_y / ln
    px, py = -dy, dx
    cx = tip_x - dx * length * 0.35
    cy = tip_y - dy * length * 0.35
    lx = x - cx
    ly = y - cy
    along = lx * dx + ly * dy
    side = lx * px + ly * py
    # rounded triangle: taper from back to tip
    half = width * (0.55 - along / length)
    return np.maximum(np.abs(side) - np.maximum(half, 0), np.maximum(along - length * 0.65, -along - length * 0.35))


def draw_shuffle(size: int = 512, ss: int = 4) -> Image.Image:
    s = size * ss
    x, y = grid(s)
    cx = cy = s * 0.5
    r = s * 0.30
    body = s * 0.072
    outline = s * 0.048
    ang = np.arctan2(y - cy, x - cx)
    a0, b0 = math.radians(200), math.radians(20)

    def cw_arc(start: float, half: float) -> np.ndarray:
        ring = annulus_sdf(x, y, cx, cy, r, half)
        span = math.radians(155)
        d = (start - ang) % (2 * math.pi)
        return sdf_alpha(np.maximum(ring, (d - span) * r))

    purple = np.maximum(cw_arc(a0, body + outline), cw_arc(b0, body + outline))
    yellow = np.maximum(cw_arc(a0, body), cw_arc(b0, body))

    def head(at: float, inward: float) -> Tuple[np.ndarray, np.ndarray]:
        tx = cx + math.cos(at) * r
        ty = cy + math.sin(at) * r
        # clockwise tangent
        dx = math.sin(at)
        dy = -math.cos(at)
        p = arrow_head_sdf(x, y, tx, ty, dx, dy, s * 0.20, s * 0.13)
        return sdf_alpha(p - inward), sdf_alpha(p)

    # heads at the clockwise ends (20° and 200°)
    y_in, y_out = head(math.radians(20), outline * 0.9)
    y_in2, y_out2 = head(math.radians(200), outline * 0.9)
    purple = np.maximum(purple, np.maximum(y_out, y_out2))
    yellow = np.maximum(yellow, np.maximum(y_in, y_in2))

    # glossy highlight on upper-left yellow
    hx = cx - s * 0.06
    hy = cy - s * 0.10
    gloss = yellow * sdf_alpha(circle_sdf(x, y, hx, hy, s * 0.22)) * 0.55
    gloss *= sdf_alpha(annulus_sdf(x, y, cx, cy, r, body * 0.55))

    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = composite(
        canvas,
        paint_rgba(purple, PURPLE),
        paint_rgba(yellow, YELLOW),
        paint_rgba(gloss, (255, 255, 255)),
    )
    return canvas.resize((size, size), Image.LANCZOS)


def draw_merge(size: int = 512, ss: int = 4) -> Image.Image:
    s = size * ss
    x, y = grid(s)
    cy = s * 0.5
    r = s * 0.22
    gap = s * 0.13
    lx, rx = s * 0.5 - gap, s * 0.5 + gap
    outline = s * 0.042
    left = sdf_alpha(circle_sdf(x, y, lx, cy, r))
    right = sdf_alpha(circle_sdf(x, y, rx, cy, r))
    left_o = sdf_alpha(circle_sdf(x, y, lx, cy, r + outline))
    right_o = sdf_alpha(circle_sdf(x, y, rx, cy, r + outline))
    union_o = np.maximum(left_o, right_o)
    overlap = left * right
    star_r = s * 0.055
    star = sdf_alpha(circle_sdf(x, y, s * 0.5, cy, star_r))
    gloss_l = left * sdf_alpha(circle_sdf(x, y, lx - s * 0.06, cy - s * 0.08, r * 0.45)) * 0.45
    gloss_r = right * sdf_alpha(circle_sdf(x, y, rx - s * 0.06, cy - s * 0.08, r * 0.45)) * 0.45
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = composite(
        canvas,
        paint_rgba(union_o, PURPLE),
        paint_rgba(left, PINK),
        paint_rgba(right, CYAN),
        paint_rgba(overlap * 0.55, (168, 92, 220)),
        paint_rgba(star, (255, 255, 255)),
        paint_rgba(gloss_l, (255, 255, 255)),
        paint_rgba(gloss_r, (255, 255, 255)),
    )
    return canvas.resize((size, size), Image.LANCZOS)


def draw_hook(size: int = 512, ss: int = 4) -> Image.Image:
    s = size * ss
    x, y = grid(s)
    # J hook: vertical stem + bottom hook + top eye
    cx = s * 0.52
    stem_x = s * 0.42
    half = s * 0.070
    outline = s * 0.046
    # stem
    stem = np.maximum(np.abs(x - stem_x) - half, np.maximum(y - s * 0.62, s * 0.22 - y))
    # bottom hook: annulus on the right
    hx, hy, hr = s * 0.56, s * 0.62, s * 0.16
    hook = annulus_sdf(x, y, hx, hy, hr, half)
    ang = np.arctan2(y - hy, x - hx)
    # keep right-bottom through left-bottom (clockwise from -20° to 200°)
    d = (math.radians(-10) - ang) % (2 * math.pi)
    hook = np.maximum(hook, (d - math.radians(200)) * hr)
    # eye
    ex, ey, er = stem_x, s * 0.22, s * 0.10
    eye_out = np.abs(circle_sdf(x, y, ex, ey, er)) - half
    body = sdf_alpha(np.minimum(np.minimum(stem, hook), eye_out))
    outer = sdf_alpha(np.minimum(np.minimum(stem - outline, hook - outline), eye_out - outline))
    gloss = body * sdf_alpha(circle_sdf(x, y, stem_x - s * 0.04, s * 0.30, s * 0.10)) * 0.5
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = composite(
        canvas,
        paint_rgba(outer, PURPLE),
        paint_rgba(body, YELLOW),
        paint_rgba(gloss, (255, 255, 255)),
    )
    return canvas.resize((size, size), Image.LANCZOS)


def draw_shovel(size: int = 512, ss: int = 4) -> Image.Image:
    s = size * ss
    x, y = grid(s)
    half = s * 0.055
    outline = s * 0.042
    # handle shaft
    shaft_x = s * 0.50
    shaft = np.maximum(np.abs(x - shaft_x) - half, np.maximum(y - s * 0.58, s * 0.28 - y))
    # D handle
    hx, hy, hr = s * 0.50, s * 0.24, s * 0.11
    dhandle = annulus_sdf(x, y, hx, hy, hr, half)
    # blade: rounded triangle / spade
    bx, by = s * 0.50, s * 0.72
    blade_w, blade_h = s * 0.20, s * 0.16
    lx = (x - bx) / blade_w
    ly = (y - by) / blade_h
    blade = (lx * lx + (ly - 0.15) * (ly - 0.15) * 0.7) - 1.0
    blade = np.maximum(blade * min(blade_w, blade_h), by - s * 0.08 - y)
    body = sdf_alpha(np.minimum(np.minimum(shaft, dhandle), blade))
    outer = sdf_alpha(np.minimum(np.minimum(shaft - outline, dhandle - outline), blade - outline))
    gloss = body * sdf_alpha(circle_sdf(x, y, s * 0.44, s * 0.40, s * 0.12)) * 0.45
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = composite(
        canvas,
        paint_rgba(outer, TEAL),
        paint_rgba(body, YELLOW),
        paint_rgba(gloss, (255, 255, 255)),
    )
    return canvas.resize((size, size), Image.LANCZOS)


def draw_gold(size: int = 128, ss: int = 8) -> Image.Image:
    s = size * ss
    x, y = grid(s)
    cx = cy = s * 0.5
    r = s * 0.42
    coin = sdf_alpha(circle_sdf(x, y, cx, cy, r))
    rim = sdf_alpha(np.abs(circle_sdf(x, y, cx, cy, r * 0.78)) - s * 0.035)
    # vertical gold gradient
    t = np.clip((y - (cy - r)) / (2 * r), 0, 1)
    rgb = np.zeros((s, s, 4), dtype=np.uint8)
    top, bot = np.array([255, 226, 92]), np.array([232, 156, 24])
    for i in range(3):
        rgb[:, :, i] = (top[i] * (1 - t) + bot[i] * t).astype(np.uint8)
    rgb[:, :, 3] = (coin * 255).astype(np.uint8)
    base = Image.fromarray(rgb, "RGBA")
    rim_im = paint_rgba(rim * coin, (255, 210, 96))
    gloss = paint_rgba(coin * sdf_alpha(circle_sdf(x, y, cx - s * 0.08, cy - s * 0.12, r * 0.42)) * 0.35, (255, 255, 255))
    canvas = composite(Image.new("RGBA", (s, s), (0, 0, 0, 0)), base, rim_im, gloss)
    # $
    font = None
    for path, idx in (
        ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", None),
        ("/System/Library/Fonts/Supplemental/Arial.ttf", None),
        ("/System/Library/Fonts/PingFang.ttc", 1),
    ):
        p = Path(path)
        if not p.exists():
            continue
        try:
            font = ImageFont.truetype(str(p), int(s * 0.48), index=idx or 0)
            break
        except OSError:
            continue
    if font:
        overlay = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        text = "$"
        bbox = d.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text(((s - tw) * 0.5 - bbox[0], (s - th) * 0.5 - bbox[1] - s * 0.02), text, font=font, fill=(196, 112, 16, 255))
        canvas = Image.alpha_composite(canvas, overlay)
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = (
        ("ic-item-shuffle.png", draw_shuffle),
        ("ic-item-merge.png", draw_merge),
        ("ic-item-hook.png", draw_hook),
        ("ic-item-shovel.png", draw_shovel),
    )
    for name, fn in jobs:
        im = fn()
        dest = OUT / name
        im.save(dest, "PNG")
        print("drew", name, im.size, "bbox", im.getbbox())
    gold = draw_gold(256)
    gold_path = OUT / "ui-gold-icon.png"
    gold.save(gold_path, "PNG")
    write_meta(gold_path, GOLD_UUID, *gold.size)
    print("drew", gold_path.name, gold.size, "bbox", gold.getbbox())


if __name__ == "__main__":
    main()
