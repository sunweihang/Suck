#!/usr/bin/env python3
"""Install desktop item icons: keep the authored outline, fill the cell."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = Path("/Users/sunix/Desktop/ICON")
OUT_DIR = ROOT / "assets/resources/ui"
SIZE = 512
MARGIN = 0.04

ITEMS = (
    "ic-item-shuffle.png",
    "ic-item-merge.png",
    "ic-item-hook.png",
    "ic-item-shovel.png",
)


def trim(im: Image.Image, pad: int = 4) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit(im: Image.Image, size: int = SIZE, margin: float = MARGIN) -> Image.Image:
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
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in ITEMS:
        src = SRC_DIR / name
        dest = OUT_DIR / name
        out = fit(trim(Image.open(src)))
        out.save(dest, "PNG")
        print(name, out.size, "bbox", out.getbbox())


if __name__ == "__main__":
    main()
