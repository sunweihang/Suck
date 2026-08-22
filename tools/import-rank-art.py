#!/usr/bin/env python3
"""Import ranking chrome from ~/Downloads/排行 and write compact UI sprites."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/Downloads/排行")
OUT = ROOT / "assets/resources/ui"

ITEMS = (
    ("RankingItemBg.png", "rank-item-bg.png", "7e22bb20-0090-4b02-8002-000000000090", 1),
    ("RankingNumberBg.png", "rank-num-bg.png", "7e22bb20-0091-4b02-8002-000000000091", 2),
    ("Gold.png", "rank-gold.png", "7e22bb20-0092-4b02-8002-000000000092", 2),
    ("Sliver.png", "rank-silver.png", "7e22bb20-0093-4b02-8002-000000000093", 2),
    ("Bronze.png", "rank-bronze.png", "7e22bb20-0094-4b02-8002-000000000094", 2),
)

PLATE_UUID = "7e22bb20-0095-4b02-8002-000000000095"
AVATAR_UUID = "7e22bb20-0096-4b02-8002-000000000096"
BG_UUID = "7e22bb20-0097-4b02-8002-000000000097"
AVATAR = 240
RADIUS = 48


def write_meta(path: Path, uuid: str, w: int, h: int) -> None:
    hw, hh = w / 2.0, h / 2.0
    path.with_suffix(".png.meta").write_text(
        f"""{{
  "ver": "1.0.27",
  "importer": "image",
  "imported": true,
  "uuid": "{uuid}",
  "files": [
    ".json",
    ".png"
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
    "fixAlphaTransparencyArtifacts": true,
    "hasAlpha": true,
    "redirect": "{uuid}@6c48a",
    "maxWidth": {max(w, 8)},
    "maxHeight": {max(h, 8)},
    "compressSettings": {{
      "useCompressTexture": false,
      "presetId": "webUi"
    }}
  }}
}}
""",
        encoding="utf-8",
    )


def save(im: Image.Image, dest: Path, uuid: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG", optimize=True)
    write_meta(dest, uuid, im.size[0], im.size[1])
    print(f"wrote {dest.relative_to(ROOT)} {im.size}")


def import_src() -> None:
    for src_name, dest_name, uuid, scale in ITEMS:
        src = SRC / src_name
        if not src.exists():
            raise SystemExit(f"missing {src}")
        im = Image.open(src).convert("RGBA")
        if scale != 1:
            im = im.resize((im.size[0] * scale, im.size[1] * scale), Image.LANCZOS)
        save(im, OUT / dest_name, uuid)


def draw_round_rect(size: int, radius: int, fill) -> Image.Image:
    ss = 4
    canvas = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, size * ss - 1, size * ss - 1), radius=radius * ss, fill=fill)
    return canvas.resize((size, size), Image.LANCZOS)


def draw_plate() -> Image.Image:
    return draw_round_rect(AVATAR, RADIUS, (255, 255, 255, 255))


def draw_avatar() -> Image.Image:
    plate = draw_round_rect(AVATAR, RADIUS, (255, 255, 255, 0))
    ss = 4
    big = Image.new("RGBA", (AVATAR * ss, AVATAR * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    cx, cy = AVATAR * ss / 2, AVATAR * ss / 2
    head_r = 38 * ss
    d.ellipse((cx - head_r, cy - 58 * ss, cx + head_r, cy + 18 * ss), fill=(72, 86, 110, 230))
    d.ellipse((cx - 62 * ss, cy + 28 * ss, cx + 62 * ss, cy + 150 * ss), fill=(72, 86, 110, 230))
    icon = big.resize((AVATAR, AVATAR), Image.LANCZOS)
    out = Image.new("RGBA", (AVATAR, AVATAR), (0, 0, 0, 0))
    out.paste(icon, (0, 0), icon)
    mask = plate.split()[-1]
    out.putalpha(ImageChops_min(out.split()[-1], mask))
    return out


def ImageChops_min(a: Image.Image, b: Image.Image) -> Image.Image:
    from PIL import ImageChops

    return ImageChops.darker(a, b)


def draw_bg() -> Image.Image:
    return Image.new("RGBA", (16, 16), (212, 232, 255, 255))


def main() -> None:
    import_src()
    save(draw_plate(), OUT / "rank-avatar-plate.png", PLATE_UUID)
    save(draw_avatar(), OUT / "rank-avatar.png", AVATAR_UUID)
    save(draw_bg(), OUT / "rank-bg.png", BG_UUID)


if __name__ == "__main__":
    main()
