#!/usr/bin/env python3
"""White card + title + AI octopus (no cutout) + hard next button."""

import importlib.util
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-win"
HERO = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/win-hero-octopus.png")

spec = importlib.util.spec_from_file_location("win", ROOT / "tools/draw-win-match.py")
win = importlib.util.module_from_spec(spec)
spec.loader.exec_module(win)


def bleach(rgb: Image.Image) -> Image.Image:
    im = rgb.convert("RGB")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if min(r, g, b) > 228 and max(r, g, b) - min(r, g, b) < 22:
                px[x, y] = (255, 255, 255)
    return im


def assemble_panel(hero: Image.Image) -> Image.Image:
    w, h = 1760, 2080
    pad = 8
    r = 168
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pw, ph = w - pad * 2, h - pad * 2
    plate = Image.new("RGBA", (pw, ph), (255, 255, 255, 255))
    plate.putalpha(win.rr_mask(pw, ph, r))
    d = ImageDraw.Draw(plate)
    d.rounded_rectangle((2, 2, pw - 3, ph - 3), radius=r - 1, outline=(132, 118, 210, 255), width=10)
    d.rounded_rectangle((10, 10, pw - 11, ph - 11), radius=r - 7, outline=(120, 210, 235, 255), width=5)

    title = win.draw_title()
    title.thumbnail((int(pw * 0.86), 300), Image.LANCZOS)
    plate.alpha_composite(title, dest=((pw - title.size[0]) // 2, 48))
    sub = win.draw_sub()
    plate.alpha_composite(sub, dest=((pw - sub.size[0]) // 2, 48 + title.size[1] - 18))

    hero.thumbnail((int(pw * 0.78), int(ph * 0.50)), Image.LANCZOS)
    hx = (pw - hero.size[0]) // 2
    hy = 48 + title.size[1] + sub.size[1] - 10
    plate.alpha_composite(hero.convert("RGBA"), dest=(hx, hy))

    canvas.alpha_composite(plate, dest=(pad, pad))
    box = canvas.getbbox()
    return canvas.crop(box)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(HERO, WORK / "win-hero-octopus-src.png")
    hero = bleach(Image.open(HERO))
    panel = assemble_panel(hero)
    nxt = win.draw_btn("next")
    win.save(panel, "panel-win")
    win.save(nxt, "btn-win-next")
    print("panel", panel.size, "next", nxt.size)


if __name__ == "__main__":
    main()
