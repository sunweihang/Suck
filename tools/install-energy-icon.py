"""Cut the 3D stamina heart off a dark plate and publish ui-energy-icon.png."""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tools" / "ai-item" / "energy-heart-studio.png"
OUT = ROOT / "assets" / "resources" / "ui" / "ui-energy-icon.png"
SIZE = 256
PAD = 18


def knockout(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = rgb.mean(axis=2)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    heart = (r > 90) & (r >= g + 8) & (r >= b + 8) & (sat > 0.14)
    dark = (lum < 42) & (sat < 0.22)
    bg = np.zeros((h, w), dtype=bool)
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        q.append((0, x))
        q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0))
        q.append((y, w - 1))
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x]:
            continue
        seen[y, x] = True
        if heart[y, x] or not dark[y, x]:
            continue
        bg[y, x] = True
        q.append((y + 1, x))
        q.append((y - 1, x))
        q.append((y, x + 1))
        q.append((y, x - 1))
    alpha = np.where(bg, 0.0, 255.0)
    fringe = dark & (~bg) & (~heart)
    fade = np.clip((42.0 - lum) / 42.0, 0.0, 1.0)
    alpha = np.where(fringe, alpha * (1.0 - fade), alpha)
    leftover = (~bg) & (~heart) & (lum < 28)
    alpha = np.where(leftover, 0.0, alpha)
    return np.clip(alpha, 0, 255).astype(np.uint8)


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


def crop_pad(arr: np.ndarray, pad: int) -> np.ndarray:
    ys, xs = np.where(arr[:, :, 3] > 8)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    cut = arr[y0:y1, x0:x1]
    canvas = np.zeros((cut.shape[0] + pad * 2, cut.shape[1] + pad * 2, 4), dtype=np.uint8)
    canvas[pad : pad + cut.shape[0], pad : pad + cut.shape[1]] = cut
    return canvas


def fit_square(arr: np.ndarray, size: int) -> np.ndarray:
    im = Image.fromarray(arr, "RGBA")
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return np.array(canvas)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    im = Image.open(SRC).convert("RGBA")
    arr = np.array(im)
    arr[:, :, 3] = knockout(arr[:, :, :3].astype(np.float32))
    arr = crop_pad(arr, PAD)
    arr = fit_square(arr, SIZE)
    out = defringe(Image.fromarray(arr, "RGBA"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    print("wrote", OUT, out.size, "bbox", out.getbbox(), "alpha0", int((np.array(out)[:, :, 3] == 0).sum()))


if __name__ == "__main__":
    main()
