#!/usr/bin/env python3
"""Punch indigo key from AI result cards/buttons and write Cocos sprites."""

from collections import deque
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
SRC_DIR = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets")

SRC = {
    "panel-win": SRC_DIR / "result-win-panel.png",
    "panel-fail": SRC_DIR / "result-fail-panel.png",
    "btn-win-next": SRC_DIR / "result-btn-next.png",
    "btn-fail-retry": SRC_DIR / "result-btn-retry.png",
}
UUID = {
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "panel-fail": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e31",
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    "btn-fail-retry": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e32",
}
TARGET_W = {
    "panel-win": 1840,
    "panel-fail": 1840,
    "btn-win-next": 1280,
    "btn-fail-retry": 1280,
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


def is_key_blue(r: int, g: int, b: int) -> bool:
    if r > 88 or g > 140 or b < 196:
        return False
    if b - r < 130 or b - g < 90:
        return False
    return True


def punch_key(rgb: Image.Image) -> Image.Image:
    w, h = rgb.size
    px = rgb.load()
    walk = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            walk[y][x] = is_key_blue(*px[x, y])
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


def defringe(im: Image.Image) -> Image.Image:
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a == 255:
                continue
            if is_key_blue(r, g, b):
                px[x, y] = (r, g, b, 0)
                continue
            t = a / 255.0
            # pull residual indigo out of semi-transparent fringe
            nr = min(255, max(0, int((r - 40 * (1 - t)) / max(t, 0.08))))
            ng = min(255, max(0, int((g - 94 * (1 - t)) / max(t, 0.08))))
            nb = min(255, max(0, int((b - 234 * (1 - t)) / max(t, 0.08))))
            px[x, y] = (nr, ng, nb, a)
    return im


def crop_opaque(im: Image.Image, pad: int = 8) -> Image.Image:
    box = im.getbbox()
    if not box:
        raise RuntimeError("empty after punch")
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.size[0], x1 + pad)
    y1 = min(im.size[1], y1 + pad)
    return im.crop((x0, y0, x1, y1))


def hard_round(im: Image.Image, radius_ratio: float = 0.08) -> Image.Image:
    w, h = im.size
    radius = max(28, int(min(w, h) * radius_ratio))
    src_a = im.split()[-1]
    plate = Image.new("RGB", (w, h), (255, 250, 240))
    plate.paste(im.convert("RGB"), mask=src_a)
    plate = plate.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))
    card = plate.convert("RGBA")
    clip = Image.new("L", (w, h), 0)
    ImageDraw.Draw(clip).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    card.putalpha(Image.composite(src_a, Image.new("L", (w, h), 0), clip))
    return card


def scale_to_width(im: Image.Image, width: int) -> Image.Image:
    h = max(2, round(im.size[1] * width / im.size[0]))
    return im.resize((width, h), Image.LANCZOS)


def process(name: str, is_panel: bool) -> Image.Image:
    src = SRC[name]
    shutil.copy2(src, WORK / f"{name}-src.png")
    rgb = Image.open(src).convert("RGB")
    punched = punch_key(rgb)
    punched = defringe(punched)
    cropped = crop_opaque(punched, pad=4 if is_panel else 2)
    if is_panel:
        cropped = hard_round(cropped, 0.07)
    out = scale_to_width(cropped, TARGET_W[name])
    dest = OUT_DIR / f"{name}.png"
    out.save(dest, "PNG")
    write_meta(dest, UUID[name], *out.size)
    print("wrote", dest.name, out.size)
    return out


def preview(win: Image.Image, fail: Image.Image, nxt: Image.Image, retry: Image.Image) -> None:
    canvas = Image.new("RGBA", (1080, 960), (36, 40, 58, 255))
    for i, (panel, btn) in enumerate(((win, nxt), (fail, retry))):
        p = panel.copy()
        p.thumbnail((430, 620), Image.LANCZOS)
        x = 70 + i * 520
        y = 80
        canvas.alpha_composite(p, dest=(x, y))
        b = btn.copy()
        b.thumbnail((250, 90), Image.LANCZOS)
        bx = x + (p.size[0] - b.size[0]) // 2
        by = y + p.size[1] - int(p.size[1] * 0.18) - b.size[1] // 2
        canvas.alpha_composite(b, dest=(bx, by))
    out = WORK / "result-preview.png"
    canvas.convert("RGB").save(out)
    print("preview", out)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    win = process("panel-win", True)
    fail = process("panel-fail", True)
    nxt = process("btn-win-next", False)
    retry = process("btn-fail-retry", False)
    preview(win, fail, nxt, retry)


if __name__ == "__main__":
    main()
