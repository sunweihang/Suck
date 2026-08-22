#!/usr/bin/env python3
"""Glossy circular stamina gem — same cell as ui-gold-icon."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui/ui-energy-icon.png"
UUID = "7e22bb20-00f4-4b02-8002-0000000000f4"
SIZE = 256


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
    "maxWidth": 512,
    "maxHeight": 512,
    "compressSettings": {{
      "useCompressTexture": false,
      "presetId": "webUi"
    }}
  }}
}}
""",
        encoding="utf-8",
    )


def sdf_alpha(sdf: np.ndarray) -> np.ndarray:
    return np.clip(0.5 - sdf, 0.0, 1.0)


def circle_sdf(x: np.ndarray, y: np.ndarray, cx: float, cy: float, r: float) -> np.ndarray:
    return np.hypot(x - cx, y - cy) - r


def bolt_mask(x: np.ndarray, y: np.ndarray, cx: float, cy: float, s: float) -> np.ndarray:
    px = (x - cx) / s
    py = (y - cy) / s
    # Zigzag lightning in local -1..1, y down.
    # Three parallelograms: top slash, middle slash, bottom slash.
    def band(ax: float, ay: float, bx: float, by: float, half: float) -> np.ndarray:
        dx, dy = bx - ax, by - ay
        ln = np.hypot(dx, dy) or 1.0
        ux, uy = dx / ln, dy / ln
        pxn = -uy
        pyn = ux
        tx = (px - ax) * ux + (py - ay) * uy
        ty = (px - ax) * pxn + (py - ay) * pyn
        along = np.maximum(tx - ln, -tx)
        return np.maximum(along, np.abs(ty) - half)

    top = band(-0.06, -0.42, 0.20, -0.04, 0.13)
    mid = band(0.20, -0.04, -0.22, 0.06, 0.12)
    bot = band(-0.22, 0.06, 0.10, 0.46, 0.13)
    body = np.minimum(np.minimum(top, mid), bot)
    return sdf_alpha(body * s)


def draw(size: int = SIZE, ss: int = 6) -> Image.Image:
    s = size * ss
    y, x = np.mgrid[0:s, 0:s]
    x = x.astype(np.float64) + 0.5
    y = y.astype(np.float64) + 0.5
    cx = cy = s * 0.5
    r = s * 0.42
    coin = sdf_alpha(circle_sdf(x, y, cx, cy, r))
    rim = sdf_alpha(np.abs(circle_sdf(x, y, cx, cy, r * 0.78)) - s * 0.034) * coin

    t = np.clip((y - (cy - r)) / (2 * r), 0, 1)
    top = np.array([255.0, 118.0, 168.0])
    bot = np.array([214.0, 36.0, 88.0])
    rgb = np.zeros((s, s, 4), dtype=np.uint8)
    for i in range(3):
        rgb[:, :, i] = (top[i] * (1 - t) + bot[i] * t).astype(np.uint8)
    rgb[:, :, 3] = (coin * 255).astype(np.uint8)
    base = Image.fromarray(rgb, "RGBA")

    rim_im = np.zeros((s, s, 4), dtype=np.uint8)
    rim_im[:, :, 0] = 255
    rim_im[:, :, 1] = 186
    rim_im[:, :, 2] = 206
    rim_im[:, :, 3] = (rim * 255).astype(np.uint8)

    gloss = coin * sdf_alpha(circle_sdf(x, y, cx - s * 0.08, cy - s * 0.13, r * 0.40)) * 0.36
    gloss_im = np.zeros((s, s, 4), dtype=np.uint8)
    gloss_im[:, :, :3] = 255
    gloss_im[:, :, 3] = (gloss * 255).astype(np.uint8)

    bolt = bolt_mask(x, y, cx, cy + s * 0.01, r * 0.92)
    bolt *= coin
    outline = sdf_alpha(circle_sdf(x, y, cx, cy, r) + s * 0.0)  # keep inside
    bolt_edge = np.clip(sdf_alpha(-(0.5 - bolt) + 0.18) - bolt, 0, 1) * coin
    bolt_im = np.zeros((s, s, 4), dtype=np.uint8)
    bolt_im[:, :, 0] = 255
    bolt_im[:, :, 1] = 244
    bolt_im[:, :, 2] = 210
    bolt_im[:, :, 3] = (bolt * 255).astype(np.uint8)
    edge_im = np.zeros((s, s, 4), dtype=np.uint8)
    edge_im[:, :, 0] = 168
    edge_im[:, :, 1] = 40
    edge_im[:, :, 2] = 72
    edge_im[:, :, 3] = (bolt_edge * 220).astype(np.uint8)

    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas = Image.alpha_composite(canvas, base)
    canvas = Image.alpha_composite(canvas, Image.fromarray(rim_im, "RGBA"))
    canvas = Image.alpha_composite(canvas, Image.fromarray(edge_im, "RGBA"))
    canvas = Image.alpha_composite(canvas, Image.fromarray(bolt_im, "RGBA"))
    canvas = Image.alpha_composite(canvas, Image.fromarray(gloss_im, "RGBA"))
    del outline
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    # Authored 3D heart lives in tools/install-energy-icon.py. Only refresh meta here.
    if OUT.exists():
        write_meta(OUT, UUID, SIZE, SIZE)
        print("kept", OUT, "meta", UUID)
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im = draw()
    im.save(OUT, "PNG")
    write_meta(OUT, UUID, im.size[0], im.size[1])
    print("drew", OUT, im.size, "bbox", im.getbbox())


if __name__ == "__main__":
    main()
