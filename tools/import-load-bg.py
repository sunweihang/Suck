#!/usr/bin/env python3
"""Import the loading backdrop as a 1080x2200 cover. Center stays quiet for tip text."""

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets/bg-load-studio.png")
WORK = ROOT / "tools/ai-load/bg-load-studio.png"
OUT = ROOT / "assets/resources/ui/bg-load.jpg"
UUID = "b6d2c48e-9a17-4f53-8c21-7e0d5a3b1f94"
BG_W, BG_H = 1080, 2200
SRC_H = 1920


def write_meta(path: Path, uuid: str, w: int, h: int) -> None:
    hw, hh = w / 2.0, h / 2.0
    path.with_suffix(".jpg.meta").write_text(
        f"""{{
  "ver": "1.0.27",
  "importer": "image",
  "imported": true,
  "uuid": "{uuid}",
  "files": [
    ".jpg",
    ".json"
  ],
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
      "files": [
        ".json"
      ],
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
          "rawPosition": [
            {-hw},
            {-hh},
            0,
            {hw},
            {-hh},
            0,
            {-hw},
            {hh},
            0,
            {hw},
            {hh},
            0
          ],
          "indexes": [
            0,
            1,
            2,
            2,
            1,
            3
          ],
          "uv": [
            0,
            {h},
            {w},
            {h},
            0,
            0,
            {w},
            0
          ],
          "nuv": [
            0,
            0,
            1,
            0,
            0,
            1,
            1,
            1
          ],
          "minPos": [
            {-hw},
            {-hh},
            0
          ],
          "maxPos": [
            {hw},
            {hh},
            0
          ]
        }},
        "isUuid": true,
        "imageUuidOrDatabaseUri": "{uuid}@6c48a",
        "atlasUuid": "",
        "trimType": "none"
      }},
      "ver": "1.0.12",
      "imported": true,
      "files": [
        ".json"
      ],
      "subMetas": {{}}
    }}
  }},
  "userData": {{
    "type": "sprite-frame",
    "fixAlphaTransparencyArtifacts": false,
    "hasAlpha": false,
    "redirect": "{uuid}@6c48a",
    "maxWidth": {w},
    "maxHeight": {h},
    "compressSettings": {{
      "useCompressTexture": false,
      "presetId": "webOpaque"
    }}
  }}
}}
""",
        encoding="utf-8",
    )


def crop_to_1920(src: Image.Image) -> Image.Image:
    w, h = src.size
    target_h = int(round(w * SRC_H / BG_W))
    if target_h > h:
        target_w = int(round(h * BG_W / SRC_H))
        x0 = (w - target_w) // 2
        box = (x0, 0, x0 + target_w, h)
    else:
        y0 = max(0, (h - target_h) // 2)
        box = (0, y0, w, y0 + target_h)
    return src.crop(box).resize((BG_W, SRC_H), Image.LANCZOS)


def smear(src: Image.Image, extra: int, side: str) -> Image.Image:
    w, h = src.size
    band = min(48, h // 8)
    if side == "top":
        strip = src.crop((0, 0, w, band))
    else:
        # Keep growing grass downward — do not flip, or tall phones show a fake pond.
        strip = src.crop((0, h - band, w, h))
    stretched = strip.resize((w, extra), Image.LANCZOS)
    fade = ImageEnhance.Color(stretched).enhance(0.96)
    return fade.filter(ImageFilter.GaussianBlur(radius=1.8))


def stitch_seam(canvas: Image.Image, src: Image.Image, y: int, from_src: bool) -> None:
    seam = 16
    w = canvas.size[0]
    for i in range(seam):
        t = (i + 1) / (seam + 1)
        if from_src:
            y0 = y - seam + i
            row_a = canvas.crop((0, y0, w, y0 + 1))
            row_b = src.crop((0, 0, w, 1))
            canvas.paste(Image.blend(row_a, row_b, t), (0, y0))
        else:
            y1 = y + i
            row_c = src.crop((0, src.size[1] - 1, w, src.size[1]))
            row_d = canvas.crop((0, y1, w, y1 + 1))
            canvas.paste(Image.blend(row_c, row_d, t), (0, y1))


def wash_tip_zone(im: Image.Image) -> None:
    """Lift the mid-screen oval so the 780x460 tip card sits on calm light."""
    w, h = im.size
    veil = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(veil)
    # Tip node is 80px above design center; keep a wide quiet oval around it.
    cx, cy = w * 0.5, h * 0.5 - 70
    rw, rh = 430, 390
    box = (cx - rw, cy - rh, cx + rw, cy + rh)
    draw.ellipse(box, fill=(255, 246, 220, 78))
    inner = (cx - rw * 0.62, cy - rh * 0.58, cx + rw * 0.62, cy + rh * 0.58)
    draw.ellipse(inner, fill=(255, 250, 232, 46))
    soft = veil.filter(ImageFilter.GaussianBlur(radius=48))
    im.alpha_composite(soft)


def extend_to_2200(src: Image.Image) -> Image.Image:
    extra = BG_H - SRC_H
    top_h = extra // 2
    bot_h = extra - top_h
    canvas = Image.new("RGB", (BG_W, BG_H))
    top = smear(src, top_h, "top")
    bot = smear(src, bot_h, "bottom")
    canvas.paste(top, (0, 0))
    canvas.paste(src, (0, top_h))
    canvas.paste(bot, (0, top_h + SRC_H))
    stitch_seam(canvas, src, top_h, True)
    stitch_seam(canvas, src, top_h + SRC_H, False)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing studio source {SRC}")
    WORK.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC, WORK)
    framed = crop_to_1920(Image.open(SRC).convert("RGB"))
    rgba = framed.convert("RGBA")
    wash_tip_zone(rgba)
    out = extend_to_2200(rgba.convert("RGB"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "JPEG", quality=92, optimize=True)
    write_meta(OUT, UUID, BG_W, BG_H)
    print(f"wrote {OUT} {out.size} from {SRC} via {WORK}")


if __name__ == "__main__":
    main()
