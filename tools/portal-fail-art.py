#!/usr/bin/env python3
"""Portal Klein dewatermark + rmbg-v2 for the fail popup."""

import importlib.util
import os
from collections import deque
from pathlib import Path
from typing import Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

os.environ.setdefault("RMBG_PORTAL_URL", "http://10.1.4.130:8080")
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tools/ai-fail"
OUT_DIR = ROOT / "assets/resources/ui"
DEWATER = Path("/Users/Custom/CartoonGame/scripts/dewatermark-portal-client.py")
RMBG = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
SRC_PANEL = Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (6).png")
PINGFANG = "/System/Library/Fonts/PingFang.ttc"
BLUE = (12, 70, 136)

UUID = {
    "panel-fail": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e31",
    "btn-fail-retry": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e32",
}


def load_mod(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


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


def save_asset(im: Image.Image, name: str) -> Image.Image:
    path = OUT_DIR / f"{name}.png"
    im.save(path, "PNG")
    write_meta(path, UUID[name], *im.size)
    print("wrote", path.name, im.size, flush=True)
    return im


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


def paint_outer_white(im: Image.Image, fill: Tuple[int, int, int] = BLUE) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    walk = Image.new("1", (w, h), 0)
    wp = walk.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            if mn >= 232 and (mx - mn) < 18:
                wp[x, y] = 1
    seen = Image.new("1", (w, h), 0)
    sp = seen.load()
    q = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if wp[x, y] and not sp[x, y]:
            sp[x, y] = 1
            q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and wp[nx, ny] and not sp[nx, ny]:
                sp[nx, ny] = 1
                q.append((nx, ny))
    out = rgb.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if sp[x, y]:
                op[x, y] = fill
    return out


def lerp(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(len(a)))


def vgrad(w, h, top, bot):
    g = Image.new("RGBA", (1, h))
    px = g.load()
    for y in range(h):
        px[0, y] = lerp(top, bot, y / max(h - 1, 1))
    return g.resize((w, h), Image.LANCZOS)


def layer(mask, color):
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def stamp_text(w, h, text, font, stroke):
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.01
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def draw_retry_on_blue() -> Image.Image:
    """Mint 重新开始 pill on portal-blue so RMBG keeps a soft edge."""
    ss = 4
    w, h = 1400 * ss, 520 * ss
    canvas = Image.new("RGB", (w, h), BLUE)
    bw, bh = 1180 * ss, 320 * ss
    x0, y0 = (w - bw) // 2, (h - bh) // 2
    r = bh // 2

    def stadium(pw, ph):
        m = Image.new("L", (pw, ph), 0)
        d = ImageDraw.Draw(m)
        d.ellipse((0, 0, ph - 1, ph - 1), fill=255)
        d.ellipse((pw - ph, 0, pw - 1, ph - 1), fill=255)
        d.rectangle((ph // 2, 0, pw - ph // 2, ph - 1), fill=255)
        return m

    rim = 18 * ss
    white = stadium(bw + rim * 2, bh + rim * 2)
    pill = stadium(bw, bh)
    plate = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    plate.paste(layer(white, (255, 255, 255, 255)), (x0 - rim, y0 - rim))
    plate.paste(layer(pill, (42, 128, 122, 255)), (x0, y0))
    inset_w, inset_h = bw - 20 * ss, bh - 20 * ss
    inset = stadium(inset_w, inset_h)
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
    font = ImageFont.truetype(PINGFANG, 108 * ss, index=8)
    body = stamp_text(w, h, "重新开始", font, 3 * ss)
    outline = stamp_text(w, h, "重新开始", font, 12 * ss)
    plate.alpha_composite(layer(outline, (42, 128, 122, 255)), dest=(0, 3 * ss))
    plate.alpha_composite(layer(outline, (42, 128, 122, 255)))
    plate.alpha_composite(layer(body, (255, 255, 255, 255)))
    out = Image.new("RGB", (w, h), BLUE)
    out.paste(plate, (0, 0), plate)
    return out.resize((1400, 520), Image.LANCZOS)


def preview(panel: Image.Image, btn: Image.Image) -> None:
    canvas = Image.new("RGBA", (540, 960), (40, 36, 56, 255))
    p = panel.copy()
    p.thumbnail((430, 620), Image.LANCZOS)
    canvas.alpha_composite(p, dest=(270 - p.size[0] // 2, 80))
    b = btn.copy()
    b.thumbnail((250, 90), Image.LANCZOS)
    y = 80 + p.size[1] - 128
    canvas.alpha_composite(b, dest=(270 - b.size[0] // 2, y))
    out = WORK / "fail-portal-preview.png"
    canvas.convert("RGB").save(out)
    print("preview", out, flush=True)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rb = load_mod(RMBG, "rmbg")

    src_copy = WORK / "panel-fail-src.png"
    Image.open(SRC_PANEL).convert("RGB").save(src_copy, "PNG")

    # 豆包在卡外白底上；铺蓝后直接门户抠，不去水印（Klein 会压到 1024 还啃角）。
    staged = paint_outer_white(Image.open(src_copy))
    staged_path = WORK / "panel-fail.blue.png"
    staged.save(staged_path, "PNG")
    print(f"  staged blue canvas {staged.size} corner={staged.getpixel((0, 0))}", flush=True)

    print("rmbg panel-fail", flush=True)
    cut = rb.remove_background(staged_path)
    cut_path = WORK / "panel-fail.rmbg.png"
    cut.save(cut_path, "PNG")
    print(f"  rmbg {cut.size} bbox={cut.getbbox()} corner={cut.getpixel((0, 0))[3]}", flush=True)
    panel = trim_alpha(cut, 10)
    save_asset(panel, "panel-fail")

    btn_src = WORK / "btn-fail-retry-src.png"
    draw_retry_on_blue().save(btn_src, "PNG")
    print("rmbg btn-fail-retry", flush=True)
    btn_cut = rb.remove_background(btn_src)
    btn_cut.save(WORK / "btn-fail-retry.rmbg.png", "PNG")
    print(f"  rmbg {btn_cut.size} bbox={btn_cut.getbbox()} corner={btn_cut.getpixel((0, 0))[3]}", flush=True)
    btn = trim_alpha(btn_cut, 8)
    save_asset(btn, "btn-fail-retry")

    preview(panel, btn)


if __name__ == "__main__":
    main()
