#!/usr/bin/env python3
"""Draw victory chrome to match the in-game reference. No watermark, opaque plate."""

from pathlib import Path
from typing import Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
PINGFANG = "/System/Library/Fonts/PingFang.ttc"

UUID = {
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "btn-win-back": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e24",
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
}


def write_meta(path: Path, uuid: str, w: int, h: int) -> None:
    hw, hh = w / 2.0, h / 2.0
    path.with_suffix(".png.meta").write_text(
        f"""{{
  "ver": "1.0.27",
  "importer": "image",
  "imported": true,
  "uuid": "{uuid}",
  "files": [".json", ".png"],
  "subMetas": {{
    "6c48a": {{
      "importer": "texture",
      "uuid": "{uuid}@6c48a",
      "displayName": "{path.stem}",
      "id": "6c48a",
      "name": "texture",
      "userData": {{
        "wrapModeS": "clamp-to-edge",
        "wrapModeT": "clamp-to-edge",
        "minfilter": "linear",
        "magfilter": "linear",
        "mipfilter": "none",
        "anisotropy": 0,
        "isUuid": true,
        "imageUuidOrDatabaseUri": "{uuid}",
        "visible": false
      }},
      "ver": "1.0.22",
      "imported": true,
      "files": [".json"],
      "subMetas": {{}}
    }},
    "f9941": {{
      "importer": "sprite-frame",
      "uuid": "{uuid}@f9941",
      "displayName": "{path.stem}",
      "id": "f9941",
      "name": "spriteFrame",
      "userData": {{
        "trimThreshold": 1,
        "rotated": false,
        "offsetX": 0,
        "offsetY": 0,
        "trimX": 0,
        "trimY": 0,
        "width": {w},
        "height": {h},
        "rawWidth": {w},
        "rawHeight": {h},
        "borderTop": 0,
        "borderBottom": 0,
        "borderLeft": 0,
        "borderRight": 0,
        "packable": false,
        "pixelsToUnit": 100,
        "pivotX": 0.5,
        "pivotY": 0.5,
        "meshType": 0,
        "vertices": {{
          "rawPosition": [{-hw}, {-hh}, 0, {hw}, {-hh}, 0, {-hw}, {hh}, 0, {hw}, {hh}, 0],
          "indexes": [0, 1, 2, 2, 1, 3],
          "uv": [0, {h}, {w}, {h}, 0, 0, {w}, 0],
          "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
          "minPos": [{-hw}, {-hh}, 0],
          "maxPos": [{hw}, {hh}, 0]
        }},
        "isUuid": true,
        "imageUuidOrDatabaseUri": "{uuid}@6c48a",
        "atlasUuid": "",
        "trimType": "none"
      }},
      "ver": "1.0.12",
      "imported": true,
      "files": [".json"],
      "subMetas": {{}}
    }}
  }},
  "userData": {{
    "type": "sprite-frame",
    "fixAlphaTransparencyArtifacts": false,
    "hasAlpha": true,
    "redirect": "{uuid}@6c48a"
  }}
}}
""",
        encoding="utf-8",
    )


def save(im: Image.Image, name: str) -> Image.Image:
    path = OUT_DIR / f"{name}.png"
    im.save(path, "PNG")
    write_meta(path, UUID[name], *im.size)
    print("wrote", path.name, im.size)
    return im


def lerp(a: Tuple[int, ...], b: Tuple[int, ...], t: float) -> Tuple[int, ...]:
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(len(a)))


def vgrad(w: int, h: int, top: Tuple[int, int, int, int], bot: Tuple[int, int, int, int]) -> Image.Image:
    g = Image.new("RGBA", (1, h))
    px = g.load()
    for y in range(h):
        px[0, y] = lerp(top, bot, y / max(h - 1, 1))
    return g.resize((w, h), Image.BILINEAR)


def rr_mask(w: int, h: int, r: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    return m


def tint(mask: Image.Image, color: Tuple[int, int, int, int]) -> Image.Image:
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def stamp(w: int, h: int, text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.02
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def soft_ellipse(canvas: Image.Image, box, fill, blur=0) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=fill)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer)


def star(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill) -> None:
    pts = []
    for i in range(10):
        ang = -90 + i * 36
        rad = r if i % 2 == 0 else r * 0.42
        from math import cos, radians, sin
        pts.append((x + cos(radians(ang)) * rad, y + sin(radians(ang)) * rad))
    draw.polygon(pts, fill=fill)


def draw_title() -> Image.Image:
    w, h = 1480, 360
    font = ImageFont.truetype(PINGFANG, 248, index=8)
    body = stamp(w, h, "胜利!", font, 6)
    outline = stamp(w, h, "胜利!", font, 22)
    halo = stamp(w, h, "胜利!", font, 40)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop = halo.filter(ImageFilter.GaussianBlur(8))
    canvas.alpha_composite(tint(drop, (40, 90, 130, 80)), dest=(0, 8))
    canvas.alpha_composite(tint(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(tint(outline, (28, 118, 132, 255)), dest=(0, 5))
    canvas.alpha_composite(tint(outline, (36, 128, 140, 255)))
    fill = vgrad(w, h, (210, 255, 230, 255), (88, 214, 230, 255))
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    return canvas


def draw_sub() -> Image.Image:
    w, h = 980, 120
    font = ImageFont.truetype(PINGFANG, 54, index=5)
    body = stamp(w, h, "太棒了，关卡完成", font, 2)
    outline = stamp(w, h, "太棒了，关卡完成", font, 8)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(tint(outline, (70, 56, 110, 220)))
    canvas.alpha_composite(tint(body, (255, 255, 255, 255)))
    return canvas


def sausage(im: Image.Image, x0, y0, x1, y1, r, fill, hi=None) -> None:
    steps = 18
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        rr = r * (1.0 - 0.18 * t)
        soft_ellipse(im, (x - rr, y - rr, x + rr, y + rr), fill, 0)
    if hi:
        hx = x0 + (x1 - x0) * 0.25
        hy = y0 + (y1 - y0) * 0.25
        soft_ellipse(im, (hx - r * 0.35, hy - r * 0.45, hx + r * 0.15, hy - r * 0.05), hi, 1)


def draw_octopus(w: int, h: int) -> Image.Image:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cx, cy = w * 0.5, h * 0.52
    peach = (255, 164, 128, 255)
    peach_d = (232, 124, 100, 255)
    peach_h = (255, 220, 196, 200)
    # raised celebrating arms
    sausage(im, cx - 78, cy + 10, cx - 200, cy - 200, 48, peach, peach_h)
    sausage(im, cx + 78, cy + 10, cx + 200, cy - 200, 48, peach, peach_h)
    sausage(im, cx - 200, cy - 200, cx - 150, cy - 290, 34, peach, peach_h)
    sausage(im, cx + 200, cy - 200, cx + 150, cy - 290, 34, peach, peach_h)
    d = ImageDraw.Draw(im)
    for sx, sy in ((cx - 150, cy - 290), (cx + 150, cy - 290)):
        d.ellipse((sx - 18, sy - 10, sx + 18, sy + 16), fill=(255, 196, 176, 255))
    # bottom tentacles
    bottoms = [
        (cx - 160, cy + 80, cx - 240, cy + 200, 36),
        (cx - 85, cy + 115, cx - 120, cy + 240, 34),
        (cx - 18, cy + 128, cx - 22, cy + 252, 32),
        (cx + 18, cy + 128, cx + 22, cy + 252, 32),
        (cx + 85, cy + 115, cx + 120, cy + 240, 34),
        (cx + 160, cy + 80, cx + 240, cy + 200, 36),
    ]
    for x0, y0, x1, y1, r in bottoms:
        sausage(im, x0, y0, x1, y1, r, peach, (255, 196, 176, 180))
        d.ellipse((x1 - 14, y1 - 6, x1 + 14, y1 + 16), fill=(255, 196, 176, 255))
    # head
    soft_ellipse(im, (cx - 178, cy - 20, cx + 178, cy + 188), peach_d, 2)
    soft_ellipse(im, (cx - 172, cy - 148, cx + 172, cy + 158), peach, 0)
    soft_ellipse(im, (cx - 70, cy - 128, cx + 10, cy - 48), peach_h, 2)
    soft_ellipse(im, (cx - 138, cy + 28, cx - 72, cy + 78), (255, 128, 128, 150), 1)
    soft_ellipse(im, (cx + 72, cy + 28, cx + 138, cy + 78), (255, 128, 128, 150), 1)
    d.ellipse((cx - 52, cy - 18, cx - 18, cy + 22), fill=(36, 28, 32, 255))
    d.ellipse((cx + 18, cy - 18, cx + 52, cy + 22), fill=(36, 28, 32, 255))
    d.ellipse((cx - 44, cy - 14, cx - 32, cy - 1), fill=(255, 255, 255, 230))
    d.ellipse((cx + 26, cy - 14, cx + 38, cy - 1), fill=(255, 255, 255, 230))
    d.pieslice((cx - 62, cy + 34, cx + 62, cy + 128), 6, 174, fill=(214, 56, 68, 255))
    d.pieslice((cx - 36, cy + 84, cx + 36, cy + 128), 10, 170, fill=(255, 128, 140, 255))
    return im


def draw_deco(w: int, h: int) -> Image.Image:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, "RGBA")
    stars = [(210, 420, 34), (250, 720, 22), (w - 230, 400, 30), (w - 200, 700, 20), (w * 0.5 + 160, 360, 16)]
    for x, y, r in stars:
        star(d, x, y, r, (255, 214, 64, 255))
        star(d, x - 2, y - 3, r * 0.45, (255, 244, 170, 220))
    ribbons = [
        ((170, 540, 36), (250, 610, 28), (200, 700, 22), (255, 112, 168, 235)),
        ((w - 170, 530, 36), (w - 250, 600, 28), (w - 200, 690, 22), (88, 186, 255, 230)),
        ((300, 760, 24), (430, 810, 20), (580, 780, 16), (255, 196, 72, 230)),
        ((w - 300, 760, 24), (w - 430, 820, 20), (w - 580, 785, 16), (176, 118, 255, 220)),
    ]
    for a, b, c, col in ribbons:
        sausage(im, a[0], a[1], b[0], b[1], a[2], col)
        sausage(im, b[0], b[1], c[0], c[1], b[2], col)
    for x, y, r, a in (
        (260, 500, 28, 90), (200, 640, 18, 80), (w - 250, 510, 26, 90),
        (w - 190, 650, 16, 70), (w * 0.5 - 200, 360, 14, 70), (w * 0.5 + 210, 740, 20, 80),
    ):
        d.ellipse((x - r, y - r, x + r, y + r), outline=(210, 236, 255, a), width=max(3, r // 6))
        d.ellipse((x - r * 0.4, y - r * 0.55, x - r * 0.1, y - r * 0.25), fill=(255, 255, 255, 120))
    return im


def draw_panel() -> Image.Image:
    w, h = 1760, 2100
    pad = 40
    x0, y0, x1, y1 = pad, pad, w - pad, h - pad
    rw, rh = x1 - x0, y1 - y0
    r = 210
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste(tint(rr_mask(rw, rh, r), (110, 100, 160, 70)), (x0 + 8, y0 + 26))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))

    ring = vgrad(rw, rh, (168, 220, 255, 255), (196, 176, 240, 255))
    ring.putalpha(rr_mask(rw, rh, r))
    plate = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    plate.alpha_composite(ring)
    inset = 46
    face = vgrad(rw - inset * 2, rh - inset * 2, (255, 255, 255, 255), (246, 250, 255, 255))
    face.putalpha(rr_mask(rw - inset * 2, rh - inset * 2, r - 24))
    plate.alpha_composite(face, dest=(inset, inset))

    gloss = Image.new("L", (rw, rh), 0)
    ImageDraw.Draw(gloss).pieslice((-rw * 0.12, -rh * 0.55, rw * 1.12, rh * 0.4), 200, 340, fill=64)
    gloss = gloss.filter(ImageFilter.GaussianBlur(16))
    gcol = tint(gloss, (255, 255, 255, 70))
    plate = Image.alpha_composite(plate, Image.composite(gcol, Image.new("RGBA", (rw, rh), (0, 0, 0, 0)), rr_mask(rw, rh, r)))

    rim = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.rounded_rectangle((14, 14, rw - 15, rh - 15), radius=r - 8, outline=(210, 244, 255, 220), width=12)
    rd.rounded_rectangle((6, 6, rw - 7, rh - 7), radius=r - 4, outline=(176, 160, 230, 150), width=6)
    plate.alpha_composite(rim)
    canvas.alpha_composite(plate, dest=(x0, y0))

    deco = draw_deco(rw, rh)
    canvas.alpha_composite(deco, dest=(x0, y0))
    hero = draw_octopus(rw, int(rh * 0.72))
    canvas.alpha_composite(hero, dest=(x0, y0 + int(rh * 0.18)))

    title = draw_title()
    canvas.alpha_composite(title, dest=(w // 2 - title.size[0] // 2, 70))
    sub = draw_sub()
    canvas.alpha_composite(sub, dest=(w // 2 - sub.size[0] // 2, 360))
    return canvas


def draw_btn(kind: str) -> Image.Image:
    bw, bh = 1180, 300
    pad = 8
    w, h = bw + pad * 2, bh + pad * 2
    r = bh // 2
    if kind == "next":
        top, bot = (186, 250, 226, 255), (118, 214, 196, 255)
        stroke = (36, 122, 116, 255)
        text_fill = (255, 255, 255, 255)
        text = "下一关"
    else:
        top, bot = (255, 250, 232, 255), (248, 220, 176, 255)
        stroke = (176, 118, 64, 255)
        text_fill = (255, 246, 220, 255)
        text = "返回"

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    x0, y0, x1, y1 = pad, pad, pad + bw - 1, pad + bh - 1
    d.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=(255, 255, 255, 255))
    d.rounded_rectangle((x0 + 6, y0 + 6, x1 - 6, y1 - 6), radius=r - 6, fill=stroke)
    inset = Image.new("L", (w, h), 0)
    ImageDraw.Draw(inset).rounded_rectangle((x0 + 16, y0 + 16, x1 - 16, y1 - 16), radius=max(8, r - 16), fill=255)
    fill = vgrad(w, h, top, bot)
    fill.putalpha(inset)
    canvas.alpha_composite(fill)
    d.rounded_rectangle((x0 + 22, y0 + 20, x1 - 22, y0 + 48), radius=16, fill=(255, 255, 255, 90))

    font = ImageFont.truetype(PINGFANG, 118, index=8)
    body = stamp(w, h, text, font, 3)
    outline = stamp(w, h, text, font, 12)
    canvas.alpha_composite(tint(outline, stroke), dest=(0, 3))
    canvas.alpha_composite(tint(outline, stroke))
    canvas.alpha_composite(tint(body, text_fill))
    px = canvas.load()
    bw, bh = canvas.size
    for y in range(bh):
        for x in range(bw):
            r, g, b, a = px[x, y]
            if a < 200:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)
    return canvas


def preview(panel: Image.Image, back: Image.Image, nxt: Image.Image) -> None:
    canvas = Image.new("RGBA", (540, 960), (186, 210, 236, 255))
    p = panel.copy()
    p.thumbnail((430, 620), Image.LANCZOS)
    canvas.alpha_composite(p, dest=(270 - p.size[0] // 2, 80))
    b = back.copy()
    n = nxt.copy()
    b.thumbnail((168, 64), Image.LANCZOS)
    n.thumbnail((168, 64), Image.LANCZOS)
    y = 80 + p.size[1] - 128
    canvas.alpha_composite(b, dest=(88, y))
    canvas.alpha_composite(n, dest=(284, y))
    out = ROOT / "tools/ai-win/win-draw-preview.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out)
    print("preview", out)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    panel = save(draw_panel(), "panel-win")
    back = save(draw_btn("back"), "btn-win-back")
    nxt = save(draw_btn("next"), "btn-win-next")
    preview(panel, back, nxt)


if __name__ == "__main__":
    main()
