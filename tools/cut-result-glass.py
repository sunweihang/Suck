#!/usr/bin/env python3
"""Portal RMBG-2.0: keep only the middle glass card from win/fail screens."""

import importlib.util
import os
import shutil
from pathlib import Path

import numpy as np
from collections import deque
from typing import Tuple

from PIL import Image, ImageDraw, ImageFilter

os.environ.setdefault("RMBG_PORTAL_URL", "http://10.1.4.130:8080")
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tools/ai-result"
DESK = Path("/Users/sunix/Desktop/胜利失败")
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
BLUE = (12, 70, 136)

SRC = {
    "win": DESK / "胜利.png",
    "fail": DESK / "失败.png",
}


def load_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def portal_mask(src: Path) -> Image.Image:
    Client = load_client()

    class Sharp(Client):
        @staticmethod
        def _build_prompt(image_name: str) -> dict:
            prompt = Client._build_prompt(image_name)
            prompt["13"]["inputs"]["process_res"] = 2048
            prompt["13"]["inputs"]["mask_blur"] = 0
            prompt["13"]["inputs"]["mask_offset"] = 0
            prompt["13"]["inputs"]["refine_foreground"] = True
            return prompt

    last = None
    for base in PORTALS:
        if not base:
            continue
        print("portal rmbg", base, src.name, flush=True)
        try:
            return Sharp(base=base).remove_background(src)
        except Exception as err:
            last = err
            print("  fail", base, err, flush=True)
    raise RuntimeError(f"portal rmbg failed: {last}")


def hole_mask(body: Image.Image) -> Image.Image:
    empty = body.point(lambda p: 0 if p else 255)
    rgb = Image.merge("RGB", (empty, empty, empty))
    for pt in ((0, 0), (body.size[0] - 1, 0), (0, body.size[1] - 1), (body.size[0] - 1, body.size[1] - 1)):
        ImageDraw.floodfill(rgb, pt, (0, 0, 0))
    return rgb.split()[0]


def fill_alpha_holes(alpha: Image.Image) -> Image.Image:
    a = np.array(alpha)
    body = Image.fromarray(np.where(a > 80, 255, 0).astype(np.uint8), "L")
    holes = hole_mask(body)
    if holes.getbbox():
        ha = np.array(holes)
        a = np.where(ha > 0, np.maximum(a, 255), a)
    return Image.fromarray(a.astype(np.uint8), "L")


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    return im.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(im.size[0], x1 + pad),
        min(im.size[1], y1 + pad),
    ))


def bleed_rgb(im: Image.Image, steps: int = 6) -> Image.Image:
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    known = arr[:, :, 3] > 16
    for _ in range(steps):
        nxt = rgb.copy()
        nxt_k = known.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            src_k = np.roll(np.roll(known, dy, 0), dx, 1)
            src_c = np.roll(np.roll(rgb, dy, 0), dx, 1)
            if dy < 0:
                src_k[dy:, :] = False
            elif dy > 0:
                src_k[:dy, :] = False
            if dx < 0:
                src_k[:, dx:] = False
            elif dx > 0:
                src_k[:, :dx] = False
            take = (~known) & src_k
            nxt[take] = src_c[take]
            nxt_k[take] = True
        rgb, known = nxt, nxt_k
    arr[:, :, :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def detect_card(im: Image.Image) -> Tuple[int, int, int, int]:
    """Flood the pale glass body from the center; return padded bbox."""
    arr = np.array(im.convert("RGB"))
    h, w = arr.shape[:2]
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    vis = np.zeros((h, w), dtype=bool)
    q = deque()
    cx, cy = w // 2, h // 2
    for dx, dy in ((0, 0), (0, -80), (0, 80), (-80, 0), (80, 0), (0, -160), (0, 160)):
        q.append((cx + dx, cy + dy))
    n = 0
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or vis[y, x]:
            continue
        if lum[y, x] <= 175 or sat[y, x] >= 55:
            continue
        vis[y, x] = True
        n += 1
        if n > 900000:
            break
        q.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    ys, xs = np.where(vis)
    pad = 10
    return (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(w, int(xs.max()) + pad + 1),
        min(h, int(ys.max()) + pad + 1),
    )


def rr_mask(w: int, h: int, radius: int) -> Image.Image:
    ss = 4
    big = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (1, 1, w * ss - 2, h * ss - 2), radius=radius * ss, fill=255
    )
    return big.resize((w, h), Image.LANCZOS)


def stage_on_blue(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    canvas = Image.new("RGB", (w + 96, h + 96), BLUE)
    canvas.paste(rgb, (48, 48))
    return canvas


def cut_glass(kind: str) -> Image.Image:
    src_path = SRC[kind]
    raw = Image.open(src_path).convert("RGB")
    box = detect_card(raw)
    card = raw.crop(box)
    local = WORK / f"glass-{kind}-src.png"
    card.save(local, "PNG")
    print("card", kind, box, card.size, flush=True)

    staged = stage_on_blue(card)
    staged_path = WORK / f"glass-{kind}.blue.png"
    staged.save(staged_path, "PNG")
    print("staged", staged_path.name, staged.size, "corner", staged.getpixel((0, 0)), flush=True)

    cut = portal_mask(staged_path)
    cut.save(WORK / f"glass-{kind}.rmbg.png", "PNG")
    print("  rmbg", cut.size, "bbox", cut.getbbox(), "corner_a", cut.getpixel((0, 0))[3], flush=True)

    # Portal alpha is only an outer hint. Frosted glass gets eaten, so the
    # plate itself is a filled rounded-rect from the original RGB.
    plate = rr_mask(card.size[0], card.size[1], int(min(card.size) * 0.18))
    portal_a = cut.split()[3]
    if portal_a.size != staged.size:
        portal_a = portal_a.resize(staged.size, Image.LANCZOS)
    portal_a = portal_a.crop((48, 48, 48 + card.size[0], 48 + card.size[1]))
    portal_a = fill_alpha_holes(portal_a)
    # keep portal edge softness, but never punch the plate interior
    plate_a = np.array(plate, dtype=np.uint16)
    edge = np.array(portal_a, dtype=np.uint16)
    alpha = np.where(plate_a > 8, np.maximum(plate_a, edge), 0).astype(np.uint8)
    alpha = Image.fromarray(alpha, "L")

    out = card.convert("RGBA")
    out.putalpha(alpha)
    out = bleed_rgb(trim(out, 4))
    print("glass", kind, out.size, "bbox", out.getbbox(), flush=True)
    return out


def checker(im: Image.Image, cell: int = 32) -> Image.Image:
    w, h = im.size
    bg = Image.new("RGB", (w, h), (236, 236, 240))
    d = ImageDraw.Draw(bg)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2 == 0:
                d.rectangle((x, y, x + cell, y + cell), fill=(220, 220, 226))
    bg.paste(im, (0, 0), im)
    return bg


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    DESK.mkdir(parents=True, exist_ok=True)
    cuts = {}
    for kind in ("win", "fail"):
        shutil.copy2(SRC[kind], WORK / f"scene-{kind}-desk.png")
        im = cut_glass(kind)
        cuts[kind] = im
        work_out = WORK / f"glass-{kind}.cut.png"
        desk_out = DESK / (f"{'胜利' if kind == 'win' else '失败'}-玻璃.png")
        im.save(work_out, "PNG")
        im.save(desk_out, "PNG")
        print("wrote", work_out)
        print("wrote", desk_out)

    # checker preview
    win, fail = cuts["win"], cuts["fail"]
    h = max(win.size[1], fail.size[1])
    prev = Image.new("RGB", (win.size[0] + fail.size[0] + 24, h), (20, 24, 36))
    prev.paste(checker(win), (0, (h - win.size[1]) // 2))
    prev.paste(checker(fail), (win.size[0] + 24, (h - fail.size[1]) // 2))
    prev.save(WORK / "glass-cut-preview.png")
    prev.save(DESK / "玻璃抠图预览.png")
    print("preview", DESK / "玻璃抠图预览.png")


if __name__ == "__main__":
    main()
