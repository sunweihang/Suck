#!/usr/bin/env python3
"""Portal rmbg the flat item tray, then write a nine-slice sprite."""

import importlib.util
import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/item-tray-roundrect-src.png")
WORK = ROOT / "tools/ai-item"
OUT = ROOT / "assets/resources/ui/item-tray.png"
UUID = "7e22bb20-0073-4b02-8002-000000000073"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")


def load_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def portal_cut(src: Path) -> Image.Image:
    Client = load_client()

    class Sharp(Client):
        @staticmethod
        def _build_prompt(image_name):
            prompt = Client._build_prompt(image_name)
            prompt["13"]["inputs"]["process_res"] = 2048
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
            from io import BytesIO
            return Image.open(BytesIO(raw)).convert("RGBA")
        except Exception as err:
            last = err
            print("  fail", base, err, flush=True)
    raise RuntimeError(f"portal rmbg failed: {last}")


def trim(im: Image.Image, pad: int) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    return im.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(im.width, x1 + pad),
        min(im.height, y1 + pad),
    ))


def write_meta(path: Path, uuid: str, w: int, h: int, bt: int, bb: int, bl: int, br: int) -> None:
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
        "borderTop": {bt},
        "borderBottom": {bb},
        "borderLeft": {bl},
        "borderRight": {br},
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


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / SRC.name).write_bytes(SRC.read_bytes())
    cut = portal_cut(SRC)
    cut.save(WORK / "item-tray-roundrect.rmbg.png")
    print("rmbg", cut.size, "bbox", cut.getbbox(), "corner", cut.getpixel((0, 0))[3])
    out = trim(cut, 2)
    arr = np.array(out)
    arr[:, :, 3] = np.where(arr[:, :, 3] < 18, 0, arr[:, :, 3])
    out = Image.fromarray(arr, "RGBA")
    out = trim(out, 2)
    h = 256
    w = max(1, round(out.width * h / out.height))
    out = out.resize((w, h), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    # Rounded-rect caps only. Large L/R insets squash corners into olive tips.
    bl = br = 110
    bt = bb = 73
    arr = np.array(out)
    print("wrote", OUT, out.size, "insets", bt, bb, bl, br, "opaque", int((arr[:, :, 3] > 20).mean() * 100), "%")


if __name__ == "__main__":
    main()
