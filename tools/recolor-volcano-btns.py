#!/usr/bin/env python3
"""Hue-shift volcano chrome into cyan (home) and pink (skip)."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets/resources/ui/btn-win-action.png"
OUT = ROOT / "assets/resources/ui"

JOBS = (
    ("btn-win-home.png", "7e22bb20-00a0-4b02-8002-0000000000a0", 78),
    ("btn-win-skip.png", "7e22bb20-00a1-4b02-8002-0000000000a1", 212),
)


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


def hue_shift(im: Image.Image, degrees: float) -> Image.Image:
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
    rgb = arr[:, :, :3] / 255.0
    alpha = arr[:, :, 3]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    diff = mx - mn
    h = np.zeros_like(mx)
    mask_r = (mx == rgb[:, :, 0]) & (diff > 1e-6)
    mask_g = (mx == rgb[:, :, 1]) & (diff > 1e-6) & ~mask_r
    mask_b = (mx == rgb[:, :, 2]) & (diff > 1e-6) & ~mask_r & ~mask_g
    h[mask_r] = ((rgb[:, :, 1] - rgb[:, :, 2])[mask_r] / diff[mask_r]) % 6
    h[mask_g] = ((rgb[:, :, 2] - rgb[:, :, 0])[mask_g] / diff[mask_g]) + 2
    h[mask_b] = ((rgb[:, :, 0] - rgb[:, :, 1])[mask_b] / diff[mask_b]) + 4
    h = h / 6.0
    s = np.where(mx > 1e-6, diff / np.maximum(mx, 1e-6), 0)
    v = mx
    h = (h + degrees / 360.0) % 1.0
    s = np.clip(s * 1.04, 0, 1)
    i = np.floor(h * 6).astype(np.int32)
    f = h * 6 - i
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    i = i % 6
    out = np.zeros_like(rgb)
    choices = (
        (v, t, p),
        (q, v, p),
        (p, v, t),
        (p, q, v),
        (t, p, v),
        (v, p, q),
    )
    for idx, (r, g, b) in enumerate(choices):
        sel = i == idx
        out[:, :, 0][sel] = r[sel]
        out[:, :, 1][sel] = g[sel]
        out[:, :, 2][sel] = b[sel]
    rgba = np.zeros(arr.shape, dtype=np.uint8)
    rgba[:, :, :3] = np.clip(out * 255, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = alpha.astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    for name, uuid, deg in JOBS:
        dest = OUT / name
        im = hue_shift(src, deg)
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "PNG")
        write_meta(dest, uuid, im.size[0], im.size[1])
        print("wrote", dest.name, im.size, "deg", deg)


if __name__ == "__main__":
    main()
