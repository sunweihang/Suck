#!/usr/bin/env python3
"""Settings option icons: haptic / home / skip / reset. 112px, candy outline."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui"

YELLOW = (251, 225, 20, 255)
CYAN = (86, 214, 246, 255)
PINK = (255, 132, 168, 255)
MINT = (92, 220, 176, 255)
PURPLE = (168, 112, 220, 255)
WHITE = (255, 255, 255, 255)

ICONS = [
    ("ic-haptic.png", "7e22bb20-0098-4b02-8002-000000000098", "haptic"),
    ("ic-home-row.png", "7e22bb20-0099-4b02-8002-000000000099", "home"),
    ("ic-skip.png", "7e22bb20-009a-4b02-8002-00000000009a", "skip"),
    ("ic-reset.png", "7e22bb20-009b-4b02-8002-00000000009b", "reset"),
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
    "redirect": "{uuid}@6c48a"
  }}
}}
""",
        encoding="utf-8",
    )


def stroke_width(ss: int) -> int:
    return max(18, round(14 * ss / 4))


def rounded_rect(draw: ImageDraw.ImageDraw, box, r, fill, outline, width):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def line(draw: ImageDraw.ImageDraw, a, b, fill, width):
    draw.line([a, b], fill=fill, width=width, joint="curve")


def draw_haptic(ss: int) -> Image.Image:
    s = 112 * ss
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = stroke_width(ss)
    # vibration ticks
    for dx in (-1, 1):
        x0 = s * 0.5 + dx * s * 0.34
        for i, y in enumerate((0.28, 0.42, 0.56, 0.70)):
            stretch = 0.04 if i in (1, 2) else 0.025
            line(d, (x0, s * y), (x0 + dx * s * stretch, s * y), PURPLE, max(10, w - 4))
    # phone
    box = (s * 0.32, s * 0.18, s * 0.68, s * 0.82)
    rounded_rect(d, box, s * 0.08, YELLOW, PURPLE, w)
    rounded_rect(d, (s * 0.38, s * 0.26, s * 0.62, s * 0.62), s * 0.04, WHITE, PURPLE, max(8, w - 6))
    d.ellipse((s * 0.46, s * 0.68, s * 0.54, s * 0.76), fill=PURPLE)
    d.arc((s * 0.36, s * 0.22, s * 0.50, s * 0.38), 200, 320, fill=WHITE, width=max(6, w // 3))
    return im.resize((112, 112), Image.LANCZOS)


def draw_home(ss: int) -> Image.Image:
    s = 112 * ss
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = stroke_width(ss)
    roof = [(s * 0.16, s * 0.48), (s * 0.50, s * 0.16), (s * 0.84, s * 0.48)]
    d.polygon(roof, fill=PINK, outline=PURPLE)
    d.line(roof + [roof[0]], fill=PURPLE, width=w, joint="curve")
    rounded_rect(d, (s * 0.28, s * 0.46, s * 0.72, s * 0.84), s * 0.04, CYAN, PURPLE, w)
    rounded_rect(d, (s * 0.42, s * 0.56, s * 0.58, s * 0.84), s * 0.03, YELLOW, PURPLE, max(8, w - 4))
    d.ellipse((s * 0.52, s * 0.66, s * 0.57, s * 0.71), fill=PURPLE)
    return im.resize((112, 112), Image.LANCZOS)


def draw_skip(ss: int) -> Image.Image:
    s = 112 * ss
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = stroke_width(ss)
    d.ellipse((s * 0.10, s * 0.10, s * 0.90, s * 0.90), fill=MINT, outline=PURPLE, width=w)
    tri = [(s * 0.30, s * 0.30), (s * 0.62, s * 0.50), (s * 0.30, s * 0.70)]
    d.polygon(tri, fill=YELLOW, outline=PURPLE)
    d.line(tri + [tri[0]], fill=PURPLE, width=max(8, w - 4), joint="curve")
    bar = (s * 0.64, s * 0.30, s * 0.74, s * 0.70)
    rounded_rect(d, bar, s * 0.03, YELLOW, PURPLE, max(8, w - 4))
    return im.resize((112, 112), Image.LANCZOS)


def draw_reset(ss: int) -> Image.Image:
    s = 112 * ss
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = stroke_width(ss)
    d.ellipse((s * 0.12, s * 0.12, s * 0.88, s * 0.88), fill=CYAN, outline=PURPLE, width=w)
    ring = (s * 0.28, s * 0.28, s * 0.72, s * 0.72)
    d.arc(ring, 40, 300, fill=YELLOW, width=max(16, w + 4))
    d.arc(ring, 40, 300, fill=PURPLE, width=max(8, w - 2))
    head = [(s * 0.62, s * 0.18), (s * 0.82, s * 0.28), (s * 0.60, s * 0.38)]
    d.polygon(head, fill=YELLOW, outline=PURPLE)
    d.line(head + [head[0]], fill=PURPLE, width=max(8, w - 4), joint="curve")
    return im.resize((112, 112), Image.LANCZOS)


DRAW = {
    "haptic": draw_haptic,
    "home": draw_home,
    "skip": draw_skip,
    "reset": draw_reset,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, uuid, kind in ICONS:
        path = OUT / name
        im = DRAW[kind](4)
        im.save(path)
        write_meta(path, uuid, 112, 112)
        print(f"wrote {path.name}")


if __name__ == "__main__":
    main()
