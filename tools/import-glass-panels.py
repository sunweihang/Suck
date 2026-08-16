#!/usr/bin/env python3
"""Install portal-cut glass cards as panel-win / panel-fail sprites."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
DESK = Path("/Users/sunix/Desktop/胜利失败")

SRC = {
    "panel-win": WORK / "glass-win.cut.png",
    "panel-fail": WORK / "glass-fail.cut.png",
}
UUID = {
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "panel-fail": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e31",
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
    "fixAlphaTransparencyArtifacts": true,
    "hasAlpha": true,
    "redirect": "{uuid}@6c48a"
  }}
}}
""",
        encoding="utf-8",
    )


def rr_mask(w: int, h: int, radius: int, inset: int) -> Image.Image:
    ss = 8
    big = Image.new("L", (w * ss, h * ss), 0)
    x0 = inset * ss
    y0 = inset * ss
    x1 = w * ss - 1 - inset * ss
    y1 = h * ss - 1 - inset * ss
    ImageDraw.Draw(big).rounded_rectangle(
        (x0, y0, x1, y1), radius=max(8, radius) * ss, fill=255
    )
    return big.resize((w, h), Image.LANCZOS)


def bleed_interior(im: Image.Image, steps: int = 4) -> Image.Image:
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    known = arr[:, :, 3] > 200
    for _ in range(steps):
        nxt = rgb.copy()
        nxt_k = known.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
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
            take = (~known) & src_k
            nxt[take] = src_c[take]
            nxt_k[take] = True
        rgb, known = nxt, nxt_k
    arr[:, :, :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def polish(src: Path) -> Image.Image:
    """Keep the purple glass stroke, drop the leftover scene ring."""
    card = Image.open(src).convert("RGBA")
    w, h = card.size
    # leftover scene is ~4px; purple stroke sits around 5px
    inset = 6
    radius = int(min(w, h) * 0.17) - inset
    mask = rr_mask(w, h, radius, inset)
    out = card.copy()
    out.putalpha(mask)
    # paint AA fringe with the purple stroke so leftover scene cannot show through
    arr = np.array(out)
    a = arr[:, :, 3]
    fringe = (a > 0) & (a < 250)
    arr[fringe, 0] = 150
    arr[fringe, 1] = 128
    arr[fringe, 2] = 230
    out = Image.fromarray(arr, "RGBA")
    box = out.getbbox()
    if box:
        out = out.crop(box)
    return bleed_interior(out)


def main() -> None:
    for name, src in SRC.items():
        im = polish(src)
        out = OUT / f"{name}.png"
        im.save(out, "PNG")
        write_meta(out, UUID[name], *im.size)
        kind = "win" if "win" in name else "fail"
        desk = DESK / (f"{'胜利' if kind == 'win' else '失败'}-玻璃.png")
        im.save(desk, "PNG")
        print("wrote", out.name, im.size)


if __name__ == "__main__":
    main()
