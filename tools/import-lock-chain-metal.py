#!/usr/bin/env python3
"""Cut the steel chain X and write a see-through lock sprite."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/lock-chain-metal-src.png")
WORK = ROOT / "tools/ai-nail"
OUT = ROOT / "assets/resources/ui/lock-chain-metal.png"
PREVIEW = ROOT / "tools/lock-chain-metal-preview.png"
SIZE = 512
UUID = "7e22bb20-0011-4b02-8002-000000000011"


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


def key_black(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    lum = arr[:, :, 0] * 0.3 + arr[:, :, 1] * 0.59 + arr[:, :, 2] * 0.11
    alpha = np.clip((lum - 18.0) / 28.0, 0.0, 1.0)
    alpha = np.where(lum < 14.0, 0.0, alpha)
    arr[:, :, 3] = np.minimum(arr[:, :, 3], alpha * 255.0)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def wipe_center_mark(im: Image.Image) -> Image.Image:
    """Erase the tiny watermark X sitting on the crossing."""
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    h, w = arr.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    nx = (xs - cx) / max(1.0, w * 0.5)
    ny = (ys - cy) / max(1.0, h * 0.5)
    r = np.sqrt(nx * nx + ny * ny)
    # Thin diagonal strokes in the very center are the mark, not the fat links.
    diag = np.minimum(np.abs(nx - ny), np.abs(nx + ny))
    mark = (r < 0.11) & (diag < 0.018) & (arr[:, :, 3] > 20)
    if not np.any(mark):
        return im
    arr[:, :, 3] = np.where(mark, 0.0, arr[:, :, 3])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit(im: Image.Image, size: int = SIZE, margin: float = 0.04) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - 2 * margin))
    scale = min(inner / im.width, inner / im.height)
    w = max(1, round(im.width * scale))
    h = max(1, round(im.height * scale))
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    arr[:, :, :3] *= arr[:, :, 3:4] / 255.0
    scaled = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)
    out = np.array(scaled, dtype=np.float32)
    a = out[:, :, 3:4]
    out[:, :, :3] = np.divide(out[:, :, :3] * 255.0, a, out=np.zeros_like(out[:, :, :3]), where=a > 0)
    resized = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
    canvas.paste(resized, ((size - w) // 2, (size - h) // 2), resized)
    return canvas


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")
    src.save(WORK / "lock-chain-metal-src.png")
    cut = key_black(src)
    cut = wipe_center_mark(cut)
    cut = cut.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=2))
    cut.save(WORK / "lock-chain-metal.rmbg.png")
    out = fit(trim(cut))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    write_meta(OUT, UUID, SIZE, SIZE)
    cream = Image.new("RGBA", (SIZE + 64, SIZE + 64), (255, 236, 210, 255))
    cream.alpha_composite(out, (32, 32))
    cream.convert("RGB").save(PREVIEW, "PNG")
    print("wrote", OUT, out.size, "bbox", out.getbbox())


if __name__ == "__main__":
    main()
