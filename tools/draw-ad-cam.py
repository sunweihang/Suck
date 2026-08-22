#!/usr/bin/env python3
"""Compact candy camera badge for the free-spin corner. 128px, transparent."""

from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui"
NAME = "ic-ad-cam.png"
UUID = "7e22bb20-009c-4b02-8002-00000000009c"
SIZE = 128

CREAM = (255, 248, 236)
PINK = (255, 74, 132)
PINK_DEEP = (214, 36, 96)
INK = (128, 48, 168)
WHITE = (255, 255, 255)


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


def rrect_sdf(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, cr: float) -> np.ndarray:
    qx = np.abs(x - cx) - (hw - cr)
    qy = np.abs(y - cy) - (hh - cr)
    return np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0)) + np.minimum(np.maximum(qx, qy), 0.0) - cr


def paint(alpha: np.ndarray, rgb: Tuple[int, int, int]) -> Image.Image:
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


def draw(size: int = SIZE, ss: int = 6) -> Image.Image:
    s = size * ss
    y, x = np.mgrid[0:s, 0:s]
    x = x.astype(np.float64) + 0.5
    y = y.astype(np.float64) + 0.5
    cx = cy = s * 0.5

    rim = sdf_alpha(circle_sdf(x, y, cx, cy, s * 0.494))
    face = sdf_alpha(circle_sdf(x, y, cx, cy, s * 0.372))
    shade = face * np.clip((y - (cy - s * 0.06)) / (s * 0.58), 0, 1) * 0.28
    gloss = face * sdf_alpha(circle_sdf(x, y, cx - s * 0.14, cy - s * 0.18, s * 0.17)) * 0.50

    # Point-and-shoot: box + circular lens. Reads as a camera at 64px.
    bx, by = cx, cy + s * 0.03
    body = rrect_sdf(x, y, bx, by, s * 0.210, s * 0.132, s * 0.046)
    flash = rrect_sdf(x, y, bx - s * 0.08, by - s * 0.168, s * 0.055, s * 0.038, s * 0.014)
    cam = np.minimum(body, flash)
    outline = s * 0.028
    cam_in = sdf_alpha(cam)
    cam_out = sdf_alpha(cam - outline)
    lx, ly, lr = bx + s * 0.02, by, s * 0.078
    lens_ring = sdf_alpha(np.abs(circle_sdf(x, y, lx, ly, lr)) - s * 0.018) * cam_in
    lens_hole = sdf_alpha(circle_sdf(x, y, lx, ly, lr - s * 0.022)) * cam_in
    spark = sdf_alpha(circle_sdf(x, y, lx - s * 0.028, ly - s * 0.028, s * 0.016)) * lens_hole

    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = composite(
        canvas,
        paint(rim, CREAM),
        paint(face, PINK),
        paint(shade, PINK_DEEP),
        paint(gloss, WHITE),
        paint(cam_out, INK),
        paint(cam_in, CREAM),
        paint(lens_ring, INK),
        paint(lens_hole, (88, 32, 120)),
        paint(spark, WHITE),
    )
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / NAME
    im = draw()
    im.save(path, "PNG")
    write_meta(path, UUID, SIZE, SIZE)
    print("drew", path.name, im.size, "bbox", im.getbbox())


if __name__ == "__main__":
    main()
