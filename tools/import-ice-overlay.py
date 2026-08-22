#!/usr/bin/env python3
"""AI ice overlay → transparent 256 PNG + Cocos meta (keep ice-overlay UUID)."""

import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    "/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/ice-rect-v3-crystal.png"
)
WORK = ROOT / "tools/ai-item"
OUT = ROOT / "assets/resources/ui/ice-overlay.png"
UUID = "7e22bb20-00f1-4b02-8002-0000000000f1"
SIZE = 256


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


def ice_alpha(rgb: Image.Image) -> Image.Image:
    arr = np.asarray(rgb.convert("RGB"), dtype=np.float32)
    mx = arr.max(axis=2)
    # Only cut the black plate. Keep studio ice color and cover the turret.
    alpha = np.where(mx < 14, 0.0, np.clip((mx - 10.0) * 8.0, 0.0, 255.0))
    out = rgb.convert("RGBA")
    out.putalpha(Image.fromarray(alpha.astype(np.uint8), "L"))
    return out


def fit_square(im: Image.Image, size: int) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
    crop = im.crop(bbox)
    pad = int(round(max(crop.size) * 0.02))
    side = max(crop.size) + pad * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2), crop)
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    if not SRC.exists():
        raise SystemExit("missing studio ice: %s" % SRC)
    WORK.mkdir(parents=True, exist_ok=True)
    studio = WORK / "ice-overlay-studio.png"
    shutil.copy2(SRC, studio)
    src = Image.open(studio).convert("RGBA")
    out = fit_square(ice_alpha(src), SIZE)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    write_meta(OUT, UUID, SIZE, SIZE)
    print(OUT, out.size, "bbox", out.getbbox(), "corner_a", out.getpixel((0, 0))[3])


if __name__ == "__main__":
    main()
