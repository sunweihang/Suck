#!/usr/bin/env python3
"""Import victory art as-is. Only punch outer white; RGB stays the design file."""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
SRC = {
    "panel-win": Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (3).png"),
    "btn-win-next": Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (4).png"),
    "btn-win-back": Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (5).png"),
}
UUID = {
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    "btn-win-back": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e24",
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


def flood_outside(walk: np.ndarray) -> np.ndarray:
    h, w = walk.shape
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if walk[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and walk[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def trim(im: Image.Image, pad: int = 12) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.size[0], x1 + pad)
    y1 = min(im.size[1], y1 + pad)
    return im.crop((x0, y0, x1, y1))


def cut_panel(src: Path) -> Image.Image:
    rgb = Image.open(src).convert("RGB")
    a = np.array(rgb)
    mx = a.max(axis=2).astype(int)
    mn = a.min(axis=2).astype(int)
    chroma = mx - mn
    wall = (chroma >= 12) | (mn < 248)
    wall_im = Image.fromarray(wall.astype(np.uint8) * 255, "L").filter(ImageFilter.MaxFilter(17))
    wall = np.array(wall_im) > 0
    walk = (~wall) & (mn >= 246)
    outside = flood_outside(walk)
    rgba = np.array(rgb.convert("RGBA"))
    rgba[outside, 3] = 0
    return trim(Image.fromarray(rgba, "RGBA"), 8)


def cut_pill(src: Path, chroma_min: int, grow: int) -> Image.Image:
    rgb = Image.open(src).convert("RGB")
    a = np.array(rgb)
    chroma = a.max(axis=2).astype(int) - a.min(axis=2).astype(int)
    body = Image.fromarray((chroma >= chroma_min).astype(np.uint8) * 255, "L")
    body = body.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    rgba = np.array(rgb.convert("RGBA"))
    rgba[:, :, 3] = np.array(body)
    return trim(Image.fromarray(rgba, "RGBA"), 16)


def save(im: Image.Image, name: str) -> Image.Image:
    path = OUT_DIR / f"{name}.png"
    im.save(path, "PNG")
    write_meta(path, UUID[name], *im.size)
    print("wrote", path.name, im.size)
    return im


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    panel = save(cut_panel(SRC["panel-win"]), "panel-win")
    nxt = save(cut_pill(SRC["btn-win-next"], 14, 28), "btn-win-next")
    back = save(cut_pill(SRC["btn-win-back"], 20, 20), "btn-win-back")

    prev = Image.new("RGBA", (540, 960), (48, 52, 64, 255))
    p = panel.copy()
    p.thumbnail((430, 620), Image.LANCZOS)
    prev.alpha_composite(p, dest=(270 - p.size[0] // 2, 80))
    b = back.copy()
    n = nxt.copy()
    b.thumbnail((168, 70), Image.LANCZOS)
    n.thumbnail((168, 70), Image.LANCZOS)
    y = 80 + p.size[1] - 120
    prev.alpha_composite(b, dest=(90, y))
    prev.alpha_composite(n, dest=(282, y))
    prev.convert("RGB").save("/tmp/win-import-preview.png")
    print("preview /tmp/win-import-preview.png")


if __name__ == "__main__":
    main()
