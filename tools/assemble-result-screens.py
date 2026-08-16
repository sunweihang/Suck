#!/usr/bin/env python3
"""Compose matching 1080x2200 win/fail screens from AI octopus art."""

from math import cos, radians, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tools/ai-result"
SRC_DIR = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets")
PINGFANG = "/System/Library/Fonts/PingFang.ttc"

W, H = 1080, 2200
CARD_W, CARD_H = 860, 1280
CARD_X = (W - CARD_W) // 2
CARD_Y = 360
CARD_R = 168

SRC = {
    "win": SRC_DIR / "scene-win-ai.png",
    "fail": SRC_DIR / "scene-fail-ai.png",
}

# Octopus + nearby deco only (skip baked AI titles and leftover card chrome).
CROP = {
    "win": (210, 700, 814, 1260),
    "fail": (210, 700, 814, 1260),
}


def lerp(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(len(a)))


def vgrad(w, h, top, bot):
    g = Image.new("RGBA", (1, h))
    px = g.load()
    for y in range(h):
        px[0, y] = lerp(top, bot, y / max(h - 1, 1))
    return g.resize((w, h), Image.BILINEAR)


def rr_mask(w, h, r):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    return m


def tint(mask, color):
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def stamp(w, h, text, font, stroke):
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.02
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def soft_ellipse(canvas, box, fill, blur=0):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=fill)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer)


def four_star(draw, x, y, r, fill):
    pts = []
    for i in range(8):
        ang = -90 + i * 45
        rad = r if i % 2 == 0 else r * 0.34
        pts.append((x + cos(radians(ang)) * rad, y + sin(radians(ang)) * rad))
    draw.polygon(pts, fill=fill)


def draw_background():
    canvas = vgrad(W, H, (214, 196, 242, 255), (126, 210, 246, 255))
    # extra sky wash
    wash = vgrad(W, int(H * 0.42), (232, 220, 250, 90), (232, 220, 250, 0))
    canvas.alpha_composite(wash)
    # bubbles — same positions on both screens
    bubbles = [
        (90, 160, 38), (210, 90, 18), (980, 140, 46), (880, 70, 16),
        (70, 520, 22), (1010, 480, 28), (140, 1880, 52), (980, 1920, 36),
        (60, 1680, 20), (1020, 1640, 18), (240, 2060, 14), (820, 2080, 22),
        (500, 120, 12), (640, 200, 10), (430, 2040, 16),
    ]
    for x, y, r in bubbles:
        soft_ellipse(canvas, (x - r, y - r, x + r, y + r), (255, 255, 255, 58), 1)
        soft_ellipse(
            canvas,
            (x - r * 0.82, y - r * 0.82, x + r * 0.82, y + r * 0.82),
            (255, 255, 255, 0),
            0,
        )
        ring = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255, 150), width=3)
        canvas.alpha_composite(ring)
        soft_ellipse(
            canvas,
            (x - r * 0.42, y - r * 0.62, x - r * 0.08, y - r * 0.28),
            (255, 255, 255, 160),
            1,
        )

    # layered waves
    wave = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(wave)
    for i, (y, a) in enumerate(((2040, 70), (2090, 90), (2140, 110))):
        d.ellipse((-220, y, W + 220, H + 180 + i * 20), fill=(186, 232, 250, a))
    canvas.alpha_composite(wave.filter(ImageFilter.GaussianBlur(6)))
    return canvas


def draw_card():
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    glass = vgrad(CARD_W, CARD_H, (250, 254, 255, 150), (210, 234, 250, 118))
    mask = rr_mask(CARD_W, CARD_H, CARD_R)
    glass.putalpha(Image.composite(glass.getchannel("A"), Image.new("L", (CARD_W, CARD_H), 0), mask))
    card.alpha_composite(glass)

    # bubble sheen, top-left only
    sheen = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    soft_ellipse(sheen, (40, 36, 320, 150), (255, 255, 255, 120), 8)
    soft_ellipse(sheen, (70, 54, 210, 110), (255, 255, 255, 90), 4)
    sheen.putalpha(Image.composite(sheen.getchannel("A"), Image.new("L", (CARD_W, CARD_H), 0), mask))
    card.alpha_composite(sheen)

    border = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        (4, 4, CARD_W - 5, CARD_H - 5), radius=CARD_R - 3, outline=(186, 176, 232, 235), width=8
    )
    card.alpha_composite(border)
    return card


def extract_hero(kind: str) -> Image.Image:
    src = Image.open(SRC[kind]).convert("RGBA")
    crop = src.crop(CROP[kind])
    w, h = crop.size
    px = crop.load()
    keep = Image.new("L", (w, h), 0)
    kp = keep.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            pale = (r + g + b) / 3.0
            sat = max(r, g, b) - min(r, g, b)
            blueish = b > r + 8 and g > r
            yellow = r > 180 and g > 150 and b < 140
            ink = pale < 120
            if ink or yellow or (blueish and sat > 28) or (pale < 175 and sat > 36):
                kp[x, y] = 255
    keep = keep.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    crop.putalpha(keep)
    target_w = 640
    target_h = int(crop.height * target_w / crop.width)
    return crop.resize((target_w, target_h), Image.LANCZOS)


def draw_title(text: str, fill_top, fill_bot, outline):
    w, h = 820, 220
    font = ImageFont.truetype(PINGFANG, 128, index=8)
    body = stamp(w, h, text, font, 3)
    ring = stamp(w, h, text, font, 14)
    halo = stamp(w, h, text, font, 24)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(tint(halo.filter(ImageFilter.GaussianBlur(6)), (40, 70, 120, 70)), dest=(0, 6))
    canvas.alpha_composite(tint(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(tint(ring, outline), dest=(0, 4))
    fill = vgrad(w, h, fill_top, fill_bot)
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    return canvas


def draw_sub(text: str):
    w, h = 780, 90
    font = ImageFont.truetype(PINGFANG, 42, index=5)
    body = stamp(w, h, text, font, 1)
    ring = stamp(w, h, text, font, 6)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(tint(ring, (70, 56, 110, 160)))
    canvas.alpha_composite(tint(body, (255, 255, 255, 255)))
    return canvas


def compose(kind: str) -> Image.Image:
    canvas = draw_background()
    card = draw_card()
    hero = extract_hero(kind)
    hx = (CARD_W - hero.width) // 2
    hy = 470
    card.alpha_composite(hero, (hx, hy))

    if kind == "win":
        title = draw_title("胜利!", (168, 236, 255, 255), (72, 168, 230, 255), (36, 118, 168, 255))
        sub = draw_sub("太棒了，关卡完成")
    else:
        title = draw_title("失败", (214, 186, 230, 255), (168, 120, 186, 255), (120, 82, 150, 255))
        sub = draw_sub("没关系，再试一次吧")

    card.alpha_composite(title, ((CARD_W - title.width) // 2, 70))
    card.alpha_composite(sub, ((CARD_W - sub.width) // 2, 250))
    canvas.alpha_composite(card, (CARD_X, CARD_Y))
    return canvas


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    for kind in ("win", "fail"):
        src = SRC[kind]
        if src.exists():
            Image.open(src).save(WORK / f"scene-{kind}-ai-src.png")
        im = compose(kind)
        out = WORK / f"ui-{kind}-1080x2200.png"
        im.save(out, "PNG")
        print("wrote", out, im.size)
    # side-by-side preview
    win = Image.open(WORK / "ui-win-1080x2200.png")
    fail = Image.open(WORK / "ui-fail-1080x2200.png")
    prev = Image.new("RGB", (W * 2 + 24, H), (20, 24, 36))
    prev.paste(win.convert("RGB"), (0, 0))
    prev.paste(fail.convert("RGB"), (W + 24, 0))
    prev.resize((540 + 12, 550), Image.LANCZOS).save(WORK / "ui-result-preview.png")
    print("preview", WORK / "ui-result-preview.png")


if __name__ == "__main__":
    main()
