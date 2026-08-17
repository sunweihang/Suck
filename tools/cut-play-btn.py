#!/usr/bin/env python3
"""Chroma-cut the AI home play button and write btn-play.png."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tools/ai-play"
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/btn-play-glass-src.png")
OUT = ROOT / "assets/resources/ui/btn-play.png"
UUID = "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e16"
MAX_W = 1100
PAD = 10


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


def chroma_cut(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    magenta = (r > 200) & (b > 200) & (g < 80)
    near = (np.abs(r - 255) < 40) & (np.abs(b - 255) < 40) & (g < 120)
    alpha = np.where(magenta | near, 0.0, 255.0)
    pink = (r > 180) & (b > 140) & (g < 140) & ((r + b) * 0.5 - g > 70)
    alpha[pink] = 0.0
    arr[:, :, 3] = alpha
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def stadium_mask(w: int, h: int, ss: int = 8) -> Image.Image:
    mw, mh = w * ss, h * ss
    m = Image.new("L", (mw, mh), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, mw - 1, mh - 1), radius=mh // 2, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def fit_box(alpha):
    solid = alpha > 180
    ys = np.flatnonzero(np.any(solid, axis=1))
    xs = np.flatnonzero(np.any(solid, axis=0))
    if ys.size == 0 or xs.size == 0:
        raise RuntimeError("no opaque pixels")
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    src = chroma_cut(Image.open(SRC))
    src.save(WORK / "btn-play-glass.chroma.png")
    x0, y0, x1, y1 = fit_box(np.array(src.split()[3]))
    crop = src.crop((x0, y0, x1, y1))
    pw, ph = crop.size[0] + PAD * 2, crop.size[1] + PAD * 2
    canvas = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    canvas.paste(crop, (PAD, PAD))
    mask = Image.new("L", (pw, ph), 0)
    mask.paste(stadium_mask(crop.size[0], crop.size[1]), (PAD, PAD))
    mask = mask.filter(ImageFilter.MinFilter(3))
    canvas.putalpha(mask)
    if canvas.width > MAX_W:
        h = max(1, round(canvas.height * MAX_W / canvas.width))
        canvas = canvas.resize((MAX_W, h), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "PNG")
    write_meta(OUT, UUID, *canvas.size)
    preview = Image.new("RGBA", (1080, 420), (244, 236, 220, 255))
    shown = canvas.copy()
    shown.thumbnail((920, 280), Image.LANCZOS)
    preview.alpha_composite(shown, dest=((1080 - shown.size[0]) // 2, (420 - shown.size[1]) // 2))
    preview.convert("RGB").save(WORK / "btn-play-preview.png")
    print("wrote", OUT, canvas.size)


if __name__ == "__main__":
    main()
