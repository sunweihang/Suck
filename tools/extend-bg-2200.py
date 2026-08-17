#!/usr/bin/env python3
"""Rebuild play/home backdrops as 1080x2200. Keep the original 1920 centered; outpaint top/bottom."""

from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "assets/resources/ui"
TARGET_W, TARGET_H = 1080, 2200
SRC_H = 1920


def _smear(src: Image.Image, extra: int, side: str) -> Image.Image:
    w, h = src.size
    band = min(96, h // 5)
    if side == "top":
        strip = src.crop((0, 0, w, band))
    else:
        strip = src.crop((0, h - band, w, h))
    strip = strip.transpose(Image.FLIP_TOP_BOTTOM)
    stretched = strip.resize((w, extra), Image.LANCZOS)
    fade = ImageEnhance.Color(stretched).enhance(0.92)
    fade = fade.filter(ImageFilter.GaussianBlur(radius=1.6))
    return fade


def _grain(im: Image.Image, amount: float = 6.0) -> None:
    rng = random.Random(2200)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if rng.random() > 0.18:
                continue
            r, g, b = px[x, y]
            n = rng.uniform(-amount, amount)
            px[x, y] = (
                max(0, min(255, int(r + n))),
                max(0, min(255, int(g + n))),
                max(0, min(255, int(b + n))),
            )


def _sparkles(im: Image.Image, count: int, seed: int) -> None:
    rng = random.Random(seed)
    draw = ImageDraw.Draw(im)
    w, h = im.size
    for _ in range(count):
        x = rng.randint(40, w - 40)
        y = rng.randint(8, h - 8)
        arm = rng.choice((3, 4, 5, 7))
        col = (255, 255, 255)
        draw.line((x - arm, y, x + arm, y), fill=col, width=1)
        draw.line((x, y - arm, x, y + arm), fill=col, width=1)
        if arm >= 5:
            d = max(2, arm // 2)
            draw.line((x - d, y - d, x + d, y + d), fill=col, width=1)
            draw.line((x - d, y + d, x + d, y - d), fill=col, width=1)
        if rng.random() < 0.45:
            rr = rng.randint(2, 5)
            draw.ellipse((x - rr, y - rr, x + rr, y + rr), outline=(255, 255, 255))


def _dots(im: Image.Image, count: int, seed: int) -> None:
    rng = random.Random(seed)
    draw = ImageDraw.Draw(im)
    w, h = im.size
    for _ in range(count):
        x = rng.randint(10, w - 10)
        y = rng.randint(4, h - 4)
        r = rng.choice((1, 1, 2, 2, 3))
        a = rng.randint(90, 180)
        col = (255, 255, 255)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=col)


def extend_to_2200(src: Image.Image, sparkle_seed: int) -> Image.Image:
    src = src.convert("RGB")
    if src.size != (TARGET_W, SRC_H):
        src = src.resize((TARGET_W, SRC_H), Image.LANCZOS)
    extra = TARGET_H - SRC_H
    top_h = extra // 2
    bot_h = extra - top_h
    canvas = Image.new("RGB", (TARGET_W, TARGET_H))
    top = _smear(src, top_h, "top")
    bot = _smear(src, bot_h, "bottom")
    _grain(top, 5.0)
    _grain(bot, 5.0)
    _sparkles(top, 7, sparkle_seed)
    _sparkles(bot, 6, sparkle_seed + 17)
    _dots(top, 18, sparkle_seed + 3)
    _dots(bot, 16, sparkle_seed + 9)
    canvas.paste(top, (0, 0))
    canvas.paste(src, (0, top_h))
    canvas.paste(bot, (0, top_h + SRC_H))
    # Soft-stitch the seams so the smear does not look like a hard cut.
    seam = 18
    for i in range(seam):
        t = (i + 1) / (seam + 1)
        y0 = top_h - seam + i
        y1 = top_h + SRC_H + i
        row_a = canvas.crop((0, y0, TARGET_W, y0 + 1))
        row_b = src.crop((0, 0, TARGET_W, 1))
        canvas.paste(Image.blend(row_a, row_b, t), (0, y0))
        row_c = src.crop((0, SRC_H - 1, TARGET_W, SRC_H))
        row_d = canvas.crop((0, y1, TARGET_W, y1 + 1))
        canvas.paste(Image.blend(row_c, row_d, t), (0, y1))
    return canvas


def patch_meta(meta_path: Path, w: int, h: int) -> None:
    data = json.loads(meta_path.read_text(encoding="utf-8"))
    hw, hh = w / 2.0, h / 2.0
    frame = data.get("subMetas", {}).get("f9941", {}).get("userData")
    if frame:
        frame["width"] = w
        frame["height"] = h
        frame["rawWidth"] = w
        frame["rawHeight"] = h
        frame["trimX"] = 0
        frame["trimY"] = 0
        verts = frame.get("vertices") or {}
        verts["rawPosition"] = [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0]
        verts["uv"] = [0, h, w, h, 0, 0, w, 0]
        verts["minPos"] = [-hw, -hh, 0]
        verts["maxPos"] = [hw, hh, 0]
        frame["vertices"] = verts
    user = data.setdefault("userData", {})
    user["maxWidth"] = w
    user["maxHeight"] = h
    meta_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jpg(src_path: Path, seed: int) -> None:
    src = Image.open(src_path)
    out = extend_to_2200(src, seed)
    out.save(src_path, "JPEG", quality=92, optimize=True)
    meta = src_path.with_suffix(".jpg.meta")
    if meta.exists():
        patch_meta(meta, TARGET_W, TARGET_H)
    print(f"wrote {src_path} {out.size}")


def main() -> None:
    write_jpg(UI / "bg-play-q.jpg", 11)
    write_jpg(UI / "bg-home.jpg", 29)


if __name__ == "__main__":
    main()
