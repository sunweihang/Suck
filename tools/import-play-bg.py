#!/usr/bin/env python3
"""Import the play backdrop as a 1080x1920 cover. Drop extra height at the bottom to hide the Doubao caption."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/Desktop/游戏背景.png")
OUT = ROOT / "assets/resources/ui/bg-play-q.png"
DESIGN_W, DESIGN_H = 1080, 1920


def crop_to_design(src: Image.Image) -> Image.Image:
    w, h = src.size
    target_h = int(round(w * DESIGN_H / DESIGN_W))
    if target_h > h:
        target_w = int(round(h * DESIGN_W / DESIGN_H))
        x0 = (w - target_w) // 2
        box = (x0, 0, x0 + target_w, h)
    else:
        # Keep the bright center; crop the bottom caption band.
        box = (0, 0, w, target_h)
    return src.crop(box)


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    framed = crop_to_design(src)
    out = framed.resize((DESIGN_W, DESIGN_H), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} {out.size} from {src.size} crop {framed.size}")


if __name__ == "__main__":
    main()
