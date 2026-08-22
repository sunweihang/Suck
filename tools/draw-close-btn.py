#!/usr/bin/env python3
"""Candy close button: supersampled SDF, no AI, no flood-cut fringe."""

from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui" / "btn-close.png"
UUID = "7e22bb20-0065-4b02-8002-000000000065"
SIZE = 256

PINK = (255, 118, 158)
PINK_DEEP = (226, 68, 114)
OUTLINE = (74, 62, 128)
WHITE = (255, 255, 255)
HI = (255, 236, 244)


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
    "redirect": "{uuid}@6c48a",
    "maxWidth": {w},
    "maxHeight": {h},
    "compressSettings": {{
      "useCompressTexture": false,
      "presetId": "webUi"
    }}
  }}
}}
""",
        encoding="utf-8",
    )


def sdf_a(sdf: np.ndarray) -> np.ndarray:
    return np.clip(0.5 - sdf, 0.0, 1.0)


def paint(alpha: np.ndarray, rgb: Tuple[int, int, int]) -> Image.Image:
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    im = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    im[:, :, 0] = rgb[0]
    im[:, :, 1] = rgb[1]
    im[:, :, 2] = rgb[2]
    im[:, :, 3] = a
    return Image.fromarray(im, "RGBA")


def overlay(base: Image.Image, *layers: Image.Image) -> Image.Image:
    out = base
    for layer in layers:
        out = Image.alpha_composite(out, layer)
    return out


def grid(s: int):
    y, x = np.mgrid[0:s, 0:s]
    return x.astype(np.float64) + 0.5, y.astype(np.float64) + 0.5


def edge_dist(x, y, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    ln2 = vx * vx + vy * vy or 1.0
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / ln2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def draw(size: int = SIZE, ss: int = 5) -> Image.Image:
    s = size * ss
    x, y = grid(s)
    cx = cy = s * 0.50
    r_out = s * 0.40
    ring = s * 0.046
    r_face = r_out - ring

    disk = np.hypot(x - cx, y - cy)
    ink = sdf_a(disk - r_out)
    body = sdf_a(disk - r_face)
    t = np.clip((y - (cy - r_face)) / max(r_face * 2.0, 1.0), 0.0, 1.0)
    deep = paint(body * np.clip((t - 0.42) / 0.58, 0.0, 1.0) ** 1.35, PINK_DEEP)
    hi_r = r_face * 0.36
    hi = sdf_a(np.hypot(x - (cx - r_face * 0.20), y - (cy - r_face * 0.26)) - hi_r) * body

    arm = s * 0.148
    xr = s * 0.034
    xo = s * 0.018
    c1 = edge_dist(x, y, cx - arm, cy - arm, cx + arm, cy + arm)
    c2 = edge_dist(x, y, cx - arm, cy + arm, cx + arm, cy - arm)
    cross = np.minimum(c1, c2)
    x_ink = sdf_a(cross - (xr + xo)) * body
    x_fill = sdf_a(cross - xr) * body

    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = overlay(
        canvas,
        paint(ink, OUTLINE),
        paint(body, PINK),
        deep,
        paint(hi * 0.42, HI),
        paint(x_ink, OUTLINE),
        paint(x_fill, WHITE),
    )
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    im = draw()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "PNG")
    write_meta(OUT, UUID, SIZE, SIZE)
    print(OUT.name, im.size, "bbox", im.getbbox(), "corner_a", im.getpixel((0, 0))[3])


if __name__ == "__main__":
    main()
