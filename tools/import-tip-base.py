#!/usr/bin/env python3
"""AI in-game tutorial hint bar → transparent PNG + Cocos nine-slice meta."""

import importlib.util
import os
import shutil
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/tip-base-studio-v2.png")
WORK = ROOT / "tools/ai-load"
OUT = ROOT / "assets/resources/ui/tip-base.png"
UUID = "7e22bb20-0087-4b02-8002-000000000087"
MAX_W = 820
TARGET_H = 120
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")


def write_meta(path: Path, uuid: str, w: int, h: int, cap_x: int, cap_y: int) -> None:
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
      "displayName": "tip-base",
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
      "displayName": "tip-base",
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
        "borderTop": {cap_y},
        "borderBottom": {cap_y},
        "borderLeft": {cap_x},
        "borderRight": {cap_x},
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
    "maxWidth": {w},
    "maxHeight": {h},
    "compressSettings": {{
      "useCompressTexture": false,
      "presetId": "webUi"
    }}
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


def portal_cut(src: Path):
    if not CLIENT.exists():
        raise RuntimeError("rmbg client missing")
    Client = load_client()

    class Sharp(Client):
        @staticmethod
        def _build_prompt(image_name):
            prompt = Client._build_prompt(image_name)
            prompt["13"]["inputs"]["process_res"] = 1024
            prompt["13"]["inputs"]["mask_blur"] = 0
            prompt["13"]["inputs"]["mask_offset"] = 0
            prompt["13"]["inputs"]["refine_foreground"] = True
            return prompt

    last = None
    for base in PORTALS:
        if not base:
            continue
        print("portal rmbg", base, src.name, flush=True)
        try:
            raw = Sharp(base=base).remove_background(src)
            if isinstance(raw, Image.Image):
                return raw.convert("RGBA")
            return Image.open(BytesIO(raw)).convert("RGBA")
        except Exception as err:
            last = err
            print("  fail", base, err, flush=True)
    raise RuntimeError("portal rmbg failed: %s" % last)


def flood_alpha(rgb: Image.Image) -> Image.Image:
    arr = np.asarray(rgb.convert("RGB"), dtype=np.float32)
    lum = arr.mean(axis=2)
    sat = arr.max(axis=2) - arr.min(axis=2)
    bg = (lum > 228) & (sat < 16)
    h, w = bg.shape
    seen = np.zeros((h, w), dtype=bool)
    stack = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not bg[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    out = rgb.convert("RGBA")
    out.putalpha(Image.fromarray(alpha, "L"))
    return out


def apply_alpha(src_rgb: Image.Image, cut: Image.Image) -> Image.Image:
    rgb = src_rgb.convert("RGB")
    alpha = cut.split()[3]
    if alpha.size != rgb.size:
        alpha = alpha.resize(rgb.size, Image.LANCZOS)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def strip_shadow(im: Image.Image, alpha_min: int = 210) -> Image.Image:
    """Drop soft shadow pixels so nine-slice / stretch won't smear a dark band."""
    arr = np.asarray(im.convert("RGBA"))
    alpha = arr[:, :, 3]
    solid = alpha >= alpha_min
    if not solid.any():
        return im
    ys, xs = np.where(solid)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    return im.crop((x0, y0, x1, y1))


def fit_out(im: Image.Image, target_h: int) -> Image.Image:
    crop = strip_shadow(im)
    if crop.getbbox() is None:
        return Image.new("RGBA", (target_h * 3, target_h), (0, 0, 0, 0))
    w0, h0 = crop.size
    scale = target_h / h0
    nw = max(target_h, int(round(w0 * scale)))
    if nw % 2:
        nw += 1
    return crop.resize((nw, target_h), Image.LANCZOS)


def cap_insets(w, h):
    cap_x = max(24, min(w // 2 - 2, h // 2))
    cap_y = max(2, min(8, h // 12))
    return cap_x, cap_y


def main() -> None:
    if not SRC.exists():
        raise SystemExit("missing studio: %s" % SRC)
    WORK.mkdir(parents=True, exist_ok=True)
    studio = WORK / "tip-base-studio.png"
    cache = WORK / "tip-base.rmbg.png"
    if cache.exists():
        cache.unlink()
    shutil.copy2(SRC, studio)
    raw = Image.open(studio).convert("RGBA")
    if cache.exists():
        cut = Image.open(cache).convert("RGBA")
        print("reuse", cache.name, cut.size)
    else:
        try:
            cut = portal_cut(studio)
            cut.save(cache, "PNG")
            print("rmbg", cache.name, cut.size, "bbox", cut.getbbox())
        except Exception as err:
            print("rmbg fallback", studio.name, err, flush=True)
            cut = flood_alpha(raw)
            cut.save(cache, "PNG")
    out = fit_out(apply_alpha(raw, cut), TARGET_H)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    cap_x, cap_y = cap_insets(out.size[0], out.size[1])
    write_meta(OUT, UUID, out.size[0], out.size[1], cap_x, cap_y)
    print(OUT, out.size, "cap", cap_x, cap_y, "bbox", out.getbbox())


if __name__ == "__main__":
    main()
