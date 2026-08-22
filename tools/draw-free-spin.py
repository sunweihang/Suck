#!/usr/bin/env python3
"""Free-spin icon: same candy SDF pipeline as item icons. No AI, no soft plate."""

import math
from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui" / "ic-free-spin.png"
UUID = "7e22bb20-007c-4b02-8002-00000000007c"
SIZE = 512

YELLOW = (251, 225, 20)
YELLOW_DEEP = (236, 168, 12)
YELLOW_TOP = (255, 236, 72)
ORANGE = (244, 156, 24)
PURPLE = (173, 99, 239)
CYAN = (86, 214, 246)


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


def tri(x, y, ax, ay, bx, by, cx, cy):
    def cross(px, py, qx, qy):
        return (x - px) * (qy - py) - (y - py) * (qx - px)

    w0 = cross(bx, by, cx, cy)
    w1 = cross(cx, cy, ax, ay)
    w2 = cross(ax, ay, bx, by)
    inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
    if not np.any(inside):
        inside = (w0 <= 0) & (w1 <= 0) & (w2 <= 0)
    d = np.minimum(
        edge_dist(x, y, ax, ay, bx, by),
        np.minimum(edge_dist(x, y, bx, by, cx, cy), edge_dist(x, y, cx, cy, ax, ay)),
    )
    return np.where(inside, -d, d)


def quad(x, y, a, b, c, d):
    return np.minimum(tri(x, y, *a, *b, *c), tri(x, y, *a, *c, *d))


def arrow_head(x, y, tip_x, tip_y, dx, dy, length, width):
    ln = math.hypot(dx, dy) or 1.0
    dx, dy = dx / ln, dy / ln
    px, py = -dy, dx
    cx = tip_x - dx * length * 0.35
    cy = tip_y - dy * length * 0.35
    along = (x - cx) * dx + (y - cy) * dy
    side = (x - cx) * px + (y - cy) * py
    half = width * (0.55 - along / length)
    return np.maximum(np.abs(side) - np.maximum(half, 0), np.maximum(along - length * 0.65, -along - length * 0.35))


def annulus(x, y, cx, cy, r, half):
    return np.abs(np.hypot(x - cx, y - cy) - r) - half


def draw(size: int = SIZE, ss: int = 4) -> Image.Image:
    s = size * ss
    x, y = grid(s)
    cx = cy = s * 0.50
    outline = s * 0.036

    # --- orbit (same grammar as shuffle) ---
    r = s * 0.30
    body = s * 0.052
    ang = np.arctan2(y - cy, x - cx)
    a0, a1 = math.radians(28), math.radians(208)

    def arc(start, half):
        ring = annulus(x, y, cx, cy, r, half)
        span = math.radians(148)
        d = (start - ang) % (2 * math.pi)
        return sdf_a(np.maximum(ring, (d - span) * r))

    def head(at, pad):
        tx = cx + math.cos(at) * r
        ty = cy + math.sin(at) * r
        dx, dy = math.sin(at), -math.cos(at)
        p = arrow_head(x, y, tx, ty, dx, dy, s * 0.17, s * 0.11)
        return sdf_a(p - pad), sdf_a(p)

    ink = np.maximum(arc(a0, body + outline), arc(a1, body + outline))
    fill = np.maximum(arc(a0, body), arc(a1, body))
    h0i, h0 = head(a0, outline * 0.9)
    h1i, h1 = head(a1, outline * 0.9)
    ink = np.maximum(ink, np.maximum(h0i, h1i))
    fill = np.maximum(fill, np.maximum(h0, h1))

    # --- iso cube, sits inside the ring ---
    ox, oy = cx, cy + s * 0.01
    w, h, drop = s * 0.132, s * 0.076, s * 0.128
    T, R, L, B = (ox, oy - h), (ox + w, oy), (ox - w, oy), (ox, oy + h)
    LB, RB, BB = (ox - w, oy + drop), (ox + w, oy + drop), (ox, oy + h + drop)
    top = quad(x, y, T, R, B, L)
    left = quad(x, y, L, B, BB, LB)
    right = quad(x, y, R, B, BB, RB)
    cube = np.minimum(np.minimum(top, left), right)
    cube_ink = sdf_a(cube - outline)

    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = overlay(
        canvas,
        paint(ink, PURPLE),
        paint(fill, CYAN),
        paint(cube_ink, PURPLE),
        paint(sdf_a(left), YELLOW_DEEP),
        paint(sdf_a(right), ORANGE),
        paint(sdf_a(top), YELLOW_TOP),
    )
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    im = draw()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "PNG")
    write_meta(OUT, UUID, SIZE, SIZE)
    print(OUT, im.size, "corner_a", im.getpixel((0, 0))[3], "bbox", im.getbbox())


if __name__ == "__main__":
    main()
