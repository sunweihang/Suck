#!/usr/bin/env python3
"""AI win/fail assets → portal RMBG-2.0 2048 → Cocos sprites."""

import importlib.util
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
SRC_DIR = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets")
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")

SRC = {
    "title-win": SRC_DIR / "ai-title-win.png",
    "title-fail": SRC_DIR / "ai-title-fail.png",
    "btn-win-next": SRC_DIR / "ai-btn-next.png",
    "btn-fail-retry": SRC_DIR / "ai-btn-retry.png",
    "card-win": SRC_DIR / "ai-card-win.png",
    "card-fail": SRC_DIR / "ai-card-fail.png",
    "hero-win": WORK / "hero-win.cut.png",
    "hero-fail": WORK / "hero-fail.cut.png",
    "scene-win": SRC_DIR / "result-win-scene.png",
    "scene-fail": SRC_DIR / "result-fail-scene.png",
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


def write_meta(path: Path, uuid: str, w: int, h: int, fix_alpha: bool = True) -> None:
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
    "fixAlphaTransparencyArtifacts": {str(fix_alpha).lower()},
    "hasAlpha": true,
    "redirect": "{uuid}@6c48a"
  }}
}}
""",
        encoding="utf-8",
    )


def load_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def decontaminate(im: Image.Image, bg: tuple) -> Image.Image:
    arr = np.array(im).astype(np.float32)
    a = arr[:, :, 3:4] / 255.0
    rgb = arr[:, :, :3]
    back = np.array(bg, dtype=np.float32)
    mask = (a[:, :, 0] > 0.02) & (a[:, :, 0] < 0.97)
    fg = (rgb - (1.0 - a) * back) / np.clip(a, 1e-4, 1.0)
    rgb[mask] = np.clip(fg[mask], 0, 255)
    arr[:, :, :3] = rgb
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def portal_cut(src: Path, cache: Path) -> Image.Image:
    if cache.exists():
        print("reuse", cache.name)
        cut = Image.open(cache).convert("RGBA")
    else:
        Client = load_client()

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
        print("  rmbg", cut.size, "bbox", cut.getbbox(), flush=True)

    bg = Image.open(src).convert("RGB").getpixel((2, 2))
    cut = decontaminate(cut, bg)
    box = cut.getbbox()
    if not box:
        raise RuntimeError(f"empty cut {src.name}")
    x0, y0, x1, y1 = box
    pad = 10
    return cut.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(cut.size[0], x1 + pad),
        min(cut.size[1], y1 + pad),
    ))


def round_mask(w: int, h: int, radius: int) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    return m


def paint_ring(w: int, h: int, radius: int) -> Image.Image:
    ring = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    d.rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, outline=(255, 255, 255, 255), width=16)
    d.rounded_rectangle((15, 15, w - 16, h - 16), radius=max(12, radius - 14), outline=(78, 205, 224, 255), width=18)
    return ring


def fit_width_keep_top(im: Image.Image, tw: int, th: int) -> Image.Image:
    iw, ih = im.size
    nh = max(2, round(ih * tw / iw))
    scaled = im.resize((tw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    if nh >= th:
        canvas.paste(scaled.crop((0, 0, tw, th)), (0, 0))
    else:
        canvas.paste(scaled, (0, 0))
    return canvas


def fit_contain(im: Image.Image, tw: int, th: int) -> Image.Image:
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    copy = im.copy()
    copy.thumbnail((tw, th), Image.LANCZOS)
    canvas.alpha_composite(copy, dest=((tw - copy.size[0]) // 2, (th - copy.size[1]) // 2))
    return canvas


def fit_cover(im: Image.Image, tw: int, th: int) -> Image.Image:
    iw, ih = im.size
    scale = max(tw / iw, th / ih)
    nw, nh = max(1, round(iw * scale)), max(1, round(ih * scale))
    scaled = im.resize((nw, nh), Image.LANCZOS)
    x = (nw - tw) // 2
    y = max(0, (nh - th) // 2 - 30)
    return scaled.crop((x, y, x + tw, y + th))


def clip_card(im: Image.Image) -> Image.Image:
    out = im.convert("RGBA")
    out.putalpha(round_mask(PANEL_W, PANEL_H, RADIUS))
    return Image.alpha_composite(out, paint_ring(PANEL_W, PANEL_H, RADIUS))


def crop_studio_margin(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGB")).astype(np.int16)
    gray = np.array([118, 118, 118], dtype=np.int16)
    dist = np.abs(arr - gray).sum(axis=2)
    mask = dist > 48
    if mask.mean() < 0.55:
        return im
    ys, xs = np.where(mask)
    pad = 4
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(im.size[0], int(xs.max()) + pad + 1),
        min(im.size[1], int(ys.max()) + pad + 1),
    )
    return im.crop(box)


def fill_edge_gray(im: Image.Image, band: int = 96) -> Image.Image:
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    alpha = arr[:, :, 3]
    gray = (np.abs(rgb - 118).sum(axis=2) < 52) & (alpha > 8)
    h, w = gray.shape
    good = (~gray) & (alpha > 180)
    for x in range(w):
        src_rows = np.where(good[:, x])[0]
        if src_rows.size == 0:
            continue
        top = np.where(gray[:band, x])[0]
        if top.size:
            arr[top, x] = arr[src_rows[0], x]
        side = np.where(gray[:, x] & ((np.arange(h) < 40) | (np.arange(h) > h - 40)))[0]
        if side.size:
            arr[side, x] = arr[src_rows[min(3, src_rows.size - 1)], x]
    return Image.fromarray(arr, "RGBA")


def finish_ai_card(src: Path) -> Image.Image:
    """Keep the full AI illustration. Never RMBG a complete scene card."""
    raw = crop_studio_margin(Image.open(src).convert("RGBA"))
    fitted = fill_edge_gray(fit_width_keep_top(raw, PANEL_W, PANEL_H))
    return clip_card(fitted)


def polish_cut(im: Image.Image) -> Image.Image:
    """Kill studio-gray fringe and soften the outer silhouette."""
    arr = np.array(im).astype(np.float32)
    a = arr[:, :, 3]
    a = np.clip((a - 18.0) * (255.0 / 220.0), 0, 255)
    rgb = arr[:, :, :3]
    mask = (a > 8) & (a < 250)
    if np.any(mask):
        solid = a >= 250
        if np.any(solid):
            edge_rgb = rgb[solid].mean(axis=0)
            rgb[mask] = rgb[mask] * 0.35 + edge_rgb * 0.65
    arr[:, :, :3] = rgb
    arr[:, :, 3] = a
    out = Image.fromarray(arr.astype(np.uint8), "RGBA")
    alpha = out.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out.putalpha(alpha)
    return out


def pack_button(cut: Image.Image, tw: int, th: int) -> Image.Image:
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    copy = polish_cut(cut)
    pad = 16
    copy.thumbnail((tw - pad * 2, th - pad * 2), Image.LANCZOS)
    # second pass: slightly softer silhouette so in-game scale stays clean
    a = copy.split()[3].filter(ImageFilter.GaussianBlur(0.9))
    copy.putalpha(a)
    canvas.alpha_composite(
        copy,
        dest=((tw - copy.size[0]) // 2, (th - copy.size[1]) // 2),
    )
    return canvas


def assemble_layers(scene: Path, hero: Path, title: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (PANEL_W, PANEL_H), (0, 0, 0, 0))
    canvas.alpha_composite(fit_cover(Image.open(scene).convert("RGBA"), PANEL_W, PANEL_H))
    h = Image.open(hero).convert("RGBA")
    h.thumbnail((1280, 1180), Image.LANCZOS)
    canvas.alpha_composite(h, dest=((PANEL_W - h.size[0]) // 2, 520))
    t = title.copy()
    t.thumbnail((1500, 420), Image.LANCZOS)
    canvas.alpha_composite(t, dest=((PANEL_W - t.size[0]) // 2, 80))
    return clip_card(canvas)


def preview(win, fail, nxt, retry, name: str) -> None:
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
        b.thumbnail((250, 120), Image.LANCZOS)
        frame.alpha_composite(
            b,
            dest=((phone_w - b.size[0]) // 2, py + p.size[1] - int(p.size[1] * 0.16) - b.size[1] // 2),
        )
        canvas.alpha_composite(frame, dest=(i * (phone_w + 24), 0))
    out = WORK / name
    canvas.convert("RGB").save(out)
    print("preview", out)


def save(im: Image.Image, name: str) -> Image.Image:
    dest = OUT_DIR / f"{name}.png"
    im.save(dest, "PNG")
    write_meta(dest, UUID[name], *im.size, fix_alpha=True)
    print("wrote", dest.name, im.size)
    return im


def button_canvas_size(cut: Image.Image) -> tuple:
    box = cut.getbbox()
    if not box:
        return BTN_W, BTN_H
    cw, ch = box[2] - box[0], box[3] - box[1]
    th = max(360, min(640, round(BTN_W * ch / max(1, cw))))
    return BTN_W, th


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    cuts = {}
    for key in ("title-win", "title-fail", "btn-win-next", "btn-fail-retry"):
        src = SRC[key]
        shutil.copy2(src, WORK / f"{key}-src.png")
        cuts[key] = portal_cut(src, WORK / f"{key}.rmbg.png")
        cuts[key].save(WORK / f"{key}.cut.png")

    bw, bh = button_canvas_size(cuts["btn-win-next"])
    nxt = pack_button(cuts["btn-win-next"], bw, bh)
    retry = pack_button(cuts["btn-fail-retry"], bw, bh)
    card_win = finish_ai_card(SRC["card-win"])
    card_fail = finish_ai_card(SRC["card-fail"])
    layer_win = assemble_layers(SRC["scene-win"], SRC["hero-win"], cuts["title-win"])
    layer_fail = assemble_layers(SRC["scene-fail"], SRC["hero-fail"], cuts["title-fail"])

    preview(card_win, card_fail, nxt, retry, "portal-card-preview.png")
    preview(layer_win, layer_fail, nxt, retry, "portal-layer-preview.png")
    card_win.save(WORK / "portal-card-win.png")
    card_fail.save(WORK / "portal-card-fail.png")
    layer_win.save(WORK / "portal-layer-win.png")
    layer_fail.save(WORK / "portal-layer-fail.png")

    save(card_win, "panel-win")
    save(card_fail, "panel-fail")
    save(nxt, "btn-win-next")
    save(retry, "btn-fail-retry")
    print("button texture", bw, bh)


if __name__ == "__main__":
    main()
