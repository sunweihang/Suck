#!/usr/bin/env python3
"""Fail popup: vector chrome + title, soft hero, supersampled retry pill."""

from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-fail"
SRC_PANEL = Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (6).png")
PINGFANG = "/System/Library/Fonts/PingFang.ttc"

UUID = {
    "panel-fail": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e31",
    "btn-fail-retry": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e32",
}

# 2x of runtime ~920x1100
PANEL_W, PANEL_H = 1840, 2200
BTN_W, BTN_H = 1320, 440


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


def ss_round_mask(w: int, h: int, r: int, ss: int = 4) -> Image.Image:
    mw, mh, mr = w * ss, h * ss, r * ss
    m = Image.new("L", (mw, mh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, mw - 1, mh - 1), radius=mr, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def mask_ring(outer: Image.Image, inset: int, inner_r: int, ss: int = 4) -> Image.Image:
    w, h = outer.size
    inner = ss_round_mask(max(2, w - inset * 2), max(2, h - inset * 2), max(2, inner_r), ss)
    o = np.array(outer, dtype=np.int16)
    i = np.zeros_like(o)
    x = (w - inner.size[0]) // 2
    y = (h - inner.size[1]) // 2
    i[y : y + inner.size[1], x : x + inner.size[0]] = np.array(inner)
    return Image.fromarray(np.clip(o - i, 0, 255).astype(np.uint8), "L")


def stamp_text(w: int, h: int, text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.02
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def draw_title() -> Image.Image:
    ss = 4
    w, h = 1680, 420
    font = ImageFont.truetype(PINGFANG, 210 * ss, index=8)
    body = stamp_text(w * ss, h * ss, "挑战失败", font, 4 * ss)
    outline = stamp_text(w * ss, h * ss, "挑战失败", font, 22 * ss)
    halo = stamp_text(w * ss, h * ss, "挑战失败", font, 40 * ss)
    body = body.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.35))
    outline = outline.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.45))
    halo = halo.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop = halo.filter(ImageFilter.GaussianBlur(8))
    canvas.alpha_composite(layer(drop, (70, 110, 150, 55)), dest=(0, 8))
    canvas.alpha_composite(layer(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(layer(outline, (36, 118, 138, 255)), dest=(0, 5))
    canvas.alpha_composite(layer(outline, (28, 108, 128, 255)))
    fill = vgrad(w, h, (236, 255, 255, 255), (86, 196, 220, 255))
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    return canvas


def draw_sub() -> Image.Image:
    ss = 3
    w, h = 1200, 140
    font = ImageFont.truetype(PINGFANG, 52 * ss, index=8)
    body = stamp_text(w * ss, h * ss, "别灰心，再试一次", font, 2 * ss)
    outline = stamp_text(w * ss, h * ss, "别灰心，再试一次", font, 8 * ss)
    body = body.resize((w, h), Image.LANCZOS)
    outline = outline.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(layer(outline, (255, 255, 255, 230)))
    canvas.alpha_composite(layer(body, (92, 86, 118, 255)))
    return canvas


def extract_hero() -> Image.Image:
    """Keep cream under the octopus and dissolve the crop rectangle."""
    src = Image.open(SRC_PANEL).convert("RGB")
    crop = src.crop((460, 720, 1588, 1500)).convert("RGBA")
    arr = np.array(crop)
    r, g, b = arr[:, :, 0].astype(np.int16), arr[:, :, 1].astype(np.int16), arr[:, :, 2].astype(np.int16)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    cream = (mn >= 228) & ((mx - mn) < 26)
    arr[cream, 0] = 255
    arr[cream, 1] = 252
    arr[cream, 2] = 248
    h, w = arr.shape[:2]
    fade = 48
    yy = np.broadcast_to(np.arange(h)[:, None], (h, w))
    xx = np.broadcast_to(np.arange(w)[None, :], (h, w))
    edge = np.minimum(np.minimum(yy, h - 1 - yy), np.minimum(xx, w - 1 - xx)).astype(np.float32)
    arr[:, :, 3] = (arr[:, :, 3].astype(np.float32) * np.clip(edge / fade, 0, 1)).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def draw_panel() -> Image.Image:
    w, h = PANEL_W, PANEL_H
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pad = 52
    x0, y0, x1, y1 = pad, pad, w - pad, h - pad
    rw, rh = x1 - x0, y1 - y0
    r = 210

    plate = ss_round_mask(rw, rh, r, 4)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste(layer(plate, (120, 110, 170, 70)), (x0 + 8, y0 + 22))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))

    ring = vgrad(rw, rh, (168, 214, 255, 255), (196, 176, 240, 255))
    ring.putalpha(plate)
    face_m = ss_round_mask(rw - 52, rh - 52, r - 26, 4)
    face = Image.new("RGBA", (rw - 52, rh - 52), (255, 252, 248, 255))
    hi = vgrad(rw - 52, rh - 52, (255, 255, 255, 50), (255, 252, 248, 0))
    face.alpha_composite(hi)
    face.putalpha(face_m)
    card = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    card.alpha_composite(ring)
    card.alpha_composite(face, dest=(26, 26))

    cyan = mask_ring(plate, 18, r - 18, 4)
    lilac = mask_ring(plate, 8, r - 6, 4)
    card.alpha_composite(layer(cyan, (210, 244, 255, 210)))
    card.alpha_composite(layer(lilac, (186, 168, 230, 170)))

    gm = Image.new("L", (rw, rh), 0)
    ImageDraw.Draw(gm).pieslice((-rw * 0.15, -rh * 0.55, rw * 1.15, rh * 0.40), 200, 340, fill=70)
    gm = gm.filter(ImageFilter.GaussianBlur(16))
    gloss = layer(gm, (255, 255, 255, 50))
    card = Image.composite(Image.alpha_composite(card, gloss), card, plate)

    canvas.alpha_composite(card, dest=(x0, y0))

    title = draw_title()
    canvas.alpha_composite(title, dest=((w - title.size[0]) // 2, 88))
    sub = draw_sub()
    canvas.alpha_composite(sub, dest=((w - sub.size[0]) // 2, 430))

    hero = extract_hero()
    hero.thumbnail((1180, 980), Image.LANCZOS)
    canvas.alpha_composite(hero, dest=((w - hero.size[0]) // 2, 620))
    return canvas


def draw_retry() -> Image.Image:
    ss = 4
    w, h = BTN_W * ss, BTN_H * ss
    bw, bh = (BTN_W - 96) * ss, (BTN_H - 96) * ss
    x0, y0 = (w - bw) // 2, 36 * ss
    r = bh // 2
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def stadium(pw: int, ph: int) -> Image.Image:
        m = Image.new("L", (pw, ph), 0)
        d = ImageDraw.Draw(m)
        d.ellipse((0, 0, ph - 1, ph - 1), fill=255)
        d.ellipse((pw - ph, 0, pw - 1, ph - 1), fill=255)
        d.rectangle((ph // 2, 0, pw - ph // 2, ph - 1), fill=255)
        return m

    pill = stadium(bw, bh)
    rim = 20 * ss
    white = stadium(bw + rim * 2, bh + rim * 2)

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste(layer(pill, (140, 130, 180, 70)), (x0, y0 + 18 * ss))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14 * ss)))

    plate = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    plate.paste(layer(white, (255, 255, 255, 255)), (x0 - rim, y0 - rim))
    plate.paste(layer(pill, (42, 128, 122, 255)), (x0, y0))

    inset_w, inset_h = bw - 20 * ss, bh - 20 * ss
    inset = Image.new("L", (inset_w, inset_h), 0)
    ir = max(8, inset_h // 2)
    ImageDraw.Draw(inset).rounded_rectangle((0, 0, inset_w - 1, inset_h - 1), radius=ir, fill=255)
    fill = vgrad(inset_w, inset_h, (198, 252, 236, 255), (118, 214, 196, 255))
    fill.putalpha(inset)
    tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tmp.paste(fill, (x0 + 10 * ss, y0 + 10 * ss), fill)
    plate.alpha_composite(tmp)

    gloss = Image.new("L", (bw, bh), 0)
    gd = ImageDraw.Draw(gloss)
    gd.arc((36 * ss, 16 * ss, bw * 0.42, bh * 0.70), 200, 340, fill=170, width=18 * ss)
    gd.arc((bw * 0.58, 16 * ss, bw - 36 * ss, bh * 0.70), 200, 340, fill=130, width=14 * ss)
    gcol = layer(gloss.filter(ImageFilter.GaussianBlur(4 * ss)), (255, 255, 255, 170))
    gtmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gtmp.paste(gcol, (x0, y0), gcol)
    plate.alpha_composite(gtmp)
    canvas.alpha_composite(plate)

    font = ImageFont.truetype(PINGFANG, 96 * ss, index=8)
    body = stamp_text(w, h, "重新开始", font, 3 * ss)
    outline = stamp_text(w, h, "重新开始", font, 12 * ss)
    canvas.alpha_composite(layer(outline, (42, 128, 122, 255)), dest=(0, 3 * ss))
    canvas.alpha_composite(layer(outline, (42, 128, 122, 255)))
    canvas.alpha_composite(layer(body, (255, 255, 255, 255)))
    return canvas.resize((BTN_W, BTN_H), Image.LANCZOS)


def preview(panel: Image.Image, btn: Image.Image) -> None:
    canvas = Image.new("RGBA", (540, 960), (40, 36, 56, 255))
    p = panel.copy()
    p.thumbnail((430, 560), Image.LANCZOS)
    canvas.alpha_composite(p, dest=(270 - p.size[0] // 2, 120))
    b = btn.copy()
    b.thumbnail((250, 84), Image.LANCZOS)
    y = 120 + p.size[1] - 118
    canvas.alpha_composite(b, dest=(270 - b.size[0] // 2, y))
    WORK.mkdir(parents=True, exist_ok=True)
    out = WORK / "fail-preview.png"
    canvas.convert("RGB").save(out)
    print("preview", out)


def trim_alpha(im: Image.Image, pad: int = 10) -> Image.Image:
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


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    portal_panel = WORK / "panel-fail.rmbg.png"
    portal_btn = WORK / "btn-fail-retry.rmbg.png"
    if portal_panel.exists() and portal_btn.exists():
        panel = trim_alpha(Image.open(portal_panel).convert("RGBA"), 10)
        btn = trim_alpha(Image.open(portal_btn).convert("RGBA"), 8)
        print("using portal rmbg cuts")
    else:
        panel = draw_panel()
        btn = draw_retry()
    save(panel, "panel-fail")
    save(btn, "btn-fail-retry")
    preview(panel, btn)


if __name__ == "__main__":
    main()
