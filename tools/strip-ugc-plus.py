#!/usr/bin/env python3
"""Remove the orange plus badge from ui/btn-ugc.png and refresh library."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "assets" / "resources" / "ui" / "btn-ugc.png"
UUID = "7e22bb20-0088-4b02-8002-000000000088"
LIB = Path(__file__).resolve().parents[1] / "library" / "7e" / f"{UUID}.png"


def dilate(mask: np.ndarray, rad: int) -> np.ndarray:
    out = mask.copy()
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            if dx * dx + dy * dy > rad * rad:
                continue
            shifted = np.zeros_like(mask)
            ys = slice(max(0, dy), mask.shape[0] + min(0, dy))
            xs = slice(max(0, dx), mask.shape[1] + min(0, dx))
            sy = slice(max(0, -dy), mask.shape[0] - max(0, dy))
            sx = slice(max(0, -dx), mask.shape[1] - max(0, dx))
            shifted[ys, xs] = mask[sy, sx]
            out |= shifted
    return out


def main() -> None:
    a = np.array(Image.open(OUT).convert("RGBA")).astype(np.float32)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    mx = a[:, :, :3].max(axis=2)
    mn = a[:, :, :3].min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    orange = (r > 160) & (g > 35) & (g < 200) & (b < 90) & (al > 60)
    near = dilate(orange, 10)
    whiteish = (sat < 0.28) & (r > 190) & (g > 190) & (b > 190) & (al > 40)
    cyan = (b > r + 15) & (b > g)
    lime = (g > r + 15) & (g > b + 10)
    mask = near & (orange | whiteish) & (~cyan) & (~lime)
    print("mask", int(mask.sum()))

    out = a.copy()
    hole = mask.copy()
    for _ in range(36):
        pad = np.pad(out, ((1, 1), (1, 1), (0, 0)), mode="edge")
        mpad = np.pad(hole, ((1, 1), (1, 1)), mode="edge")
        acc = np.zeros_like(out)
        wsum = np.zeros(hole.shape, dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            srcp = pad[1 + dy : 1 + dy + hole.shape[0], 1 + dx : 1 + dx + hole.shape[1]]
            srcm = mpad[1 + dy : 1 + dy + hole.shape[0], 1 + dx : 1 + dx + hole.shape[1]]
            valid = (~srcm) & (srcp[:, :, 3] > 20)
            acc += np.where(valid[:, :, None], srcp, 0)
            wsum += valid.astype(np.float32)
        fill = hole & (wsum > 0)
        if not fill.any():
            break
        out[fill] = acc[fill] / wsum[fill][:, None]
        hole[fill] = False
    print("left", int(hole.sum()))

    res = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
    blur = res.filter(ImageFilter.GaussianBlur(0.7))
    ba = np.array(blur)
    ra = np.array(res)
    edge = dilate(mask, 1) & (~mask)
    ra[edge] = ba[edge]
    Image.fromarray(ra, "RGBA").save(OUT)
    LIB.write_bytes(OUT.read_bytes())
    print("wrote", OUT, "and", LIB)


if __name__ == "__main__":
    main()
