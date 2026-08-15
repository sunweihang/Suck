#!/usr/bin/env python3
"""Cut the start button via portal rmbg-v2 and write a home CTA sprite."""

import importlib.util
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/Desktop/开始游戏.png")
OUT = ROOT / "assets/resources/ui/btn-play.png"
UUID = "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e16"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
os.environ.setdefault("RMBG_PORTAL_URL", "http://10.1.4.130:8080")
MAX_W = 1400


def load_rmbg():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if hasattr(mod, "remove_background"):
        return mod.remove_background
    client = mod.RmbgV2Client()

    def _run(src: Path):
        raw = client.remove_background(src)
        if isinstance(raw, Image.Image):
            return raw.convert("RGBA")
        from io import BytesIO
        return Image.open(BytesIO(raw)).convert("RGBA")

    return _run


def trim_alpha(im: Image.Image, pad_px: int = 8) -> Image.Image:
    im = im.convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad_px)
    y0 = max(0, y0 - pad_px)
    x1 = min(im.width, x1 + pad_px)
    y1 = min(im.height, y1 + pad_px)
    return im.crop((x0, y0, x1, y1))


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


def main() -> None:
    print(f"portal rmbg {SRC}")
    im = load_rmbg()(SRC)
    corners = [im.getpixel((0, 0))[3], im.getpixel((im.width - 1, 0))[3],
               im.getpixel((0, im.height - 1))[3], im.getpixel((im.width - 1, im.height - 1))[3]]
    bbox = im.getbbox()
    print(f"raw {im.size} corners_a={corners} bbox={bbox}")
    im = trim_alpha(im, pad_px=10)
    if im.width > MAX_W:
        h = max(1, round(im.height * MAX_W / im.width))
        im = im.resize((MAX_W, h), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "PNG")
    write_meta(OUT, UUID, *im.size)
    print(f"wrote {OUT} {im.size}")


if __name__ == "__main__":
    main()
