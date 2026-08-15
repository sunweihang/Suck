#!/usr/bin/env python3
"""Victory/fail popups: AI hero + portal rmbg-v2 alpha + vector chrome."""

import importlib.util
import os
import shutil
from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
PINGFANG = "/System/Library/Fonts/PingFang.ttc"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")
HERO = {
    "win": Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/hero-win-studio.png"),
    "fail": Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/hero-fail-studio.png"),
}

UUID = {
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "panel-fail": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e31",
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    "btn-fail-retry": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e32",
}

# 2x of runtime 920x1100 / 560x176
PANEL_W, PANEL_H = 1840, 2200
BTN_W, BTN_H = 1120, 400
CREAM = (254, 248, 239, 255)
MINT = (111, 224, 212, 255)
MINT_DEEP = (48, 168, 156, 255)
INK = (96, 58, 36, 255)


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


def ss_round_mask(w: int, h: int, r: int, ss: int = 8) -> Image.Image:
    mw, mh, mr = w * ss, h * ss, r * ss
    m = Image.new("L", (mw, mh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, mw - 1, mh - 1), radius=mr, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def stadium_mask(w: int, h: int, ss: int = 8) -> Image.Image:
    mw, mh = w * ss, h * ss
    m = Image.new("L", (mw, mh), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 0, mh - 1, mh - 1), fill=255)
    d.ellipse((mw - mh, 0, mw - 1, mh - 1), fill=255)
    d.rectangle((mh // 2, 0, mw - mh // 2, mh - 1), fill=255)
    return m.resize((w, h), Image.LANCZOS)


def mask_ring(outer: Image.Image, inset: int, inner_r: int, ss: int = 8) -> Image.Image:
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


def draw_title(text: str) -> Image.Image:
    ss = 4
    w, h = 1600, 400
    font = ImageFont.truetype(PINGFANG, 200 * ss, index=8)
    body = stamp_text(w * ss, h * ss, text, font, 4 * ss)
    outline = stamp_text(w * ss, h * ss, text, font, 22 * ss)
    halo = stamp_text(w * ss, h * ss, text, font, 38 * ss)
    body = body.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.35))
    outline = outline.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.4))
    halo = halo.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.55))
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    drop = halo.filter(ImageFilter.GaussianBlur(8))
    canvas.alpha_composite(layer(drop, (80, 48, 28, 50)), dest=(0, 8))
    canvas.alpha_composite(layer(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(layer(outline, MINT_DEEP), dest=(0, 4))
    canvas.alpha_composite(layer(outline, (62, 196, 184, 255)))
    fill = vgrad(w, h, (255, 252, 236, 255), (255, 228, 150, 255))
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    return canvas


def draw_sub(text: str) -> Image.Image:
    ss = 3
    w, h = 1100, 130
    font = ImageFont.truetype(PINGFANG, 50 * ss, index=8)
    body = stamp_text(w * ss, h * ss, text, font, 2 * ss)
    outline = stamp_text(w * ss, h * ss, text, font, 8 * ss)
    body = body.resize((w, h), Image.LANCZOS)
    outline = outline.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(layer(outline, (255, 255, 255, 230)))
    canvas.alpha_composite(layer(body, INK))
    return canvas


def load_rmbg_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def portal_cut(src: Path, cache: Path) -> Image.Image:
    """Portal RMBG-2.0, then un-premultiply studio gray out of the fringe."""
    if cache.exists():
        print("reuse", cache.name)
        cut = Image.open(cache).convert("RGBA")
    else:
        Client = load_rmbg_client()

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
        cut = None
        for base in PORTALS:
            if not base:
                continue
            print("portal rmbg", base, src.name, flush=True)
            try:
                cut = Sharp(base=base).remove_background(src)
                break
            except Exception as err:
                last = err
                print("  fail", base, err, flush=True)
        if cut is None:
            raise RuntimeError(f"portal rmbg failed: {last}")
        cut.save(cache, "PNG")
        print("  rmbg", cut.size, "bbox", cut.getbbox(), "corner_a", cut.getpixel((0, 0))[3], flush=True)

    # Portal RGBA + un-premultiply against the flat studio gray.
    src_rgb = Image.open(src).convert("RGB")
    bg = src_rgb.getpixel((2, 2))
    cut = decontaminate(cut, bg)
    box = cut.getbbox()
    if not box:
        raise RuntimeError(f"empty portal cut {src.name}")
    x0, y0, x1, y1 = box
    pad = 8
    return cut.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(cut.size[0], x1 + pad),
        min(cut.size[1], y1 + pad),
    ))


def decontaminate(im: Image.Image, bg: Tuple[int, int, int]) -> Image.Image:
    arr = np.array(im).astype(np.float32)
    a = arr[:, :, 3:4] / 255.0
    rgb = arr[:, :, :3]
    back = np.array(bg, dtype=np.float32)
    mask = (a[:, :, 0] > 0.02) & (a[:, :, 0] < 0.97)
    fg = (rgb - (1.0 - a) * back) / np.clip(a, 1e-4, 1.0)
    rgb[mask] = np.clip(fg[mask], 0, 255)
    arr[:, :, :3] = rgb
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def prepare_hero(kind: str) -> Image.Image:
    src = HERO[kind]
    WORK.mkdir(parents=True, exist_ok=True)
    local = WORK / f"hero-{kind}-studio.png"
    shutil.copy2(src, local)
    return portal_cut(local, WORK / f"hero-{kind}.rmbg.png")


def draw_panel(kind: str) -> Image.Image:
    w, h = PANEL_W, PANEL_H
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pad = 48
    x0, y0 = pad, pad
    rw, rh = w - pad * 2, h - pad * 2
    r = 168

    plate = ss_round_mask(rw, rh, r, 8)
    mint_m = ss_round_mask(rw - 16, rh - 16, r - 8, 8)
    face_m = ss_round_mask(rw - 56, rh - 56, r - 28, 8)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste(layer(plate, (80, 48, 28, 55)), (x0 + 6, y0 + 18))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))

    card = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    card.alpha_composite(layer(plate, (255, 255, 255, 255)))
    mint_layer = layer(mint_m, MINT)
    tmp = Image.new("RGBA", (rw, rh), (0, 0, 0, 0))
    tmp.paste(mint_layer, (8, 8), mint_layer)
    card.alpha_composite(tmp)
    face = Image.new("RGBA", face_m.size, CREAM)
    face.putalpha(face_m)
    card.alpha_composite(face, dest=(28, 28))
    canvas.alpha_composite(card, dest=(x0, y0))

    title = draw_title("胜利" if kind == "win" else "失败")
    canvas.alpha_composite(title, dest=((w - title.size[0]) // 2, 70))
    sub = draw_sub("关卡完成" if kind == "win" else "再接再厉")
    canvas.alpha_composite(sub, dest=((w - sub.size[0]) // 2, 400))

    hero = prepare_hero(kind)
    hero.thumbnail((1280, 1120), Image.LANCZOS)
    canvas.alpha_composite(hero, dest=((w - hero.size[0]) // 2, 520))
    return canvas


def _stamp(canvas: Image.Image, mask: Image.Image, color, xy: Tuple[int, int]) -> None:
    layer_im = layer(mask, color)
    tmp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    tmp.paste(layer_im, xy, layer_im)
    canvas.alpha_composite(tmp)


def draw_play_btn(text: str) -> Image.Image:
    ss = 8
    w, h = BTN_W * ss, BTN_H * ss
    # visual pill; keep 2r == h so ends stay circular
    bh = 196 * ss
    bw = 980 * ss
    x0 = (w - bw) // 2
    y0 = (h - bh) // 2
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def stad(pw: int, ph: int) -> Image.Image:
        return stadium_mask(pw, ph, 1)

    white_pad, mint_pad, ink_pad = 10 * ss, 22 * ss, 6 * ss
    white_m = stad(bw + white_pad * 2 + mint_pad * 2, bh + white_pad * 2 + mint_pad * 2)
    mint_m = stad(bw + mint_pad * 2, bh + mint_pad * 2)
    ink_m = stad(bw + ink_pad * 2, bh + ink_pad * 2)
    body_m = stad(bw, bh)

    _stamp(canvas, white_m, (255, 255, 255, 255), (x0 - mint_pad - white_pad, y0 - mint_pad - white_pad))
    _stamp(canvas, mint_m, MINT, (x0 - mint_pad, y0 - mint_pad))
    _stamp(canvas, ink_m, (214, 96, 36, 255), (x0 - ink_pad, y0 - ink_pad))
    fill = vgrad(bw, bh, (255, 236, 118, 255), (255, 148, 48, 255))
    fill.putalpha(body_m)
    tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tmp.paste(fill, (x0, y0), fill)
    canvas.alpha_composite(tmp)

    gloss = Image.new("L", (bw, bh), 0)
    gd = ImageDraw.Draw(gloss)
    gd.ellipse((int(bw * 0.10), int(bh * 0.16), int(bw * 0.22), int(bh * 0.36)), fill=220)
    gd.ellipse((int(bw * 0.24), int(bh * 0.20), int(bw * 0.30), int(bh * 0.32)), fill=200)
    gloss = gloss.filter(ImageFilter.GaussianBlur(4 * ss))
    gcol = layer(gloss, (255, 255, 255, 170))
    gtmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gtmp.paste(gcol, (x0, y0), gcol)
    canvas.alpha_composite(gtmp)

    font = ImageFont.truetype(PINGFANG, 78 * ss, index=8)
    body = stamp_text(w, h, text, font, 2 * ss)
    outline = stamp_text(w, h, text, font, 8 * ss)
    canvas.alpha_composite(layer(outline, (140, 64, 20, 255)), dest=(0, 3 * ss))
    canvas.alpha_composite(layer(outline, (140, 64, 20, 255)))
    canvas.alpha_composite(layer(body, (255, 248, 230, 255)))
    return canvas.resize((BTN_W, BTN_H), Image.LANCZOS)


def preview(win: Image.Image, fail: Image.Image, nxt: Image.Image, retry: Image.Image) -> None:
    canvas = Image.new("RGBA", (1080, 960), (40, 44, 62, 255))
    for i, (panel, btn) in enumerate(((win, nxt), (fail, retry))):
        p = panel.copy()
        p.thumbnail((430, 560), Image.LANCZOS)
        x = 70 + i * 520
        y = 90
        canvas.alpha_composite(p, dest=(x, y))
        b = btn.copy()
        b.thumbnail((250, 90), Image.LANCZOS)
        canvas.alpha_composite(b, dest=(x + (p.size[0] - b.size[0]) // 2, y + p.size[1] - 108))
    WORK.mkdir(parents=True, exist_ok=True)
    out = WORK / "match-preview.png"
    canvas.convert("RGB").save(out)
    print("preview", out)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    win = draw_panel("win")
    fail = draw_panel("fail")
    nxt = draw_play_btn("下一关")
    retry = draw_play_btn("再试一次")
    save(win, "panel-win")
    save(fail, "panel-fail")
    save(nxt, "btn-win-next")
    save(retry, "btn-fail-retry")
    preview(win, fail, nxt, retry)


if __name__ == "__main__":
    main()
