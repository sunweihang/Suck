#!/usr/bin/env python3
"""Gold rim glow for bricks that are holding a trapped octopus."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui/lock-hold-glow.png"
PREVIEW = ROOT / "tools/lock-hold-glow-preview.png"
SIZE = 256
UUID = "7e22bb20-0010-4b02-8002-000000000010"


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


def paint() -> Image.Image:
    n = SIZE
    ys, xs = np.mgrid[0:n, 0:n]
    nx = (xs - (n - 1) * 0.5) / ((n - 1) * 0.5)
    # One inner edge only: a soft gold bar near the top of the sprite.
    y = ys / (n - 1)
    core = np.exp(-(((y - 0.045) / 0.042) ** 2))
    halo = np.exp(-(((y - 0.045) / 0.10) ** 2)) * 0.55
    span = np.clip(1.0 - (np.abs(nx) / 0.92) ** 8, 0.0, 1.0)
    alpha = np.clip((core + halo) * span, 0.0, 1.0)
    gold = np.zeros((n, n, 4), dtype=np.float32)
    gold[:, :, 0] = 255.0
    gold[:, :, 1] = 228.0 + 20.0 * core
    gold[:, :, 2] = 110.0 + 70.0 * core
    gold[:, :, 3] = alpha * 255.0
    img = Image.fromarray(np.clip(gold, 0, 255).astype(np.uint8), "RGBA")
    return img.filter(ImageFilter.GaussianBlur(0.6))


def main() -> None:
    glow = paint()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    glow.save(OUT, "PNG")
    write_meta(OUT, UUID, SIZE, SIZE)
    brick = Image.new("RGBA", (SIZE + 48, SIZE + 48), (255, 92, 168, 255))
    brick.alpha_composite(glow, (24, 24))
    brick.convert("RGB").save(PREVIEW, "PNG")
    arr = np.array(glow)
    mid = arr[SIZE // 2, SIZE // 2, 3]
    print("wrote", OUT, glow.size, "bbox", glow.getbbox(), "center_a", int(mid))


if __name__ == "__main__":
    main()
