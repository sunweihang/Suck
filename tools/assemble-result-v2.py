#!/usr/bin/env python3
"""Rebuild win/fail cards: keep titles intact, fill the plate with dreamy scene art."""

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
    "panel-win": SRC_DIR / "result-win-panel-v2.png",
    "panel-fail": SRC_DIR / "result-fail-panel-v2.png",
    "scene-win": SRC_DIR / "result-win-scene.png",
    "scene-fail": SRC_DIR / "result-fail-scene.png",
    "hero-win": WORK / "hero-win.cut.png",
    "hero-fail": WORK / "hero-fail.cut.png",
    "btn-win-next": OUT_DIR / "btn-win-next.png",
    "btn-fail-retry": OUT_DIR / "btn-fail-retry.png",
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
MINT = (78, 214, 204, 255)
MINT_DEEP = (28, 148, 148, 255)


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
    walk = [[pred(*px[x, y]) for x in range(w)] for y in range(h)]
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
    if b < 170:
        return False
    if b - r < 90 or b - g < 50:
        return False
    return r < 120 and g < 170


def crop_opaque(im: Image.Image, pad: int = 8) -> Image.Image:
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
    d.rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, outline=(255, 255, 255, 255), width=18)
    d.rounded_rectangle((16, 16, w - 17, h - 17), radius=max(12, radius - 14), outline=(78, 205, 224, 255), width=20)
    d.rounded_rectangle((34, 34, w - 35, h - 35), radius=max(10, radius - 28), outline=(255, 255, 255, 140), width=5)
    return ring


def fit_width_keep_top(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale to target width, then pad or crop from the BOTTOM only."""
    iw, ih = im.size
    nh = max(2, round(ih * tw / iw))
    scaled = im.resize((tw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    if nh >= th:
        canvas.paste(scaled.crop((0, 0, tw, th)), (0, 0))
    else:
        canvas.paste(scaled, (0, 0))
        tail = scaled.crop((0, max(0, nh - 8), tw, nh)).resize((tw, th - nh), Image.LANCZOS)
        canvas.paste(tail, (0, nh))
    return canvas


def fit_cover(im: Image.Image, tw: int, th: int) -> Image.Image:
    iw, ih = im.size
    scale = max(tw / iw, th / ih)
    nw, nh = max(1, round(iw * scale)), max(1, round(ih * scale))
    scaled = im.resize((nw, nh), Image.LANCZOS)
    x = (nw - tw) // 2
    y = max(0, (nh - th) // 2 - 40)
    return scaled.crop((x, y, x + tw, y + th))


def layer(mask: Image.Image, color: tuple) -> Image.Image:
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def stamp_text(w: int, h: int, text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.04
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def vgrad(w: int, h: int, top: tuple, bot: tuple) -> Image.Image:
    g = Image.new("RGBA", (1, h))
    px = g.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(4))
    return g.resize((w, h), Image.LANCZOS)


def sparkle(size: int) -> Image.Image:
    im = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(im)
    c = size // 2
    d.polygon([(c, 0), (c + 2, c - 2), (size - 1, c), (c + 2, c + 2), (c, size - 1), (c - 2, c + 2), (0, c), (c - 2, c - 2)], fill=255)
    return im.filter(ImageFilter.GaussianBlur(0.8))


def draw_title(text: str, fill_top: tuple, fill_bot: tuple) -> Image.Image:
    """Home-title candy sticker: glossy fill, mint extrusion, fat white halo."""
    ss = 5
    w, h = 1680, 420
    font = ImageFont.truetype(PINGFANG, 210 * ss, index=8)
    body = stamp_text(w * ss, h * ss, text, font, 5 * ss)
    mid = stamp_text(w * ss, h * ss, text, font, 20 * ss)
    outline_m = stamp_text(w * ss, h * ss, text, font, 28 * ss)
    halo = stamp_text(w * ss, h * ss, text, font, 46 * ss)
    body = body.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.25))
    mid = mid.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.3))
    outline_m = outline_m.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.35))
    halo = halo.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop = halo.filter(ImageFilter.GaussianBlur(12))
    canvas.alpha_composite(layer(drop, (90, 70, 130, 50)), dest=(0, 12))
    canvas.alpha_composite(layer(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(layer(outline_m, MINT_DEEP), dest=(0, 8))
    canvas.alpha_composite(layer(outline_m, MINT))
    canvas.alpha_composite(layer(mid, (255, 255, 255, 230)))
    fill = vgrad(w, h, fill_top, fill_bot)
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    gloss = Image.new("L", (w, h), 0)
    gp = gloss.load()
    bp = body.load()
    for y in range(int(h * 0.42)):
        a = int(150 * (1 - y / max(h * 0.42, 1)))
        for x in range(w):
            if bp[x, y] > 40:
                gp[x, y] = a
    gloss = gloss.filter(ImageFilter.GaussianBlur(1.2))
    canvas.alpha_composite(layer(gloss, (255, 255, 255, 255)))
    star = sparkle(46)
    for x, y, s in ((70, 70, 46), (1580, 90, 36), (120, 300, 28), (1540, 280, 32)):
        sp = star.resize((s, s), Image.LANCZOS)
        canvas.alpha_composite(layer(sp, (255, 255, 255, 220)), dest=(x, y))
    return canvas


def stadium_mask(w: int, h: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 0, h - 1, h - 1), fill=255)
    d.ellipse((w - h, 0, w - 1, h - 1), fill=255)
    d.rectangle((h // 2, 0, w - h // 2, h - 1), fill=255)
    return m


def draw_candy_btn(text: str) -> Image.Image:
    """Supersampled play-button candy pill. Soft outer glow, no hard crop."""
    ss = 8
    w, h = BTN_W * ss, BTN_H * ss
    bh = 176 * ss
    bw = 920 * ss
    x0 = (w - bw) // 2
    y0 = (h - bh) // 2
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def stad(pw: int, ph: int) -> Image.Image:
        return stadium_mask(pw, ph)

    glow_pad, white_pad, mint_pad, lip = 18 * ss, 8 * ss, 22 * ss, 6 * ss
    glow_m = stad(bw + (glow_pad + white_pad + mint_pad) * 2, bh + (glow_pad + white_pad + mint_pad) * 2)
    white_m = stad(bw + (white_pad + mint_pad) * 2, bh + (white_pad + mint_pad) * 2)
    mint_m = stad(bw + mint_pad * 2, bh + mint_pad * 2)
    lip_m = stad(bw + lip * 2, bh + lip * 2)
    body_m = stad(bw, bh)
    glow_m = glow_m.filter(ImageFilter.GaussianBlur(5 * ss))
    white_m = white_m.filter(ImageFilter.GaussianBlur(0.9 * ss))

    def stamp(mask: Image.Image, color: tuple, xy: tuple) -> None:
        tmp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        tmp.paste(layer(mask, color), xy, layer(mask, color))
        canvas.alpha_composite(tmp)

    stamp(glow_m, (255, 255, 255, 90), (x0 - mint_pad - white_pad - glow_pad, y0 - mint_pad - white_pad - glow_pad))
    stamp(white_m, (255, 255, 255, 255), (x0 - mint_pad - white_pad, y0 - mint_pad - white_pad))
    stamp(mint_m, MINT, (x0 - mint_pad, y0 - mint_pad))
    stamp(lip_m, (214, 96, 36, 255), (x0 - lip, y0 - lip))
    fill = vgrad(bw, bh, (255, 236, 118, 255), (255, 148, 48, 255))
    fill.putalpha(body_m)
    tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tmp.paste(fill, (x0, y0), fill)
    canvas.alpha_composite(tmp)

    gloss = Image.new("L", (bw, bh), 0)
    gd = ImageDraw.Draw(gloss)
    gd.ellipse((int(bw * 0.10), int(bh * 0.16), int(bw * 0.22), int(bh * 0.36)), fill=230)
    gd.ellipse((int(bw * 0.24), int(bh * 0.20), int(bw * 0.30), int(bh * 0.32)), fill=210)
    gloss = gloss.filter(ImageFilter.GaussianBlur(4 * ss))
    gtmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gtmp.paste(layer(gloss, (255, 255, 255, 175)), (x0, y0), layer(gloss, (255, 255, 255, 175)))
    canvas.alpha_composite(gtmp)

    font = ImageFont.truetype(PINGFANG, 74 * ss, index=8)
    body = stamp_text(w, h, text, font, 2 * ss)
    outline = stamp_text(w, h, text, font, 8 * ss)
    canvas.alpha_composite(layer(outline, (140, 64, 20, 255)), dest=(0, 3 * ss))
    canvas.alpha_composite(layer(outline, (140, 64, 20, 255)))
    canvas.alpha_composite(layer(body, (255, 248, 230, 255)))
    return canvas.resize((BTN_W, BTN_H), Image.LANCZOS)


def clip_card(im: Image.Image) -> Image.Image:
    out = im.convert("RGBA")
    out.putalpha(round_mask(PANEL_W, PANEL_H, RADIUS))
    return Image.alpha_composite(out, paint_ring(PANEL_W, PANEL_H, RADIUS))


def finish_ai_card(src: Path) -> Image.Image:
    rgb = Image.open(src).convert("RGB")
    punched = crop_opaque(flood_punch(rgb, is_key_blue), 10)
    fitted = fit_width_keep_top(punched, PANEL_W, PANEL_H)
    plate = Image.new("RGB", (PANEL_W, PANEL_H), (255, 244, 236))
    plate.paste(fitted.convert("RGB"), mask=fitted.split()[-1])
    plate = plate.filter(ImageFilter.UnsharpMask(radius=1.0, percent=120, threshold=2))
    return clip_card(plate.convert("RGBA"))


def assemble_scene(scene_src: Path, hero_src: Path, title: str, fills) -> Image.Image:
    scene = fit_cover(Image.open(scene_src).convert("RGBA"), PANEL_W, PANEL_H)
    canvas = Image.new("RGBA", (PANEL_W, PANEL_H), (0, 0, 0, 0))
    canvas.alpha_composite(scene)

    top_veil = Image.new("RGBA", (PANEL_W, 560), (255, 250, 244, 0))
    tp = top_veil.load()
    for y in range(560):
        a = 120 if y < 360 else int(120 * (1 - (y - 360) / 200))
        for x in range(PANEL_W):
            tp[x, y] = (255, 250, 244, a)
    canvas.alpha_composite(top_veil, dest=(0, 0))

    bot_h = 520
    bot_veil = Image.new("RGBA", (PANEL_W, bot_h), (255, 248, 240, 0))
    bp = bot_veil.load()
    for y in range(bot_h):
        a = int(165 * (y / max(bot_h - 1, 1)) ** 1.35)
        for x in range(PANEL_W):
            bp[x, y] = (255, 248, 240, a)
    canvas.alpha_composite(bot_veil, dest=(0, PANEL_H - bot_h))

    tit = draw_title(title, *fills)
    canvas.alpha_composite(tit, dest=((PANEL_W - tit.size[0]) // 2, 96))

    hero = Image.open(hero_src).convert("RGBA")
    hero.thumbnail((1280, 1180), Image.LANCZOS)
    canvas.alpha_composite(hero, dest=((PANEL_W - hero.size[0]) // 2, 500))
    return clip_card(canvas)


def preview(win: Image.Image, fail: Image.Image, nxt: Image.Image, retry: Image.Image, name: str) -> Path:
    phone_w, phone_h = 540, 960
    canvas = Image.new("RGBA", (phone_w * 2 + 24, phone_h), (28, 32, 48, 255))
    for i, (panel, btn) in enumerate(((win, nxt), (fail, retry))):
        frame = Image.new("RGBA", (phone_w, phone_h), (28, 32, 48, 255))
        p = panel.copy()
        p.thumbnail((430, 560), Image.LANCZOS)
        px = (phone_w - p.size[0]) // 2
        py = 140
        frame.alpha_composite(p, dest=(px, py))
        b = btn.copy()
        b.thumbnail((240, 80), Image.LANCZOS)
        frame.alpha_composite(b, dest=((phone_w - b.size[0]) // 2, py + p.size[1] - int(p.size[1] * 0.17) - b.size[1] // 2))
        canvas.alpha_composite(frame, dest=(i * (phone_w + 24), 0))
    out = WORK / name
    canvas.convert("RGB").save(out)
    print("preview", out)
    return out


def save(im: Image.Image, name: str) -> Image.Image:
    dest = OUT_DIR / f"{name}.png"
    im.save(dest, "PNG")
    write_meta(dest, UUID[name], *im.size)
    print("wrote", dest.name, im.size)
    return im


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC["panel-win"], WORK / "panel-win-v2-src.png")
    shutil.copy2(SRC["panel-fail"], WORK / "panel-fail-v2-src.png")
    shutil.copy2(SRC["scene-win"], WORK / "scene-win-src.png")
    shutil.copy2(SRC["scene-fail"], WORK / "scene-fail-src.png")

    ai_win = finish_ai_card(SRC["panel-win"])
    ai_fail = finish_ai_card(SRC["panel-fail"])
    hy_win = assemble_scene(
        SRC["scene-win"], SRC["hero-win"], "胜利",
        ((255, 248, 210, 255), (255, 196, 64, 255)),
    )
    hy_fail = assemble_scene(
        SRC["scene-fail"], SRC["hero-fail"], "失败",
        ((255, 255, 255, 255), (186, 244, 255, 255)),
    )
    nxt = draw_candy_btn("下一关")
    retry = draw_candy_btn("再试一次")
    preview(ai_win, ai_fail, nxt, retry, "v2-ai-preview.png")
    preview(hy_win, hy_fail, nxt, retry, "v2-hybrid-preview.png")
    ai_win.save(WORK / "v2-ai-win.png")
    ai_fail.save(WORK / "v2-ai-fail.png")
    hy_win.save(WORK / "v2-hybrid-win.png")
    hy_fail.save(WORK / "v2-hybrid-fail.png")

    save(hy_win, "panel-win")
    save(hy_fail, "panel-fail")
    save(nxt, "btn-win-next")
    save(retry, "btn-fail-retry")


if __name__ == "__main__":
    main()
