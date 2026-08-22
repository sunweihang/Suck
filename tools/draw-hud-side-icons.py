#!/usr/bin/env python3
"""Play HUD side icons: home / game-circle. Match ic-gear purple glossy."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui"
SIZE = 112
SS = 8

FILL = (207, 173, 231, 255)
STROKE = (135, 112, 190, 255)
HI = (248, 240, 251, 255)

ICONS = [
    ("ic-hud-home.png", "7e22bb20-00a2-4b02-8002-0000000000a2", "home"),
    ("ic-hud-club.png", "7e22bb20-00a3-4b02-8002-0000000000a3", "club"),
]


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
    "maxWidth": 512,
    "maxHeight": 512,
    "compressSettings": {{
      "useCompressTexture": false,
      "presetId": "webUi"
    }}
  }}
}}
""",
        encoding="utf-8",
    )


def down(im: Image.Image) -> Image.Image:
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def stroke_w() -> int:
    return max(22, round(9 * SS))


def highlight(im: Image.Image, box, thick: int) -> None:
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.arc(box, 200, 330, fill=HI, width=thick)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=SS * 0.35))
    im.alpha_composite(overlay)


def draw_home() -> Image.Image:
    s = SIZE * SS
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = stroke_w()

    roof = [(s * 0.14, s * 0.50), (s * 0.50, s * 0.14), (s * 0.86, s * 0.50)]
    d.polygon(roof, fill=FILL)
    d.line(roof + [roof[0]], fill=STROKE, width=w, joint="curve")

    body = (s * 0.26, s * 0.44, s * 0.74, s * 0.88)
    d.rounded_rectangle(body, radius=s * 0.05, fill=FILL, outline=STROKE, width=w)

    # cover the roof/body seam
    d.rectangle((s * 0.30, s * 0.44, s * 0.70, s * 0.52), fill=FILL)

    door = (s * 0.42, s * 0.60, s * 0.58, s * 0.88)
    d.rounded_rectangle(door, radius=s * 0.04, fill=STROKE)

    highlight(im, (s * 0.22, s * 0.20, s * 0.48, s * 0.46), max(10, w // 3))
    return down(im)


def person(d: ImageDraw.ImageDraw, cx: float, s: float, scale: float, w: int) -> None:
    head_r = s * 0.11 * scale
    hy = s * 0.36
    d.ellipse((cx - head_r, hy - head_r, cx + head_r, hy + head_r), fill=FILL, outline=STROKE, width=w)
    body = (
        cx - s * 0.16 * scale,
        s * 0.48,
        cx + s * 0.16 * scale,
        s * 0.86,
    )
    d.rounded_rectangle(body, radius=s * 0.10 * scale, fill=FILL, outline=STROKE, width=w)


def draw_club() -> Image.Image:
    s = SIZE * SS
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = stroke_w()

    ring = (s * 0.08, s * 0.08, s * 0.92, s * 0.92)
    d.ellipse(ring, fill=FILL, outline=STROKE, width=w)

    person(d, s * 0.38, s, 0.92, max(16, w - 6))
    person(d, s * 0.62, s, 0.92, max(16, w - 6))

    highlight(im, (s * 0.16, s * 0.14, s * 0.48, s * 0.44), max(10, w // 3))
    return down(im)


DRAW = {
    "home": draw_home,
    "club": draw_club,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, uuid, kind in ICONS:
        path = OUT / name
        im = DRAW[kind]()
        im.save(path)
        write_meta(path, uuid, SIZE, SIZE)
        print(f"wrote {path.name} {im.size} bbox={im.getbbox()}")


if __name__ == "__main__":
    main()
