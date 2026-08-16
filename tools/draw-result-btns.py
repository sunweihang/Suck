#!/usr/bin/env python3
"""Redraw result CTAs as supersampled vector pills. No AI cutout fringe."""

from pathlib import Path
from typing import Tuple

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
PINGFANG = "/System/Library/Fonts/PingFang.ttc"
HIRAGINO = "/System/Library/Fonts/Hiragino Sans GB.ttc"

UUID = {
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    "btn-fail-retry": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e32",
}

# 1080 design: 460x140. Texture is 2x so it stays sharp when scaled.
DESIGN_W, DESIGN_H = 460, 140
PX = 2
BTN_W, BTN_H = DESIGN_W * PX, DESIGN_H * PX
SS = 8

# Sticker-glass CTAs that sit with the pastel result cards.
PALETTES = {
    "next": {
        "face_top": (154, 222, 255, 255),
        "face_bot": (62, 148, 238, 255),
        "rim": (196, 236, 255, 255),
        "ink": (24, 86, 168, 255),
        "text": (255, 255, 255, 255),
    },
    "retry": {
        "face_top": (226, 198, 255, 255),
        "face_bot": (164, 116, 228, 255),
        "rim": (236, 220, 255, 255),
        "ink": (90, 46, 148, 255),
        "text": (255, 255, 255, 255),
    },
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
    "fixAlphaTransparencyArtifacts": true,
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
    return g.resize((w, h), Image.LANCZOS)


def layer(mask: Image.Image, color: Tuple[int, int, int, int]) -> Image.Image:
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def stadium_mask(w: int, h: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 0, h - 1, h - 1), fill=255)
    d.ellipse((w - h, 0, w - 1, h - 1), fill=255)
    d.rectangle((h // 2, 0, w - h // 2, h - 1), fill=255)
    return m


def stamp_text(w: int, h: int, text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.015
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def _paste(canvas: Image.Image, mask: Image.Image, color, xy: Tuple[int, int]) -> None:
    tmp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    tmp.paste(layer(mask, color), xy, layer(mask, color))
    canvas.alpha_composite(tmp)


def _glass_shine(w: int, h: int, body: Image.Image) -> Image.Image:
    sheen = Image.new("L", (w, h), 0)
    ImageDraw.Draw(sheen).ellipse((-int(w * 0.06), -int(h * 0.62), int(w * 1.04), int(h * 0.58)), fill=96)
    spec = Image.new("L", (w, h), 0)
    ImageDraw.Draw(spec).ellipse((int(w * 0.10), int(h * 0.12), int(w * 0.22), int(h * 0.34)), fill=200)
    spec = spec.filter(ImageFilter.GaussianBlur(max(2, h // 16)))
    sheen = ImageChops.lighter(sheen.filter(ImageFilter.GaussianBlur(max(6, h // 7))), spec)
    return ImageChops.multiply(sheen, body)


def draw_btn(text: str, kind: str) -> Image.Image:
    pal = PALETTES[kind]
    w, h = BTN_W * SS, BTN_H * SS
    pad = 14 * SS
    white = 8 * SS
    rim = 5 * SS

    bw = w - pad * 2
    bh = h - pad * 2
    x0, y0 = pad, pad

    white_m = stadium_mask(bw, bh)
    rim_m = stadium_mask(bw - white * 2, bh - white * 2)
    body_m = stadium_mask(bw - (white + rim) * 2, bh - (white + rim) * 2)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    _paste(shadow, white_m, (40, 36, 72, 70), (x0, y0 + 7 * SS))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(6 * SS)))

    _paste(canvas, white_m, (255, 255, 255, 255), (x0, y0))
    _paste(canvas, rim_m, pal["rim"], (x0 + white, y0 + white))

    bx, by = x0 + white + rim, y0 + white + rim
    fill = vgrad(*body_m.size, pal["face_top"], pal["face_bot"])
    fill.putalpha(body_m)
    tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tmp.paste(fill, (bx, by), fill)
    canvas.alpha_composite(tmp)

    shade = Image.new("L", body_m.size, 0)
    ImageDraw.Draw(shade).rectangle((0, int(body_m.size[1] * 0.68), body_m.size[0], body_m.size[1]), fill=48)
    shade = ImageChops.multiply(shade.filter(ImageFilter.GaussianBlur(10 * SS)), body_m)
    _paste(canvas, shade, pal["ink"], (bx, by))

    shine = _glass_shine(*body_m.size, body_m)
    gcol = layer(shine, (255, 255, 255, 200))
    gtmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gtmp.paste(gcol, (bx, by), gcol)
    canvas.alpha_composite(gtmp)

    size = 70 * SS if len(text) >= 4 else 76 * SS
    try:
        font = ImageFont.truetype(HIRAGINO, size, index=2)
    except OSError:
        font = ImageFont.truetype(PINGFANG, size, index=8)
    body = stamp_text(w, h, text, font, 2 * SS)
    outline = stamp_text(w, h, text, font, 8 * SS)
    canvas.alpha_composite(layer(outline, pal["ink"]), dest=(0, 3 * SS))
    canvas.alpha_composite(layer(outline, pal["ink"]))
    canvas.alpha_composite(layer(body, pal["text"]))
    return canvas.resize((BTN_W, BTN_H), Image.LANCZOS)


def _phone(panel_path: Path, btn: Image.Image, panel_w: int, panel_h: int) -> Image.Image:
    phone = Image.new("RGBA", (1080, 1920), (48, 54, 78, 255))
    panel = Image.open(panel_path).convert("RGBA")
    panel = panel.resize((panel_w, panel_h), Image.LANCZOS)
    shown = btn.resize((DESIGN_W, DESIGN_H), Image.LANCZOS)
    stack_h = panel_h + 20 + DESIGN_H
    y0 = (1920 - stack_h) // 2
    phone.alpha_composite(panel, dest=((1080 - panel_w) // 2, y0))
    phone.alpha_composite(shown, dest=((1080 - DESIGN_W) // 2, y0 + panel_h + 20))
    return phone


def preview(nxt: Image.Image, retry: Image.Image) -> None:
    win = _phone(OUT_DIR / "panel-win.png", nxt, 860, 1040)
    fail = _phone(OUT_DIR / "panel-fail.png", retry, 860, 1070)
    WORK.mkdir(parents=True, exist_ok=True)
    win.convert("RGB").save(WORK / "btn-win-phone.png")
    fail.convert("RGB").save(WORK / "btn-fail-phone.png")
    canvas = Image.new("RGBA", (1080, 1920), (32, 36, 52, 255))
    left = win.copy()
    right = fail.copy()
    left.thumbnail((520, 924), Image.LANCZOS)
    right.thumbnail((520, 924), Image.LANCZOS)
    canvas.alpha_composite(left, dest=(16, 80))
    canvas.alpha_composite(right, dest=(544, 80))
    out = WORK / "btn-redraw-preview.png"
    canvas.convert("RGB").save(out)
    print("preview", out)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    nxt = draw_btn("下一关", "next")
    retry = draw_btn("再试一次", "retry")
    save(nxt, "btn-win-next")
    save(retry, "btn-fail-retry")
    preview(nxt, retry)


if __name__ == "__main__":
    main()
