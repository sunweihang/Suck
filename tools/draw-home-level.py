#!/usr/bin/env python3
"""Play HUD glass badge: portal rmbg alpha + native 2048 RGB + purple digits."""

import importlib.util
import os
from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
SRC = Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (2).png")
AI_GLASS = ROOT / "tools/ai-level/ai-level-glass.png"
AI_GLASS_V2 = ROOT / "tools/ai-level/ai-level-glass-v2.png"
AI_DIGITS = ROOT / "tools/ai-level/ai-level-digits.png"
FILLED = ROOT / "tools/ai-level/level-home-filled.png"
BLUE = (12, 70, 136)
FONT = ROOT / "tools/fonts/Baloo2-ExtraBold.ttf"
PINGFANG = "/System/Library/Fonts/PingFang.ttc"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)

# darker than the design close-up so digits stay readable on pale glass
FILL_TOP = (226, 198, 255, 255)
FILL_MID = (168, 128, 230, 255)
FILL_BOT = (98, 62, 176, 255)
STROKE = (138, 108, 196, 255)
HIGHLIGHT = (255, 250, 255, 255)
HALO = (255, 255, 255, 255)

CELL = 512

UUID = {
    "level-home": "c8d1a4e2-7b19-4f06-9c3a-55e8b0d12a60",
    **{f"lvh-{n}": f"c8d1a4e2-7b19-4f06-9c3a-55e8b0d12b0{n}" for n in range(10)},
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
    "redirect": "{uuid}@6c48a",
    "compressSettings": {{
      "useCompressTexture": false
    }}
  }}
}}
""",
        encoding="utf-8",
    )


def soft_mask(mask: Image.Image, radius: float = 0) -> Image.Image:
    if radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=radius))
    return mask


def stamp_text(size: int, ch: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), ch, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (size - tw) / 2 - bb[0]
    y = (size - th) / 2 - bb[1] + size * 0.02
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).text((x, y), ch, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def layer(mask: Image.Image, color: Tuple[int, int, int, int]) -> Image.Image:
    im = Image.new("RGBA", mask.size, color)
    im.putalpha(mask)
    return im


def gradient_fill(mask: Image.Image) -> Image.Image:
    w, h = mask.size
    grad = Image.new("RGBA", (1, h))
    px = grad.load()
    for y in range(h):
        t = y / float(max(h - 1, 1))
        if t < 0.42:
            u = t / 0.42
            c = tuple(int(FILL_TOP[i] * (1 - u) + FILL_MID[i] * u) for i in range(4))
        else:
            u = (t - 0.42) / 0.58
            c = tuple(int(FILL_MID[i] * (1 - u) + FILL_BOT[i] * u) for i in range(4))
        px[0, y] = c
    fill = grad.resize((w, h), Image.BILINEAR)
    fill.putalpha(mask)
    return fill


def hole_mask(body: Image.Image) -> Image.Image:
    empty = body.point(lambda p: 0 if p else 255)
    rgb = Image.merge("RGB", (empty, empty, empty))
    for pt in ((0, 0), (body.size[0] - 1, 0), (0, body.size[1] - 1), (body.size[0] - 1, body.size[1] - 1)):
        ImageDraw.floodfill(rgb, pt, (0, 0, 0))
    return rgb.split()[0]


def shrink_holes(holes: Image.Image, rim: int) -> Image.Image:
    """Erode counters by rim px. Caps so small 4/8 holes stay open."""
    if holes.getbbox() is None or rim <= 0:
        return holes
    box = holes.getbbox()
    span = min(box[2] - box[0], box[3] - box[1])
    rim = min(int(rim), max(2, span // 4))
    arr = np.array(holes) > 0
    yy, xx = np.ogrid[-rim : rim + 1, -rim : rim + 1]
    inner = ndimage.binary_erosion(arr, structure=(xx * xx + yy * yy <= rim * rim))
    return Image.fromarray((inner.astype(np.uint8) * 255), "L")


def hole_ring(holes: Image.Image, rim: int) -> Image.Image:
    """White stroke that follows the inner path of 0/4/6/8/9."""
    inner = shrink_holes(holes, rim)
    ring = np.where((np.array(holes) > 0) & (np.array(inner) == 0), 255, 0)
    return Image.fromarray(ring.astype(np.uint8), "L")


def clear_hole_interior(mask: Image.Image, holes: Image.Image, rim: int) -> Image.Image:
    """Punch counters but keep an inner rim so 0/4/6/8/9 keep a white edge."""
    inner = shrink_holes(holes, rim)
    if inner.getbbox() is None:
        return mask
    arr = np.array(mask)
    arr[np.array(inner) > 0] = 0
    return Image.fromarray(arr, "L")


def edge(mask: Image.Image, dx: int, dy: int) -> Image.Image:
    shifted = Image.new("L", mask.size, 0)
    shifted.paste(mask, (dx, dy))
    a = np.array(mask)
    s = np.array(shifted)
    return Image.fromarray(np.where((a > 0) & (s == 0), a, 0).astype(np.uint8), "L")


def resize_rgba(im: Image.Image, size: Tuple[int, int]) -> Image.Image:
    """LANCZOS downsample with premultiplied alpha so white strokes stay white."""
    arr = np.array(im, dtype=np.float32)
    alpha = arr[:, :, 3:4] / 255.0
    arr[:, :, :3] *= alpha
    premul = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    small = premul.resize(size, Image.LANCZOS)
    out = np.array(small, dtype=np.float32)
    a = out[:, :, 3:4]
    rgb = np.where(a > 0, out[:, :, :3] * 255.0 / np.maximum(a, 1.0), 255)
    out[:, :, :3] = rgb
    out[:, :, 3] = a[:, :, 0]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def bleed_rgb(im: Image.Image, steps: int = 8) -> Image.Image:
    """Push visible RGB into transparent pixels so linear filter cannot pick up black."""
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    known = arr[:, :, 3] > 16
    for _ in range(steps):
        nxt = rgb.copy()
        nxt_k = known.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            src_k = np.roll(np.roll(known, dy, 0), dx, 1)
            src_c = np.roll(np.roll(rgb, dy, 0), dx, 1)
            if dy < 0:
                src_k[dy:, :] = False
            elif dy > 0:
                src_k[:dy, :] = False
            if dx < 0:
                src_k[:, dx:] = False
            elif dx > 0:
                src_k[:, :dx] = False
            take = (~nxt_k) & src_k
            nxt[take] = src_c[take]
            nxt_k |= take
        rgb, known = nxt, nxt_k
    arr[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def rounded_mask(size: Tuple[int, int], box: Tuple[int, int, int, int], radius: int) -> Image.Image:
    im = Image.new("L", size, 0)
    ImageDraw.Draw(im).rounded_rectangle(box, radius=max(1, radius), fill=255)
    return im


def ring_mask(outer: Image.Image, inner: Image.Image) -> Image.Image:
    a = np.array(outer, dtype=np.int16)
    b = np.array(inner, dtype=np.int16)
    return Image.fromarray(np.clip(a - b, 0, 255).astype(np.uint8), "L")


def title_glyph(ch: str, cell: int) -> Image.Image:
    """One bubble Chinese glyph. Blue fill, white rim, punched counters."""
    font = ImageFont.truetype(PINGFANG, int(cell * 0.58), index=8)
    fat = max(2, int(cell * 0.028))
    body = soft_mask(stamp_text(cell, ch, font, fat), max(0.6, cell * 0.01))
    halo = soft_mask(stamp_text(cell, ch, font, fat + int(cell * 0.036)), max(0.7, cell * 0.012))
    outline = soft_mask(stamp_text(cell, ch, font, fat + int(cell * 0.032)), max(0.6, cell * 0.01))
    holes = hole_mask(body.point(lambda p: 255 if p >= 80 else 0))
    if holes.getbbox():
        cut = holes.filter(ImageFilter.MinFilter(max(3, int(cell * 0.018) | 1)))
        ca = np.array(cut) > 0

        def clear(mask: Image.Image) -> Image.Image:
            arr = np.array(mask)
            arr[ca] = 0
            return Image.fromarray(arr, "L")

        halo = clear(halo)
        outline = clear(outline)

    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    canvas.alpha_composite(layer(halo, (255, 255, 255, 255)))
    canvas.alpha_composite(layer(outline, (46, 88, 168, 255)))
    grad = Image.new("RGBA", (1, cell))
    px = grad.load()
    top, bot = (168, 224, 255, 255), (58, 118, 214, 255)
    for y in range(cell):
        t = y / float(max(cell - 1, 1))
        px[0, y] = tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(4))
    fill = grad.resize((cell, cell), Image.BILINEAR)
    fill.putalpha(body)
    canvas.alpha_composite(fill)
    return trim(canvas, 6)


def draw_title(w: int, h: int) -> Image.Image:
    glyphs = [title_glyph(ch, h) for ch in "关卡"]
    gap = max(2, int(h * -0.04))
    total = sum(g.size[0] for g in glyphs) + gap
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = (w - total) // 2
    for g in glyphs:
        y = (h - g.size[1]) // 2
        canvas.alpha_composite(g, dest=(x, y))
        x += g.size[0] + gap
    return canvas


def stamp_text_box(w: int, h: int, text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    bb = probe.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) / 2 - bb[0]
    y = (h - th) / 2 - bb[1] + h * 0.02
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


def draw_gray_glass(out: int = 900) -> Image.Image:
    """Gray transparent glass cover: rim + highlights only. Center stays clear."""
    ss = 4
    s = out * ss
    pad = int(s * 0.045)
    rim = int(s * 0.072)
    lip = max(2, int(s * 0.010))
    box = (pad, pad, s - pad - 1, s - pad - 1)
    radius = int((s - 2 * pad) * 0.26)
    size = (s, s)

    outer = rounded_mask(size, box, radius)
    inner_box = (pad + rim, pad + rim, s - pad - rim - 1, s - pad - rim - 1)
    inner_r = max(8, radius - int(rim * 0.88))
    inner = rounded_mask(size, inner_box, inner_r)
    bezel = ring_mask(outer, inner)

    lip_box = (pad + lip, pad + lip, s - pad - lip - 1, s - pad - lip - 1)
    dark_lip = ring_mask(outer, rounded_mask(size, lip_box, max(8, radius - lip)))

    shine_inset = max(2, int(rim * 0.28))
    shine_box = (
        pad + shine_inset,
        pad + shine_inset,
        s - pad - shine_inset - 1,
        s - pad - shine_inset - 1,
    )
    shine = ring_mask(rounded_mask(size, shine_box, max(8, radius - shine_inset)), inner)

    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    # cool gray glass, not a solid plate
    canvas.alpha_composite(layer(soft_mask(bezel, s * 0.0012), (168, 174, 184, 240)))
    canvas.alpha_composite(layer(soft_mask(dark_lip, s * 0.0008), (108, 114, 124, 220)))
    canvas.alpha_composite(layer(soft_mask(shine, s * 0.0010), (228, 232, 238, 210)))

    # inner glass lip: thin bright edge, then gone. No gray fill.
    inner_edge = ring_mask(
        inner,
        rounded_mask(
            size,
            (inner_box[0] + lip, inner_box[1] + lip, inner_box[2] - lip, inner_box[3] - lip),
            max(6, inner_r - lip),
        ),
    )
    canvas.alpha_composite(layer(soft_mask(inner_edge, s * 0.0014), (255, 255, 255, 170)))

    # top-left specular
    hi = Image.new("L", size, 0)
    hd = ImageDraw.Draw(hi)
    arc_box = (pad + int(rim * 0.15), pad + int(rim * 0.10), pad + int(s * 0.46), pad + int(s * 0.46))
    hd.arc(arc_box, 200, 318, fill=255, width=max(3, int(rim * 0.42)))
    hi = hi.filter(ImageFilter.GaussianBlur(radius=max(1, int(s * 0.003))))
    ha = np.array(hi)
    ha = np.where(np.array(bezel) > 20, ha, 0)
    canvas.alpha_composite(layer(Image.fromarray(ha.astype(np.uint8), "L"), (255, 255, 255, 230)))

    # bottom-right specular, clipped to the gray rim
    pill = Image.new("L", size, 0)
    pd = ImageDraw.Draw(pill)
    pw, ph = int(s * 0.10), max(3, int(rim * 0.38))
    px0 = s - pad - rim + int(rim * 0.18)
    py0 = s - pad - int(rim * 0.62)
    pd.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), radius=ph // 2, fill=255)
    pill = pill.filter(ImageFilter.GaussianBlur(radius=max(1, int(s * 0.002))))
    pa = np.array(pill)
    pa = np.where(np.array(bezel) > 20, pa, 0)
    canvas.alpha_composite(layer(Image.fromarray(pa.astype(np.uint8), "L"), (255, 255, 255, 210)))

    title_h = int(s * 0.20)
    title_w = int(s * 0.58)
    title = draw_title(title_w, title_h)
    tx = (s - title_w) // 2
    ty = int(s * 0.64)
    canvas.alpha_composite(title, dest=(tx, ty))

    return bleed_rgb(resize_rgba(canvas, (out, out)))


def bubble(ch: str, cell: int = CELL) -> Image.Image:
    ss = 3
    s = cell * ss
    font = ImageFont.truetype(str(FONT), int(s * 0.54))
    fat = int(0.012 * s)
    jelly = max(0.8, s * 0.003)

    outer = int(0.028 * s)
    inner = int(0.022 * s)
    body = soft_mask(stamp_text(s, ch, font, fat), jelly)
    halo = soft_mask(stamp_text(s, ch, font, fat + outer), jelly * 1.2)
    holes = hole_mask(body.point(lambda p: 255 if p >= 80 else 0))
    if holes.getbbox():
        ha = np.array(halo)
        ha[np.array(holes) > 0] = 0
        ring = soft_mask(hole_ring(holes, inner), max(0.5, jelly * 0.35))
        halo = Image.fromarray(np.maximum(ha, np.array(ring)).astype(np.uint8), "L")
        ba = np.array(body)
        ba[np.array(holes) > 0] = 0
        body = Image.fromarray(ba, "L")

    canvas = Image.new("RGBA", (s, s), (255, 255, 255, 0))
    canvas.alpha_composite(layer(halo, HALO))
    canvas.alpha_composite(gradient_fill(body))

    hi = edge(body, int(0.012 * s), int(0.016 * s)).filter(ImageFilter.GaussianBlur(radius=max(1, int(0.006 * s))))
    canvas.alpha_composite(layer(hi, (255, 250, 255, 160)))
    shade = edge(body, -int(0.008 * s), -int(0.01 * s)).filter(ImageFilter.GaussianBlur(radius=max(1, int(0.006 * s))))
    canvas.alpha_composite(layer(shade, (150, 118, 196, 70)))

    if holes.getbbox():
        canvas = Image.fromarray(
            np.dstack((
                np.array(canvas)[:, :, :3],
                np.array(clear_hole_interior(canvas.split()[3], holes, inner)),
            )),
            "RGBA",
        )

    return bleed_rgb(resize_rgba(canvas, (cell, cell)))


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.size[0], x1 + pad)
    y1 = min(im.size[1], y1 + pad)
    return im.crop((x0, y0, x1, y1))


def load_rmbg_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def portal_mask(src: Path) -> Image.Image:
    """RMBG-2.0 via portal. Only the alpha is used; RGB stays the 2048 original."""
    Client = load_rmbg_client()

    class Sharp(Client):
        @staticmethod
        def _build_prompt(image_name: str) -> dict:
            prompt = Client._build_prompt(image_name)
            prompt["13"]["inputs"]["process_res"] = 2048
            prompt["13"]["inputs"]["mask_blur"] = 0
            prompt["13"]["inputs"]["mask_offset"] = 0
            return prompt

    last = None
    for base in PORTALS:
        if not base:
            continue
        print("portal rmbg", base)
        try:
            return Sharp(base=base).remove_background(src)
        except Exception as err:
            last = err
            print("  fail", base, err)
    raise RuntimeError(f"portal rmbg failed: {last}")


def gray_cut(src: Image.Image, thresh: int = 24) -> Image.Image:
    """Knock out the flat studio gray. Keep the AI pixels as-is."""
    rgb = src.convert("RGB")
    w, h = rgb.size
    work = rgb.copy()
    sent = (255, 0, 255)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for x in range(0, w, 48):
        seeds.append((x, 0))
        seeds.append((x, h - 1))
    for y in range(0, h, 48):
        seeds.append((0, y))
        seeds.append((w - 1, y))
    for pt in seeds:
        ImageDraw.floodfill(work, pt, sent, thresh=thresh)
    marked = np.array(work)
    bg = (marked[:, :, 0] == 255) & (marked[:, :, 1] == 0) & (marked[:, :, 2] == 255)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.array(rgb)
    out[:, :, 3] = np.where(bg, 0, 255)
    return Image.fromarray(out, "RGBA")


def stage_on_blue(src: Path, thresh: int = 22) -> Path:
    """Replace studio gray with portal blue so RMBG keeps the whole glass tile."""
    orig = Image.open(src).convert("RGB")
    w, h = orig.size
    work = orig.copy()
    sent = (255, 0, 255)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for x in range(0, w, 48):
        seeds += [(x, 0), (x, h - 1)]
    for y in range(0, h, 48):
        seeds += [(0, y), (w - 1, y)]
    for pt in seeds:
        ImageDraw.floodfill(work, pt, sent, thresh=thresh)
    marked = np.array(work)
    bg = (marked[:, :, 0] == 255) & (marked[:, :, 1] == 0) & (marked[:, :, 2] == 255)
    staged = np.array(orig)
    staged[bg] = BLUE
    out = src.with_name(src.stem + ".blue.png")
    Image.fromarray(staged, "RGB").save(out, "PNG")
    print("staged blue", out.name, "bg", int(bg.sum()))
    return out


def fill_alpha_holes(alpha: Image.Image) -> Image.Image:
    """Close interior holes RMBG punched through the frost / 关卡."""
    a = np.array(alpha)
    body = Image.fromarray(np.where(a > 80, 255, 0).astype(np.uint8), "L")
    holes = hole_mask(body)
    if holes.getbbox():
        ha = np.array(holes)
        a = np.where(ha > 0, np.maximum(a, 255), a)
    return Image.fromarray(a.astype(np.uint8), "L")


def smooth_rounded_mask(alpha: Image.Image, inset: int = 3, radius_ratio: float = 0.26) -> Image.Image:
    """Supersampled rounded-rect so the outer edge has no jagged fringe."""
    box = alpha.getbbox()
    if not box:
        return alpha
    x0, y0, x1, y1 = box
    x0 += inset
    y0 += inset
    x1 -= inset
    y1 -= inset
    side = min(x1 - x0, y1 - y0)
    radius = max(8, int(side * radius_ratio))
    ss = 4
    big = Image.new("L", (alpha.size[0] * ss, alpha.size[1] * ss), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (x0 * ss, y0 * ss, x1 * ss - 1, y1 * ss - 1),
        radius=radius * ss,
        fill=255,
    )
    return big.resize(alpha.size, Image.LANCZOS)


def portal_cut_glass(src: Path) -> Image.Image:
    """AI glass RGB + portal RMBG alpha, holes filled, outer edge a clean squircle."""
    staged = stage_on_blue(src)
    cut = portal_mask(staged)
    cut.save(src.with_name(src.stem + ".blue.rmbg.png"), "PNG")
    filled = fill_alpha_holes(cut.split()[3])
    mask = smooth_rounded_mask(filled)
    rgb = Image.open(src).convert("RGB")
    if rgb.size != mask.size:
        mask = mask.resize(rgb.size, Image.LANCZOS)
    out = rgb.convert("RGBA")
    out.putalpha(mask)
    out = bleed_rgb(trim(out, 10))
    print("portal glass", out.size, "bbox", out.getbbox())
    return out


def knock_fill(im: Image.Image) -> Image.Image:
    """Keep glass rim, highlights, and 关卡. Punch the opaque lavender fill."""
    arr = np.array(im.convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.int16)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    bri = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    blue = rgb[:, :, 2] - rgb[:, :, 0]

    text_core = (alpha > 8) & ((bri < 190) | ((blue > 28) & (sat > 28)))
    halo = np.array(
        Image.fromarray((text_core.astype(np.uint8) * 255), "L").filter(ImageFilter.MaxFilter(31))
    ) > 0
    outline = halo & (bri > 235) & (sat < 18) & (alpha > 8)

    rim_px = max(36, int(min(w, h) * 0.062)) | 1
    inner = np.array(Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(rim_px)))
    rim = (alpha > 8) & (inner <= 80)

    fill_map = np.zeros((h, 3), dtype=np.float32)
    for y in range(h):
        row = (inner[y] > 200) & (~halo[y])
        if int(row.sum()) > 20:
            fill_map[y] = np.median(rgb[y][row], axis=0)
        elif y:
            fill_map[y] = fill_map[y - 1]
        else:
            fill_map[y] = (232, 231, 243)
    for _ in range(8):
        fill_map[1:-1] = (fill_map[:-2] + fill_map[1:-1] + fill_map[2:]) / 3

    local_bri = fill_map.mean(axis=1)[:, None]
    hi = (bri > local_bri + 14) & (sat < 10) & (alpha > 8)
    keep = (alpha > 8) & (rim | text_core | outline | hi)

    out = arr.copy()
    out[:, :, 3] = np.where(keep, alpha, 0).astype(np.uint8)
    return bleed_rgb(Image.fromarray(out, "RGBA"))


def import_badge() -> Image.Image:
    src = Image.open(AI_GLASS).convert("RGB")
    arr = np.array(src).astype(np.int16)
    gray = np.array(src.getpixel((2, 2)), dtype=np.int16)
    dist = np.abs(arr - gray).sum(axis=2)
    keep = dist > 28
    ys, xs = np.where(keep)
    inset = 4
    x0, y0 = max(0, int(xs.min()) + inset), max(0, int(ys.min()) + inset)
    x1, y1 = min(src.size[0], int(xs.max()) - inset + 1), min(src.size[1], int(ys.max()) - inset + 1)
    side = min(x1 - x0, y1 - y0)
    radius = int(side * 0.28)
    ss = 4
    big = Image.new("L", ((x1 - x0) * ss, (y1 - y0) * ss), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (2 * ss, 2 * ss, big.size[0] - 2 * ss, big.size[1] - 2 * ss),
        radius=max(8, radius - 2) * ss,
        fill=255,
    )
    alpha = big.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    out = src.crop((x0, y0, x1, y1)).convert("RGBA")
    out.putalpha(alpha)
    print("badge cut", out.size, "box", (x0, y0, x1, y1), "r", radius)
    return out


def slice_digits(im: Image.Image) -> List[Image.Image]:
    arr = np.array(im)
    ink = arr[:, :, 3] > 20
    col = ink.any(axis=0)
    spans = []
    i = 0
    w = col.shape[0]
    while i < w:
        if not col[i]:
            i += 1
            continue
        j = i
        while j < w and col[j]:
            j += 1
        if j - i > 18:
            spans.append((i, j))
        i = j
    widths = [b - a for a, b in spans]
    med = sorted(widths)[len(widths) // 2] if widths else 0
    split = []
    ink = np.array(im)[:, :, 3] > 20
    for x0, x1 in spans:
        if med and (x1 - x0) > med * 1.55:
            mid0 = x0 + int((x1 - x0) * 0.35)
            mid1 = x0 + int((x1 - x0) * 0.65)
            cut_x = min(range(mid0, max(mid0 + 1, mid1)), key=lambda x: int(ink[:, x].sum()))
            split.append((x0, cut_x))
            split.append((cut_x, x1))
        else:
            split.append((x0, x1))
    print("digit spans", len(split), split)
    glyphs = []
    for x0, x1 in split[:10]:
        sl = im.crop((x0, 0, x1, im.size[1]))
        glyphs.append(trim(sl, 6))
    return glyphs


def save(im: Image.Image, name: str) -> None:
    path = OUT_DIR / f"{name}.png"
    im.save(path, "PNG")
    write_meta(path, UUID[name], *im.size)
    print("wrote", path.name, im.size)


def compose_preview(badge: Image.Image, digits: List[Image.Image]) -> Image.Image:
    preview = badge.copy()
    d0 = digits[0]
    d1 = digits[1]
    gh = int(badge.size[1] * 0.42)
    def fit(g):
        r = gh / g.size[1]
        return resize_rgba(g, (max(1, int(g.size[0] * r)), gh))
    a, b = fit(d0), fit(d1)
    gap = int(gh * -0.02)
    total = a.size[0] + gap + b.size[0]
    x = (badge.size[0] - total) // 2
    y = int(badge.size[1] * 0.22)
    preview.alpha_composite(a, dest=(x, y))
    preview.alpha_composite(b, dest=(x + a.size[0] + gap, y))
    return preview


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    word = bleed_rgb(trim(draw_title(1400, 640), 12))
    save(word, "level-home")

    digits = []
    for n in range(10):
        g = trim(bubble(str(n)))
        save(g, f"lvh-{n}")
        digits.append(g)

    preview = compose_preview(word, [digits[0], digits[1]])
    preview.save("/tmp/home-level-preview.png")
    print("preview", preview.size)


if __name__ == "__main__":
    main()
