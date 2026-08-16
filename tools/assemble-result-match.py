#!/usr/bin/env python3
"""Assemble matching win/fail popups from the latest AI cards, heroes, and buttons."""

from collections import deque
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
SRC_DIR = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets")
PINGFANG = "/System/Library/Fonts/PingFang.ttc"

SRC = {
    "panel-win": SRC_DIR / "result-win-panel.png",
    "panel-fail": SRC_DIR / "result-fail-panel.png",
    "btn-win-next": SRC_DIR / "result-btn-next.png",
    "btn-fail-retry": SRC_DIR / "result-btn-retry.png",
    "hero-win": SRC_DIR / "result-hero-win.png",
    "hero-fail": SRC_DIR / "result-hero-fail.png",
}
UUID = {
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "panel-fail": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e31",
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    "btn-fail-retry": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e32",
}

PANEL_W, PANEL_H = 1840, 2200
BTN_W, BTN_H = 1280, 400
RADIUS = 196


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


def flood_punch(rgb: Image.Image, pred) -> Image.Image:
    w, h = rgb.size
    px = rgb.load()
    walk = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            walk[y][x] = pred(*px[x, y])
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if walk[y][x] and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if walk[y][x] and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and walk[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True
                q.append((nx, ny))
    rgba = rgb.convert("RGBA")
    out = rgba.load()
    for y in range(h):
        for x in range(w):
            if seen[y][x]:
                r, g, b, _ = out[x, y]
                out[x, y] = (r, g, b, 0)
    return rgba


def is_key_blue(r: int, g: int, b: int) -> bool:
    if r > 96 or g > 150 or b < 180:
        return False
    return b - r >= 110 and b - g >= 70


def is_studio_gray(r: int, g: int, b: int) -> bool:
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn > 22:
        return False
    avg = (r + g + b) / 3
    return 88 <= avg <= 168


def crop_opaque(im: Image.Image, pad: int = 6) -> Image.Image:
    box = im.getbbox()
    if not box:
        raise RuntimeError("empty after punch")
    x0, y0, x1, y1 = box
    return im.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(im.size[0], x1 + pad),
        min(im.size[1], y1 + pad),
    ))


def round_mask(w: int, h: int, radius: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    return m


def paint_ring(w: int, h: int, radius: int) -> Image.Image:
    ring = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    d.rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, outline=(255, 255, 255, 255), width=16)
    d.rounded_rectangle((14, 14, w - 15, h - 15), radius=max(12, radius - 12), outline=(78, 205, 224, 255), width=18)
    d.rounded_rectangle((30, 30, w - 31, h - 31), radius=max(10, radius - 24), outline=(186, 168, 230, 150), width=6)
    d.rounded_rectangle((36, 36, w - 37, h - 37), radius=max(8, radius - 30), outline=(255, 255, 255, 120), width=4)
    return ring


def fit_cover(im: Image.Image, tw: int, th: int) -> Image.Image:
    iw, ih = im.size
    scale = max(tw / iw, th / ih)
    nw, nh = max(1, round(iw * scale)), max(1, round(ih * scale))
    scaled = im.resize((nw, nh), Image.LANCZOS)
    x = (nw - tw) // 2
    y = (nh - th) // 2
    return scaled.crop((x, y, x + tw, y + th))


def fit_contain(im: Image.Image, tw: int, th: int) -> Image.Image:
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    copy = im.copy()
    copy.thumbnail((tw, th), Image.LANCZOS)
    canvas.alpha_composite(copy, dest=((tw - copy.size[0]) // 2, (th - copy.size[1]) // 2))
    return canvas


def layer(mask: Image.Image, color: tuple) -> Image.Image:
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def stamp_text(w: int, h: int, text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.02
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def draw_title(text: str, fill_top: tuple, fill_bot: tuple, outline: tuple) -> Image.Image:
    ss = 4
    w, h = 1680, 400
    font = ImageFont.truetype(PINGFANG, 210 * ss, index=8)
    body = stamp_text(w * ss, h * ss, text, font, 4 * ss)
    outline_m = stamp_text(w * ss, h * ss, text, font, 22 * ss)
    halo = stamp_text(w * ss, h * ss, text, font, 40 * ss)
    body = body.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.35))
    outline_m = outline_m.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.45))
    halo = halo.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop = halo.filter(ImageFilter.GaussianBlur(8))
    canvas.alpha_composite(layer(drop, (90, 80, 130, 50)), dest=(0, 8))
    canvas.alpha_composite(layer(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(layer(outline_m, outline), dest=(0, 5))
    canvas.alpha_composite(layer(outline_m, outline))
    fill = Image.new("RGBA", (1, h))
    fp = fill.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        fp[0, y] = tuple(int(fill_top[i] * (1 - t) + fill_bot[i] * t) for i in range(4))
    fill = fill.resize((w, h), Image.LANCZOS)
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    return canvas


def draw_sub(text: str) -> Image.Image:
    ss = 3
    w, h = 1200, 140
    font = ImageFont.truetype(PINGFANG, 52 * ss, index=8)
    body = stamp_text(w * ss, h * ss, text, font, 2 * ss)
    outline = stamp_text(w * ss, h * ss, text, font, 8 * ss)
    body = body.resize((w, h), Image.LANCZOS)
    outline = outline.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(layer(outline, (255, 255, 255, 230)))
    canvas.alpha_composite(layer(body, (92, 70, 52, 255)))
    return canvas


def punch_card(src: Path) -> Image.Image:
    rgb = Image.open(src).convert("RGB")
    return crop_opaque(flood_punch(rgb, is_key_blue), 4)


def punch_hero(src: Path) -> Image.Image:
    rgb = Image.open(src).convert("RGB")
    return crop_opaque(flood_punch(rgb, is_studio_gray), 2)


def punch_btn(src: Path) -> Image.Image:
    rgb = Image.open(src).convert("RGB")
    return crop_opaque(flood_punch(rgb, is_key_blue), 2)


def finish_panel(im: Image.Image) -> Image.Image:
    card = fit_cover(im, PANEL_W, PANEL_H)
    plate = Image.new("RGB", (PANEL_W, PANEL_H), (255, 248, 240))
    plate.paste(card.convert("RGB"), mask=card.split()[-1])
    plate = plate.filter(ImageFilter.UnsharpMask(radius=1.1, percent=130, threshold=2))
    out = plate.convert("RGBA")
    out.putalpha(round_mask(PANEL_W, PANEL_H, RADIUS))
    out = Image.alpha_composite(out, paint_ring(PANEL_W, PANEL_H, RADIUS))
    return out


def finish_btn(im: Image.Image) -> Image.Image:
    return fit_contain(im, BTN_W, BTN_H)


def draw_chrome() -> Image.Image:
    w, h = PANEL_W, PANEL_H
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pad = 10
    rw, rh = w - pad * 2, h - pad * 2
    r = RADIUS
    plate = round_mask(rw, rh, r)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste(layer(plate, (120, 110, 170, 70)), (pad + 8, pad + 22))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
    face = Image.new("RGBA", (rw, rh), (255, 248, 240, 255))
    hi = Image.new("RGBA", (1, rh))
    hp = hi.load()
    for y in range(rh):
        t = y / max(rh - 1, 1)
        hp[0, y] = (255, 255, 255, int(70 * (1 - t)))
    hi = hi.resize((rw, rh), Image.LANCZOS)
    face.alpha_composite(hi)
    face.putalpha(plate)
    card = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    card.alpha_composite(face)
    card = Image.alpha_composite(card, paint_ring(rw, rh, r))
    canvas.alpha_composite(card, dest=(pad, pad))
    return canvas


def assemble_hybrid(hero: Image.Image, title: str, sub: str, fill_top, fill_bot, outline) -> Image.Image:
    canvas = draw_chrome()
    tit = draw_title(title, fill_top, fill_bot, outline)
    canvas.alpha_composite(tit, dest=((PANEL_W - tit.size[0]) // 2, 70))
    sub_im = draw_sub(sub)
    canvas.alpha_composite(sub_im, dest=((PANEL_W - sub_im.size[0]) // 2, 430))
    h = hero.copy()
    h.thumbnail((1280, 1180), Image.LANCZOS)
    canvas.alpha_composite(h, dest=((PANEL_W - h.size[0]) // 2, 560))
    return canvas


def save(im: Image.Image, name: str) -> Image.Image:
    dest = OUT_DIR / f"{name}.png"
    im.save(dest, "PNG")
    write_meta(dest, UUID[name], *im.size)
    print("wrote", dest.name, im.size)
    return im


def preview(win: Image.Image, fail: Image.Image, nxt: Image.Image, retry: Image.Image, name: str) -> Path:
    canvas = Image.new("RGBA", (1080, 960), (36, 40, 58, 255))
    for i, (panel, btn) in enumerate(((win, nxt), (fail, retry))):
        p = panel.copy()
        p.thumbnail((430, 620), Image.LANCZOS)
        x = 70 + i * 520
        y = 70
        canvas.alpha_composite(p, dest=(x, y))
        b = btn.copy()
        b.thumbnail((250, 88), Image.LANCZOS)
        bx = x + (p.size[0] - b.size[0]) // 2
        by = y + p.size[1] - int(p.size[1] * 0.17) - b.size[1] // 2
        canvas.alpha_composite(b, dest=(bx, by))
    out = WORK / name
    canvas.convert("RGB").save(out)
    print("preview", out)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    for key, src in SRC.items():
        shutil.copy2(src, WORK / f"{key}-src.png")

    win_card = finish_panel(punch_card(SRC["panel-win"]))
    fail_card = finish_panel(punch_card(SRC["panel-fail"]))
    nxt = finish_btn(punch_btn(SRC["btn-win-next"]))
    retry = finish_btn(punch_btn(SRC["btn-fail-retry"]))
    hero_win = punch_hero(SRC["hero-win"])
    hero_fail = punch_hero(SRC["hero-fail"])
    hero_win.save(WORK / "hero-win.cut.png")
    hero_fail.save(WORK / "hero-fail.cut.png")

    hybrid_win = assemble_hybrid(
        hero_win, "胜利", "关卡完成",
        (255, 236, 120, 255), (255, 176, 48, 255), (36, 150, 168, 255),
    )
    hybrid_fail = assemble_hybrid(
        hero_fail, "失败", "再接再厉",
        (236, 255, 255, 255), (86, 196, 220, 255), (28, 108, 128, 255),
    )
    hybrid_win.save(WORK / "hybrid-win.png")
    hybrid_fail.save(WORK / "hybrid-fail.png")
    preview(win_card, fail_card, nxt, retry, "match-preview.png")
    preview(hybrid_win, hybrid_fail, nxt, retry, "hybrid-preview.png")

    # Ship the AI full cards: they already share title / hero / empty-bottom structure.
    save(win_card, "panel-win")
    save(fail_card, "panel-fail")
    save(nxt, "btn-win-next")
    save(retry, "btn-fail-retry")


if __name__ == "__main__":
    main()
