#!/usr/bin/env python3
"""Split Shoot a Cube Puzzle! Hand_Tut atlas + copy Base_Tutorial tip plate."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = Path.home() / "Documents" / "leidian14" / "Pictures" / "Shoot a Cube Puzzle!" / "exported" / "resources"
ATLAS = SRC_ROOT / "textures" / "Hand_Tut.png"
TIP_CANDIDATES = (
    SRC_ROOT / "sprites" / "Base_Tutorial.png",
    SRC_ROOT / "textures" / "Base_Tutorial.png",
)
OUT = ROOT / "assets" / "resources" / "ui"

# This atlas page is padded to 512; bounds y is from the TOP of the texture.
REGIONS = {
    "hint-hand": ("7e22bb20-000e-4b02-8002-00000000000e", 2, 230, 233, 240),
    "hint-hand-sd": ("7e22bb20-0084-4b02-8002-000000000084", 237, 230, 233, 240),
    "hint-ring-1": ("7e22bb20-0085-4b02-8002-000000000085", 2, 59, 63, 63),
    "hint-ring-2": ("7e22bb20-0086-4b02-8002-000000000086", 2, 124, 104, 104),
}
TIP_UUID = "7e22bb20-0087-4b02-8002-000000000087"


def write_meta(path: Path, uuid: str, w: int, h: int, border: tuple[int, int, int, int] | None = None) -> None:
    hw, hh = w / 2.0, h / 2.0
    bt, bb, bl, br = border or (0, 0, 0, 0)
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


def un_pma(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    a = arr[:, :, 3:4]
    opaque = a > 8
    mx = np.max(arr[:, :, :3], axis=2, keepdims=True)
    pma_hits = int(np.sum(opaque & (mx > a + 4)))
    opaque_n = int(np.sum(opaque))
    if opaque_n > 0 and pma_hits / opaque_n < 0.08:
        rgb = np.divide(arr[:, :, :3] * 255.0, a, out=np.zeros_like(arr[:, :, :3]), where=a > 0)
        arr[:, :, :3] = np.clip(rgb, 0, 255)
        print("  un-pma")
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def punch_black(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    if float(np.mean(arr[:, :, 3])) > 8:
        return im
    lum = arr[:, :, 0] * 0.3 + arr[:, :, 1] * 0.59 + arr[:, :, 2] * 0.11
    alpha = np.clip((lum - 10.0) / 22.0, 0.0, 1.0)
    arr[:, :, 3] = np.where(lum < 8.0, 0.0, np.maximum(arr[:, :, 3], alpha * 255.0))
    print("  punched black")
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def crop_atlas(page: Image.Image, x: int, y: int, w: int, h: int) -> Image.Image:
    return page.crop((x, y, x + w, y + h))


def fingertip(im: Image.Image) -> tuple[float, float]:
    arr = np.array(im.convert("RGBA"))
    a = arr[:, :, 3]
    ys, xs = np.where(a > 40)
    if len(xs) == 0:
        return 0.5, 0.5
    # Index finger of this glove points upper-left: take the top-most opaque run.
    top = int(ys.min())
    band = (ys <= top + 10) & (a[ys, xs] > 80)
    tx = float(xs[band].min()) if np.any(band) else float(xs[ys == top].min())
    ty = float(top)
    return tx / im.width, 1.0 - ty / im.height


def save_sprite(name: str, uuid: str, im: Image.Image, border=None) -> None:
    dest = OUT / f"{name}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG")
    write_meta(dest, uuid, im.width, im.height, border)
    print(name, im.size, "alpha", round(float(np.mean(np.array(im)[:, :, 3])), 1))


def main() -> None:
    page = punch_black(un_pma(Image.open(ATLAS)))
    print("atlas", page.size, page.mode)
    for name, (uuid, x, y, w, h) in REGIONS.items():
        cut = crop_atlas(page, x, y, w, h)
        save_sprite(name, uuid, cut)
        if name == "hint-hand":
            px, py = fingertip(cut)
            print(f"  fingertip pivot ~ ({px:.3f}, {py:.3f})")

    tip_src = next((p for p in TIP_CANDIDATES if p.exists()), None)
    if not tip_src:
        raise SystemExit("Base_Tutorial.png missing")
    tip = punch_black(un_pma(Image.open(tip_src)))
    bbox = tip.getbbox()
    if bbox:
        tip = tip.crop(bbox)
    inset = max(28, tip.height // 2 - 4)
    save_sprite("tip-base", TIP_UUID, tip, (inset, inset, inset, inset))
    print("tip", tip.size, "inset", inset)


if __name__ == "__main__":
    main()
