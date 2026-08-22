#!/usr/bin/env python3
"""AI volume slider chrome → nine-slice track/fill + thumb. Keep UUIDs."""

import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets")
WORK = ROOT / "tools/ai-item"
OUT = ROOT / "assets/resources/ui"

TRACK_UUID = "7e22bb20-006b-4b02-8002-00000000006b"
FILL_UUID = "7e22bb20-006c-4b02-8002-00000000006c"
THUMB_UUID = "7e22bb20-006d-4b02-8002-00000000006d"

TRACK_H = 64
FILL_H = 56
THUMB_SIZE = 128
CENTER_W = 12


def write_meta(path: Path, uuid: str, w: int, h: int, bl: int = 0, br: int = 0) -> None:
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


def flood_alpha(rgb: Image.Image) -> Image.Image:
    arr = np.asarray(rgb.convert("RGB"), dtype=np.float32)
    lum = arr.mean(axis=2)
    sat = arr.max(axis=2) - arr.min(axis=2)
    bg = (lum < 28) & (sat < 18)
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


def decontaminate(im: Image.Image) -> Image.Image:
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
    a = arr[:, :, 3:4] / 255.0
    rgb = arr[:, :, :3]
    # Lift leftover black fringe toward nearby opaque color.
    rgb = np.where(a < 0.18, rgb, rgb)
    lifted = np.clip(rgb + (1.0 - a) * 18.0, 0, 255)
    arr[:, :, :3] = np.where(a > 0, lifted, rgb)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def fit_square(im: Image.Image, size: int) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
    crop = im.crop(bbox)
    pad = int(round(max(crop.size) * 0.06))
    side = max(crop.size) + pad * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2), crop)
    return canvas.resize((size, size), Image.LANCZOS)


def make_sliced_bar(im, dest_h, center_w=CENTER_W):
    bbox = im.getbbox()
    if not bbox:
        raise RuntimeError("empty bar after cut")
    crop = im.crop(bbox)
    pad = 3
    canvas = Image.new("RGBA", (crop.size[0] + pad * 2, crop.size[1] + pad * 2), (0, 0, 0, 0))
    canvas.paste(crop, (pad, pad), crop)
    scale = dest_h / canvas.size[1]
    dest_w = max(int(round(canvas.size[0] * scale)), dest_h + center_w + 16)
    resized = canvas.resize((dest_w, dest_h), Image.LANCZOS)
    # Capsule ends must stay ≤ half height so a min-width pill does not squash.
    cap = dest_h // 2
    if 2 * cap + center_w > dest_w:
        cap = max(8, (dest_w - center_w) // 2)
    left = resized.crop((0, 0, cap, dest_h))
    right = resized.crop((dest_w - cap, 0, dest_w, dest_h))
    mid = dest_w // 2
    sample_l = max(cap, mid - 6)
    sample_r = min(dest_w - cap, mid + 7)
    arr = np.asarray(resized, dtype=np.float32)
    col = arr[:, sample_l:sample_r].mean(axis=1)
    center = np.repeat(col.reshape(dest_h, 1, 4), center_w, axis=1)
    center_im = Image.fromarray(np.clip(center, 0, 255).astype(np.uint8), "RGBA")
    out = Image.new("RGBA", (cap + center_w + cap, dest_h), (0, 0, 0, 0))
    out.paste(left, (0, 0), left)
    out.paste(center_im, (cap, 0), center_im)
    out.paste(right, (cap + center_w, 0), right)
    return out, cap, cap


def load_studio(name: str) -> Image.Image:
    src = SRC_DIR / name
    if not src.exists():
        raise SystemExit("missing studio: %s" % src)
    WORK.mkdir(parents=True, exist_ok=True)
    studio = WORK / name
    shutil.copy2(src, studio)
    raw = Image.open(studio).convert("RGBA")
    cut = decontaminate(flood_alpha(raw))
    cache = WORK / name.replace("-studio.png", ".rmbg.png")
    cut.save(cache, "PNG")
    print("cut", name, cut.size, "bbox", cut.getbbox())
    return cut


def write_preview(track: Image.Image, fill: Image.Image, thumb: Image.Image, cap_t: int, cap_f: int) -> None:
    prev_w, prev_h = 720, 180
    prev = Image.new("RGBA", (prev_w, prev_h), (232, 228, 244, 255))
    track_w = 560
    stretched = Image.new("RGBA", (track_w, track.size[1]), (0, 0, 0, 0))
    left = track.crop((0, 0, cap_t, track.size[1])).resize((cap_t, track.size[1]), Image.LANCZOS)
    right = track.crop((track.size[0] - cap_t, 0, track.size[0], track.size[1]))
    mid = track.crop((cap_t, 0, track.size[0] - cap_t, track.size[1])).resize(
        (track_w - 2 * cap_t, track.size[1]), Image.LANCZOS
    )
    stretched.paste(left, (0, 0), left)
    stretched.paste(mid, (cap_t, 0), mid)
    stretched.paste(right, (track_w - cap_t, 0), right)
    ty = 36
    prev.paste(stretched, (80, ty), stretched)
    fill_w = 340
    f_st = Image.new("RGBA", (fill_w, fill.size[1]), (0, 0, 0, 0))
    fl = fill.crop((0, 0, cap_f, fill.size[1]))
    fr = fill.crop((fill.size[0] - cap_f, 0, fill.size[0], fill.size[1]))
    fm = fill.crop((cap_f, 0, fill.size[0] - cap_f, fill.size[1])).resize(
        (fill_w - 2 * cap_f, fill.size[1]), Image.LANCZOS
    )
    f_st.paste(fl, (0, 0), fl)
    f_st.paste(fm, (cap_f, 0), fm)
    f_st.paste(fr, (fill_w - cap_f, 0), fr)
    fy = ty + (track.size[1] - fill.size[1]) // 2
    prev.paste(f_st, (88, fy), f_st)
    tw = 72
    th = thumb.resize((tw, tw), Image.LANCZOS)
    prev.paste(th, (80 + fill_w - tw // 2, ty + track.size[1] // 2 - tw // 2), th)
    d = ImageDraw.Draw(prev)
    d.rounded_rectangle((16, 12, prev_w - 16, prev_h - 12), 28, outline=(90, 70, 150, 80), width=3)
    dest = WORK / "volume-slider-preview.png"
    prev.save(dest, "PNG")
    print("preview", dest)


def main() -> None:
    track_cut = load_studio("volume-track-studio.png")
    fill_cut = load_studio("volume-fill-studio.png")
    thumb_cut = load_studio("slider-thumb-studio.png")

    track, tl, tr = make_sliced_bar(track_cut, TRACK_H)
    fill, fl, fr = make_sliced_bar(fill_cut, FILL_H)
    thumb = fit_square(thumb_cut, THUMB_SIZE)

    dest_t = OUT / "volume-track.png"
    dest_f = OUT / "volume-fill.png"
    dest_h = OUT / "slider-thumb.png"
    dest_t.parent.mkdir(parents=True, exist_ok=True)
    track.save(dest_t, "PNG")
    fill.save(dest_f, "PNG")
    thumb.save(dest_h, "PNG")
    write_meta(dest_t, TRACK_UUID, track.size[0], track.size[1], tl, tr)
    write_meta(dest_f, FILL_UUID, fill.size[0], fill.size[1], fl, fr)
    write_meta(dest_h, THUMB_UUID, thumb.size[0], thumb.size[1])
    write_preview(track, fill, thumb, tl, fl)
    print("track", track.size, "caps", tl, tr)
    print("fill", fill.size, "caps", fl, fr)
    print("thumb", thumb.size, "bbox", thumb.getbbox())


if __name__ == "__main__":
    main()
