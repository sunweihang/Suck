#!/usr/bin/env python3
"""Victory popup chrome + cutouts from 主界面UI关卡显示设计 (3)(4)(5)."""

from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
SRC_PANEL = Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (3).png")
SRC_NEXT = Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (4).png")
SRC_BACK = Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (5).png")
PINGFANG = "/System/Library/Fonts/PingFang.ttc"
FREDOKA = ROOT / "tools/fonts/Fredoka-Bold.ttf"

UUID = {
    "bg-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e20",
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "title-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e22",
    "hero-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e23",
    "btn-win-back": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e24",
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
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


def save(im: Image.Image, name: str) -> Image.Image:
    path = OUT_DIR / f"{name}.png"
    im.save(path, "PNG")
    write_meta(path, UUID[name], *im.size)
    print("wrote", path.name, im.size)
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


def round_rect_mask(w: int, h: int, r: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    return m


def apply_mask(rgb: Image.Image, mask: Image.Image) -> Image.Image:
    out = rgb.convert("RGBA")
    out.putalpha(mask)
    return out


def lerp(a: Tuple[int, ...], b: Tuple[int, ...], t: float) -> Tuple[int, ...]:
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(len(a)))


def vgrad(w: int, h: int, top: Tuple[int, int, int, int], bot: Tuple[int, int, int, int]) -> Image.Image:
    g = Image.new("RGBA", (1, h))
    px = g.load()
    for y in range(h):
        px[0, y] = lerp(top, bot, y / max(h - 1, 1))
    return g.resize((w, h), Image.BILINEAR)


def stamp_text(w: int, h: int, text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.02
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def layer(mask: Image.Image, color: Tuple[int, int, int, int]) -> Image.Image:
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def draw_bg() -> Image.Image:
    w, h = 1080, 1920
    im = vgrad(w, h, (186, 226, 248, 255), (255, 248, 226, 255))
    mid = vgrad(w, h, (210, 220, 250, 0), (236, 214, 246, 90))
    im.alpha_composite(mid)
    rng = np.random.RandomState(7)
    draw = ImageDraw.Draw(im, "RGBA")
    for _ in range(28):
        x = int(rng.randint(40, w - 40))
        y = int(rng.randint(40, h - 40))
        r = int(rng.randint(10, 54))
        col = (255, 255, 255, int(rng.randint(28, 70)))
        draw.ellipse((x - r, y - r, x + r, y + r), outline=col, width=max(2, r // 10))
        hi = max(2, r // 5)
        draw.ellipse((x - r * 0.35, y - r * 0.55, x - r * 0.35 + hi, y - r * 0.55 + hi), fill=(255, 255, 255, 90))
    for _ in range(18):
        x = int(rng.randint(30, w - 30))
        y = int(rng.randint(30, h - 30))
        s = int(rng.randint(4, 12))
        draw.polygon(
            [(x, y - s), (x + s * 0.28, y - s * 0.18), (x + s, y), (x + s * 0.28, y + s * 0.18),
             (x, y + s), (x - s * 0.28, y + s * 0.18), (x - s, y), (x - s * 0.28, y - s * 0.18)],
            fill=(255, 255, 255, int(rng.randint(70, 140))),
        )
    return im


def draw_panel() -> Image.Image:
    w, h = 1840, 2480
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pad = 48
    x0, y0, x1, y1 = pad, pad, w - pad, h - pad
    rw, rh = x1 - x0, y1 - y0
    r = 220

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sm = round_rect_mask(rw, rh, r)
    shadow.paste(layer(sm, (120, 110, 170, 70)), (x0 + 10, y0 + 28))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=28))
    canvas.alpha_composite(shadow)

    outer = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    om = round_rect_mask(rw, rh, r)
    ring = vgrad(rw, rh, (168, 214, 255, 255), (196, 176, 240, 255))
    ring.putalpha(om)
    outer.alpha_composite(ring)
    inner_m = round_rect_mask(rw - 56, rh - 56, r - 28)
    face = Image.new("RGBA", (rw - 56, rh - 56), (255, 252, 246, 255))
    hi = vgrad(rw - 56, rh - 56, (255, 255, 255, 40), (255, 252, 246, 0))
    face.alpha_composite(hi)
    face.putalpha(inner_m)
    outer.alpha_composite(face, dest=(28, 28))

    gm = Image.new("L", (rw, rh), 0)
    ImageDraw.Draw(gm).pieslice((-rw * 0.15, -rh * 0.55, rw * 1.15, rh * 0.42), 200, 340, fill=70)
    gm = gm.filter(ImageFilter.GaussianBlur(18))
    gloss = Image.composite(
        Image.new("RGBA", (rw, rh), (255, 255, 255, 55)),
        Image.new("RGBA", (rw, rh), (0, 0, 0, 0)),
        gm,
    )
    outer = Image.alpha_composite(outer, Image.composite(gloss, Image.new("RGBA", (rw, rh), (0, 0, 0, 0)), om))

    # inner cyan rim
    rim = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.rounded_rectangle((18, 18, rw - 19, rh - 19), radius=r - 10, outline=(210, 244, 255, 200), width=10)
    rd.rounded_rectangle((8, 8, rw - 9, rh - 9), radius=r - 4, outline=(186, 168, 230, 160), width=6)
    outer.alpha_composite(rim)

    canvas.alpha_composite(outer, dest=(x0, y0))
    return canvas


def extract_by_seed(src: Image.Image, seed: np.ndarray, grow: int, pad: int = 10) -> Image.Image:
    mask = Image.fromarray((seed.astype(np.uint8) * 255), "L")
    if grow > 0:
        mask = mask.filter(ImageFilter.MaxFilter(grow * 2 + 1))
        mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, grow // 3)))
        mask = mask.point(lambda p: 255 if p > 40 else 0)
    rgba = src.convert("RGBA")
    arr = np.array(rgba)
    arr[:, :, 3] = np.minimum(arr[:, :, 3], np.array(mask))
    return trim(Image.fromarray(arr, "RGBA"), pad)


def extract_title(src: Image.Image) -> Image.Image:
    crop = src.crop((500, 190, 1548, 500))
    a = np.array(crop.convert("RGB"))
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    body = (g > 175) & (b > 155) & (r < 220) & ((g - r) > 12)
    teal = (g > 90) & (b > 90) & (r < 150) & (g - r > 12)
    seed = body | teal
    # drop the long panel rim if it sneaks in along the bottom
    seed[int(seed.shape[0] * 0.82) :, :] = False
    out = extract_by_seed(crop, seed, grow=16, pad=10)
    return out


def extract_hero(src: Image.Image) -> Image.Image:
    crop = src.crop((430, 760, 1618, 1620))
    a = np.array(crop.convert("RGB"))
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    cream = (mn > 236) & (chroma < 22)
    peach = (r > 190) & (g > 120) & (b < 210) & (r - b > 28)
    star = (r > 210) & (g > 170) & (b < 150)
    ribbon = ((r > 160) & (b > 160) & (g < 200)) | ((r > 200) & (g > 180) & (b < 170))
    bubble = (b > 180) & (g > 180) & (r < 230) & (chroma > 8)
    seed = peach | star | ribbon | bubble | ((chroma > 18) & ~cream)
    out = extract_by_seed(crop, seed, grow=10, pad=16)
    return out


def extract_pill(src: Path, chroma_min: int, grow: int) -> Image.Image:
    im = Image.open(src).convert("RGB")
    a = np.array(im)
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    # walkable outside: near-white, low chroma
    walk = (mn >= 248) & (chroma < 10)
    h, w = walk.shape
    from collections import deque
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if walk[y, x]:
            seen[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and walk[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    keep = ~seen
    # if almost everything kept, fall back to chroma body
    if keep.mean() > 0.85:
        keep = chroma >= chroma_min
    out = extract_by_seed(im, keep, grow=grow, pad=18)
    return out


def draw_title() -> Image.Image:
    ss = 3
    w, h = 1680, 520
    font = ImageFont.truetype(PINGFANG, int(300 * ss / 3), index=8)
    body = stamp_text(w, h, "胜利!", font, int(10 * ss / 3))
    outline = stamp_text(w, h, "胜利!", font, int(28 * ss / 3))
    halo = stamp_text(w, h, "胜利!", font, int(52 * ss / 3))
    body = body.filter(ImageFilter.GaussianBlur(0.6)).point(lambda p: 255 if p > 90 else 0)
    outline = outline.filter(ImageFilter.GaussianBlur(0.8)).point(lambda p: 255 if p > 70 else 0)
    halo = halo.filter(ImageFilter.GaussianBlur(1.2)).point(lambda p: 255 if p > 50 else 0)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop = halo.filter(ImageFilter.GaussianBlur(10))
    canvas.alpha_composite(layer(drop, (70, 120, 150, 70)), dest=(0, 10))
    canvas.alpha_composite(layer(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(layer(outline, (46, 130, 138, 255)), dest=(0, 6))
    canvas.alpha_composite(layer(outline, (36, 118, 128, 255)))
    fill = vgrad(w, h, (232, 255, 236, 255), (92, 214, 214, 255))
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    return trim(canvas, 8)


def draw_btn(kind: str) -> Image.Image:
    ss = 4
    w, h = 720 * ss // 4 * 2, 240 * ss // 4 * 2
    # 1440 x 480 at 2x of 720x240
    w, h = 1440, 480
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bw, bh = 1360, 360
    x0, y0 = (w - bw) // 2, 28
    r = bh // 2
    if kind == "next":
        top, bot = (186, 250, 230, 255), (120, 214, 196, 255)
        stroke = (42, 128, 122, 255)
        text_fill = (255, 255, 255, 255)
        text = "下一关"
        halo = (255, 255, 255, 255)
    else:
        top, bot = (255, 250, 230, 255), (246, 220, 176, 255)
        stroke = (166, 118, 72, 255)
        text_fill = (255, 248, 230, 255)
        text = "返回"
        halo = (255, 255, 255, 255)

    pill = round_rect_mask(bw, bh, r)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste(layer(pill, (150, 130, 190, 70)), (x0, y0 + 22))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)))

    face = vgrad(bw, bh, top, bot)
    face.putalpha(pill)
    white = Image.new("RGBA", (bw, bh), halo)
    white.putalpha(pill.filter(ImageFilter.MaxFilter(17)))
    plate = Image.new("RGBA", (bw + 24, bh + 24), (0, 0, 0, 0))
    plate.alpha_composite(white, dest=(12, 12))
    inner = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(inner).rounded_rectangle((8, 8, bw - 9, bh - 9), radius=max(4, r - 8), fill=255)
    rim = layer(pill, stroke)
    face_on = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    face_on.alpha_composite(rim)
    face_on.alpha_composite(apply_mask(face, inner) if False else face)
    # redraw: stroke then fill inset
    plate = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ring = 21 if kind == "next" else 9
    outer_w = pill.filter(ImageFilter.MaxFilter(ring))
    plate.paste(layer(outer_w, (255, 255, 255, 255)), (x0 - ring // 3, y0 - 2))
    plate.paste(layer(pill, stroke), (x0, y0))
    inset = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(inset).rounded_rectangle((10, 10, bw - 11, bh - 11), radius=max(8, r - 10), fill=255)
    fill = vgrad(bw, bh, top, bot)
    fill.putalpha(inset)
    tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tmp.paste(fill, (x0, y0), fill)
    plate.alpha_composite(tmp)

    # gloss
    gloss = Image.new("L", (bw, bh), 0)
    gd = ImageDraw.Draw(gloss)
    gd.arc((28, 16, bw * 0.42, bh * 0.72), 200, 340, fill=160, width=18)
    gd.arc((bw * 0.58, 16, bw - 28, bh * 0.72), 200, 340, fill=120, width=14)
    gloss = gloss.filter(ImageFilter.GaussianBlur(4))
    gcol = layer(gloss, (255, 255, 255, 180))
    gtmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gtmp.paste(gcol, (x0, y0), gcol)
    plate.alpha_composite(gtmp)
    canvas.alpha_composite(plate)

    font = ImageFont.truetype(PINGFANG, 132, index=8)
    body = stamp_text(w, h, text, font, 4)
    outline = stamp_text(w, h, text, font, 14)
    canvas.alpha_composite(layer(outline, stroke), dest=(0, 4))
    canvas.alpha_composite(layer(outline, stroke))
    canvas.alpha_composite(layer(body, text_fill))
    return trim(canvas, 6)


def preview(parts) -> None:
    canvas = Image.new("RGBA", (540, 960), (200, 220, 236, 255))
    bg = parts["bg-win"].resize((540, 960), Image.LANCZOS)
    canvas.alpha_composite(bg)
    panel = parts["panel-win"].resize((420, 566), Image.LANCZOS)
    canvas.alpha_composite(panel, dest=(60, 150))
    title = parts["title-win"].copy()
    title.thumbnail((300, 90), Image.LANCZOS)
    canvas.alpha_composite(title, dest=(270 - title.size[0] // 2, 132))
    hero = parts["hero-win"].copy()
    hero.thumbnail((300, 280), Image.LANCZOS)
    canvas.alpha_composite(hero, dest=(270 - hero.size[0] // 2, 300))
    back = parts["btn-win-back"].copy()
    nxt = parts["btn-win-next"].copy()
    back.thumbnail((170, 58), Image.LANCZOS)
    nxt.thumbnail((170, 58), Image.LANCZOS)
    canvas.alpha_composite(back, dest=(80, 640))
    canvas.alpha_composite(nxt, dest=(290, 640))
    canvas.convert("RGB").save("/tmp/win-preview.png")
    print("preview /tmp/win-preview.png")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC_PANEL).convert("RGB")
    parts = {}
    parts["bg-win"] = save(draw_bg(), "bg-win")
    parts["panel-win"] = save(draw_panel(), "panel-win")
    title = extract_title(src)
    if title.getbbox() is None or min(title.size) < 80:
        print("title extract weak, draw fallback")
        title = draw_title()
    parts["title-win"] = save(title, "title-win")
    hero = extract_hero(src)
    parts["hero-win"] = save(hero, "hero-win")
    parts["btn-win-back"] = save(draw_btn("back"), "btn-win-back")
    parts["btn-win-next"] = save(draw_btn("next"), "btn-win-next")
    preview(parts)


if __name__ == "__main__":
    main()
