#!/usr/bin/env python3
"""Cut the level badge from the effect shot. Keep original pixels."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REF = Path(
    "/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/image-237d7663-3434-470d-9deb-3141658ac6e1.png"
)
OUT_DIR = ROOT / "assets/resources/ui"
OUT = OUT_DIR / "level-badge.png"
UUID = "c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a41"
PREFIX_UUID = "c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a44"
DIGIT_UUID = {
    n: f"c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a5{n}" for n in range(10)
}
PINGFANG = "/System/Library/Fonts/PingFang.ttc"
ARIAL_ROUND = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"


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


def extract_ref(src: Path) -> Image.Image:
    rgb = np.array(Image.open(src).convert("RGB")).astype(np.int16)
    h, w = rgb.shape[:2]
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    cream = (r > 240) & (g > 230) & (b < 240) & (b > 200) & (r - b > 8)
    dark = (r < 40) & (g < 40) & (b < 40)
    white = (r > 246) & (g > 246) & (b > 246)
    mint = (g > r + 6) & (g > 130)
    keep = white | mint
    # soft shadow under the pill: darker than cream, not the top bar
    shadow = (r < 250) & (g < 246) & (b < 230) & (r > 160) & ~cream & ~dark
    keep |= shadow
    alpha = np.where(keep, 255, 0).astype(np.uint8)
    alpha_im = Image.fromarray(alpha, "L")
    alpha_im = alpha_im.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(5))
    alpha = np.array(alpha_im)
    alpha[cream] = 0
    alpha[dark] = 0
    alpha = np.array(Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(radius=0.7)))
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[:, :, 3] = alpha
    ys, xs = np.where(alpha > 18)
    pad = 8
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(w, int(xs.max()) + pad + 1),
        min(h, int(ys.max()) + pad + 1),
    )
    cut = Image.fromarray(out, "RGBA").crop(box)
    return cut.resize((cut.size[0] * 2, cut.size[1] * 2), Image.LANCZOS)


def rounded_mask(size, box, radius):
    im = Image.new("L", size, 0)
    ImageDraw.Draw(im).rounded_rectangle(box, radius=radius, fill=255)
    return np.array(im)


def chrome_from_cut(cut: Image.Image) -> Image.Image:
    arr = np.array(cut)
    a = arr[:, :, 3]
    h, w = a.shape
    ys, xs = np.where(a > 40)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    radius = (y1 - y0) * 0.42
    outer = rounded_mask((w, h), (x0, y0, x1, y1), radius)
    band = max(12, int((y1 - y0) * 0.20))
    inner = rounded_mask(
        (w, h),
        (x0 + band, y0 + band, x1 - band, y1 - band),
        max(6, radius - band),
    )
    out = np.zeros_like(arr)
    frame = (outer > 0) & (inner == 0)
    out[frame] = arr[frame]
    out[inner > 0, :3] = (255, 255, 255)
    out[inner > 0, 3] = 255
    # keep original drop shadow below the capsule
    shadow = (a > 12) & (outer == 0)
    out[shadow] = arr[shadow]
    return Image.fromarray(out, "RGBA")


def bubble_glyph(ch: str, cell: int = 220) -> Image.Image:
    ss = 3
    s = cell * ss
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    if ch.isdigit() and Path(ARIAL_ROUND).exists():
        font = ImageFont.truetype(ARIAL_ROUND, int(s * 0.52))
    else:
        font = ImageFont.truetype(PINGFANG, int(s * 0.48), index=8)
    dr = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = dr.textbbox((0, 0), ch, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (s - tw) / 2 - bb[0]
    y = (s - th) / 2 - bb[1] + s * 0.02

    def stroke_mask(width):
        im = Image.new("L", (s, s), 0)
        ImageDraw.Draw(im).text((x, y), ch, font=font, fill=255, stroke_width=width, stroke_fill=255)
        im = im.filter(ImageFilter.GaussianBlur(radius=max(1, int(0.01 * s))))
        return im.point(lambda p: 255 if p >= 90 else 0)

    body = stroke_mask(int(0.016 * s))
    halo = stroke_mask(int(0.088 * s))
    shade = halo.filter(ImageFilter.GaussianBlur(radius=int(0.03 * s)))
    # gradient sampled from the effect shot
    grad = Image.new("RGBA", (1, s))
    px = grad.load()
    top, bot = (214, 236, 196, 255), (110, 186, 112, 255)
    for yy in range(s):
        t = yy / float(s - 1)
        px[0, yy] = tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(4))
    fill = grad.resize((s, s), Image.BILINEAR)
    fill.putalpha(body)

    def layer(mask, color):
        im = Image.new("RGBA", (s, s), color)
        im.putalpha(mask)
        return im

    canvas.alpha_composite(layer(shade, (70, 110, 70, 70)), dest=(0, int(0.018 * s)))
    canvas.alpha_composite(layer(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(fill)
    return canvas.resize((cell, cell), Image.LANCZOS)


def export_cut_prefix(cut: Image.Image) -> None:
    arr = np.array(cut)
    r, g, b, al = [arr[:, :, i].astype(np.int16) for i in range(4)]
    h, w = al.shape
    ink = (g > r + 8) & (g > 120) & (al > 60)
    m = int(h * 0.16)
    ink[:m, :] = False
    ink[-m:, :] = False
    ink[:, : int(w * 0.06)] = False
    ink[:, -int(w * 0.06) :] = False
    col = ink.any(axis=0)
    spans = []
    i = 0
    while i < w:
        if not col[i]:
            i += 1
            continue
        j = i
        while j < w and col[j]:
            j += 1
        if j - i > 8:
            spans.append((i, j))
        i = j
    ys, xs = np.where(ink)
    if len(ys) == 0 or not spans:
        return
    y0, y1 = int(ys.min()), int(ys.max())
    # first blob is 关卡
    sx, ex = spans[0]
    pad_x, pad_y = 22, 28
    gx0, gx1 = max(0, sx - pad_x), min(w, ex + pad_x)
    gy0, gy1 = max(0, y0 - pad_y), min(h, y1 + pad_y)
    cell = arr[gy0:gy1, gx0:gx1].copy()
    local = ink[gy0:gy1, gx0:gx1]
    keep = Image.fromarray((local.astype(np.uint8) * 255), "L").filter(ImageFilter.MaxFilter(25))
    km = np.array(keep) > 0
    cell[~km, 3] = 0
    im = Image.fromarray(cell, "RGBA")
    box = im.getbbox()
    if box:
        im = im.crop(box)
    path = OUT_DIR / "lv-prefix.png"
    im.save(path, "PNG")
    write_meta(path, PREFIX_UUID, *im.size)
    im.save("/tmp/cut-lv-prefix.png")
    print("prefix", im.size, path)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cut = extract_ref(REF)
    cut.save("/tmp/level-badge-fullcut.png")
    chrome = chrome_from_cut(cut)
    chrome.save("/tmp/level-badge-chrome.png")
    # exact effect shot — this is what the player sees
    cut.save(OUT, "PNG")
    write_meta(OUT, UUID, *cut.size)
    print("badge", cut.size, OUT)
    export_cut_prefix(cut)
    for n in range(10):
        g = bubble_glyph(str(n))
        path = OUT_DIR / f"lv-{n}.png"
        g.save(path, "PNG")
        write_meta(path, DIGIT_UUID[n], *g.size)
        print("digit", n, path)


if __name__ == "__main__":
    main()
