#!/usr/bin/env python3
"""Scale original AI button images only. No recut, no stadium, no erode."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WIDTH = 800
JOBS = (
    (
        Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/btn-win-action-ai-src.png"),
        OUT_DIR / "btn-win-action.png",
    ),
    (
        Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/btn-win-double-ai-src.png"),
        OUT_DIR / "btn-win-double.png",
    ),
)


def scale_original(src: Path, dest: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    h = max(1, round(im.height * WIDTH / im.width))
    im = im.resize((WIDTH, h), Image.LANCZOS)
    arr = np.array(im)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    key = (r > 230) & (b > 230) & (g < 70)
    a = np.where(key, 0, a)
    arr[:, :, 3] = a
    out = Image.fromarray(arr, "RGBA")
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "PNG")
    print("scaled", dest.name, out.size)
    return out


def main() -> None:
    for src, dest in JOBS:
        if not src.exists():
            raise FileNotFoundError(src)
        scale_original(src, dest)


if __name__ == "__main__":
    main()
