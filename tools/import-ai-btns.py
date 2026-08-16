#!/usr/bin/env python3
"""AI studio buttons → portal RMBG → Cocos sprites. No vector redraw."""

import importlib.util
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")

SRC = {
    "btn-win-next": Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/ai-btn-next-studio.png"),
    "btn-fail-retry": Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/ai-btn-retry-studio.png"),
}
UUID = {
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    "btn-fail-retry": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e32",
}
MAX_W = 920


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


def stadium_mask(w: int, h: int, ss: int = 8) -> Image.Image:
    mw, mh = w * ss, h * ss
    m = Image.new("L", (mw, mh), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 0, mh - 1, mh - 1), fill=255)
    d.ellipse((mw - mh, 0, mw - 1, mh - 1), fill=255)
    d.rectangle((mh // 2, 0, mw - mh // 2, mh - 1), fill=255)
    return m.resize((w, h), Image.LANCZOS)


def fit_pill_box(alpha: np.ndarray, inset: int) -> tuple:
    solid = alpha > 200
    mid_y = int(np.round(np.mean(np.flatnonzero(np.any(solid, axis=1)))))
    xs = np.flatnonzero(solid[mid_y])
    mid_x = int(np.round(np.mean(np.flatnonzero(np.any(solid, axis=0)))))
    ys = np.flatnonzero(solid[:, mid_x])
    x0, x1 = int(xs[0]) + inset, int(xs[-1]) - inset
    y0, y1 = int(ys[0]) + inset, int(ys[-1]) - inset
    if x1 - x0 < 8 or y1 - y0 < 8:
        raise RuntimeError("pill box too small")
    return x0, y0, x1 + 1, y1 + 1


def clean_with_studio(studio: Image.Image, portal: Image.Image) -> Image.Image:
    """Keep AI RGB, replace dirty portal fringe with a supersampled stadium."""
    src = studio.convert("RGBA")
    cut = portal.convert("RGBA")
    if cut.size != src.size:
        cut = cut.resize(src.size, Image.NEAREST)
    x0, y0, x1, y1 = fit_pill_box(np.array(cut.split()[3]), inset=3)
    pad = 6
    pw, ph = (x1 - x0) + pad * 2, (y1 - y0) + pad * 2
    canvas = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    rgb = src.crop((x0, y0, x1, y1))
    canvas.paste(rgb, (pad, pad))
    mask = Image.new("L", (pw, ph), 0)
    mask.paste(stadium_mask(x1 - x0, y1 - y0), (pad, pad))
    canvas.putalpha(mask)
    return canvas


def portal_cut(src: Path, cache: Path) -> Image.Image:
    if cache.exists():
        print("reuse", cache.name)
        return Image.open(cache).convert("RGBA")
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
    return cut.convert("RGBA")


def finish(cut: Image.Image) -> Image.Image:
    if cut.width > MAX_W:
        h = max(1, round(cut.height * MAX_W / cut.width))
        cut = cut.resize((MAX_W, h), Image.LANCZOS)
    return cut


def preview(nxt: Image.Image, retry: Image.Image) -> None:
    canvas = Image.new("RGBA", (1080, 960), (48, 54, 78, 255))
    cream = Image.new("RGBA", (1080, 960), (244, 236, 220, 255))
    for i, btn in enumerate((nxt, retry)):
        shown = btn.copy()
        shown.thumbnail((460, 220), Image.LANCZOS)
        xy = ((1080 - shown.size[0]) // 2, 80 + i * 280)
        canvas.alpha_composite(shown, dest=xy)
        cream.alpha_composite(shown, dest=xy)
    WORK.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(WORK / "ai-btn-import-preview.png")
    cream.convert("RGB").save(WORK / "ai-btn-import-cream.png")
    print("preview", WORK / "ai-btn-import-preview.png")


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    outs = {}
    for name, src in SRC.items():
        if not src.exists():
            raise FileNotFoundError(src)
        local = WORK / f"{name}-ai-src.png"
        shutil.copy2(src, local)
        portal = portal_cut(local, WORK / f"{name}-ai.rmbg.png")
        cut = clean_with_studio(Image.open(local), portal)
        cut.save(WORK / f"{name}-ai.cut.png")
        im = finish(cut)
        dest = OUT_DIR / f"{name}.png"
        im.save(dest, "PNG")
        write_meta(dest, UUID[name], *im.size)
        print("wrote", dest.name, im.size)
        outs[name] = im
    preview(outs["btn-win-next"], outs["btn-fail-retry"])


if __name__ == "__main__":
    main()
