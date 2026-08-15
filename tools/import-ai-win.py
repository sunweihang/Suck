#!/usr/bin/env python3
"""Import AI victory card. Punch outer blue, then hard-clip to a sharp rounded rect."""

from collections import deque
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-win"
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/win-panel-sharp.png")
UUID = "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21"


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


def is_canvas_blue(r: int, g: int, b: int) -> bool:
    if min(r, g, b) > 150 and max(r, g, b) > 200:
        return False
    if r + g + b > 520:
        return False
    db = ((r - 12) ** 2 + (g - 70) ** 2 + (b - 136) ** 2) ** 0.5
    return db < 62 and b > r + 30 and b > 90


def punch_blue(rgb: Image.Image) -> Image.Image:
    w, h = rgb.size
    px = rgb.load()
    walk = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            walk[y][x] = is_canvas_blue(*px[x, y])
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if walk[y][x] and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if walk[y][x] and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and walk[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True
                q.append((nx, ny))
    rgba = rgb.convert("RGBA")
    out = rgba.load()
    for y in range(h):
        for x in range(w):
            if seen[y][x]:
                r, g, b, _ = out[x, y]
                out[x, y] = (r, g, b, 0)
    return rgba


def opaque_bbox(im: Image.Image) -> tuple:
    box = im.getbbox()
    if not box:
        raise RuntimeError("empty card")
    return box


def hard_card(im: Image.Image) -> Image.Image:
    x0, y0, x1, y1 = opaque_bbox(im)
    inset = 10
    x0 += inset
    y0 += inset
    x1 -= inset
    y1 -= inset
    w, h = x1 - x0, y1 - y0
    radius = max(48, int(min(w, h) * 0.10))
    rgb = im.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.4, percent=170, threshold=2))
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    card.paste(rgb.crop((x0, y0, x1, y1)), (0, 0))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    card.putalpha(mask)
    ring = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    d.rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, outline=(132, 118, 210, 255), width=8)
    d.rounded_rectangle((5, 5, w - 6, h - 6), radius=max(8, radius - 4), outline=(120, 210, 235, 255), width=4)
    card = Image.alpha_composite(card, ring)
    return card


def find_next_btn(im: Image.Image) -> tuple:
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    y0 = int(h * 0.62)
    for y in range(y0, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            if g > 170 and g > r + 15 and b > 140 and r < 220:
                xs.append(x)
                ys.append(y)
    if not xs:
        return (int(w * 0.22), int(h * 0.78), int(w * 0.78), int(h * 0.92))
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC, WORK / "panel-win-sharp-src.png")
    rgb = Image.open(SRC).convert("RGB")
    punched = punch_blue(rgb)
    card = hard_card(punched)
    dest = OUT_DIR / "panel-win.png"
    card.save(dest, "PNG")
    write_meta(dest, UUID, *card.size)
    bx0, by0, bx1, by1 = find_next_btn(card)
    tw, th = card.size
    print("wrote", dest.name, card.size)
    print("btn_px", (bx0, by0, bx1, by1), "size", (bx1 - bx0, by1 - by0))
    print("btn_uv", round(bx0 / tw, 3), round(by0 / th, 3), round(bx1 / tw, 3), round(by1 / th, 3))


if __name__ == "__main__":
    main()
