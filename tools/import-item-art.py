#!/usr/bin/env python3
"""Install desktop item icons. Keep the authored outline; only lift the dark matte."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = Path("/Users/sunix/Desktop/ICON")
OUT_DIR = ROOT / "assets/resources/ui"

ITEMS = (
    "ic-item-shuffle.png",
    "ic-item-merge.png",
    "ic-item-hook.png",
    "ic-item-shovel.png",
)


def defringe(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA"))
    color = arr[:, :, :3].copy()
    alpha = arr[:, :, 3]
    solid = alpha >= 248
    filled = solid.copy()
    for _ in range(10):
        src = color.copy()
        mask = filled.copy()
        grew = False
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            rolled = np.roll(np.roll(src, dy, 0), dx, 1)
            near = np.roll(np.roll(mask, dy, 0), dx, 1)
            take = (~filled) & near
            if not take.any():
                continue
            color[take] = rolled[take]
            filled[take] = True
            grew = True
        if not grew:
            break
    fringe = (alpha > 8) & (alpha < 248)
    arr[:, :, :3][fringe] = color[fringe]
    arr[:, :, 3] = np.where(alpha < 8, 0, alpha)
    return Image.fromarray(arr, "RGBA")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in ITEMS:
        src = SRC_DIR / name
        dest = OUT_DIR / name
        if not src.exists():
            raise SystemExit(f"missing {src}")
        out = defringe(Image.open(src))
        out.save(dest, "PNG")
        print(name, out.size, "bbox", out.getbbox())


if __name__ == "__main__":
    main()
