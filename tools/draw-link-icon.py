#!/usr/bin/env python3
"""连线 icon: render assets/resources/meshes/toy-shooter.json at play pose."""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MESH = ROOT / "assets/resources/meshes/toy-shooter.json"
OUT = ROOT / "assets/resources/ui/ic-link.png"
UUID = "7e22bb20-009c-4b02-8002-00000000009c"
SIZE = 256
PINK = np.array([231, 58, 148], dtype=np.float32)
RED = np.array([207, 36, 48], dtype=np.float32)
LINE = (255, 92, 148, 255)
LINE_INK = (88, 32, 64, 255)
# Same as ToyLook / TurretPose + play camera pitch.
BODY_PITCH = 45.0
# Play camera looks down at the wall; the dock is at the bottom, so the
# turret is seen nearly head-on. Do not subtract camera pitch or the lid
# flattens into a top-down plate.
CAM_PITCH = 0.0


def write_meta(path, uuid, w, h):
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


def rot_x(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float32)


def load_mesh():
    data = json.loads(MESH.read_text())
    pos = np.asarray(data["p"], dtype=np.float32).reshape(-1, 3)
    nrm = np.asarray(data["n"], dtype=np.float32).reshape(-1, 3)
    idx = np.asarray(data["i"], dtype=np.int32).reshape(-1, 3)
    return pos, nrm, idx


def raster(pos, nrm, idx, rgb, side=320, pad=0.18):
    r = rot_x(BODY_PITCH)
    view = rot_x(-CAM_PITCH)
    m = view @ r
    p = pos @ m.T
    n = nrm @ m.T
    n /= np.clip(np.linalg.norm(n, axis=1, keepdims=True), 1e-6, None)

    xs, ys, zs = p[:, 0], p[:, 1], p[:, 2]
    span = max(xs.max() - xs.min(), ys.max() - ys.min()) or 1
    scale = (side * (1 - pad * 2)) / span
    cx = (xs.min() + xs.max()) * 0.5
    cy = (ys.min() + ys.max()) * 0.5
    u = (xs - cx) * scale + side * 0.5
    v = side * 0.5 - (ys - cy) * scale

    color = np.zeros((side, side, 4), dtype=np.float32)
    zbuf = np.full((side, side), -1e9, dtype=np.float32)
    light = np.array([-0.42, 0.78, 0.46], dtype=np.float32)
    light /= np.linalg.norm(light)
    ink = np.array(
        [max(32, rgb[0] * 0.42), max(26, rgb[1] * 0.36), max(24, rgb[2] * 0.32)],
        dtype=np.float32,
    )

    paint_tris(u, v, zs, n, idx, color, zbuf, rgb, light)
    hull = 1.055
    uh = (xs - cx) * scale * hull + side * 0.5
    vh = side * 0.5 - (ys - cy) * scale * hull
    paint_hull(uh, vh, idx, color, ink)

    out = np.clip(color, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def paint_tris(u, v, z, n, idx, color, zbuf, rgb, light):
    h, w = zbuf.shape
    for a, b, c in idx:
        ua, va, za = u[a], v[a], z[a]
        ub, vb, zb = u[b], v[b], z[b]
        uc, vc, zc = u[c], v[c], z[c]
        area = (ub - ua) * (vc - va) - (uc - ua) * (vb - va)
        if area <= 1e-5:
            continue
        ndot = float(np.clip(n[a].dot(light), 0.0, 1.0))
        shade = 0.58 + 0.52 * ndot
        shine = (ndot ** 12) * 48.0
        fill = np.clip(rgb * shade + shine, 0, 255)
        x0 = max(0, int(math.floor(min(ua, ub, uc))))
        x1 = min(w - 1, int(math.ceil(max(ua, ub, uc))))
        y0 = max(0, int(math.floor(min(va, vb, vc))))
        y1 = min(h - 1, int(math.ceil(max(va, vb, vc))))
        if x0 > x1 or y0 > y1:
            continue
        inv = 1.0 / area
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                w0 = ((ub - x) * (vc - y) - (uc - x) * (vb - y)) * inv
                w1 = ((uc - x) * (va - y) - (ua - x) * (vc - y)) * inv
                w2 = 1.0 - w0 - w1
                if w0 < 0 or w1 < 0 or w2 < 0:
                    continue
                zz = w0 * za + w1 * zb + w2 * zc
                if zz <= zbuf[y, x]:
                    continue
                zbuf[y, x] = zz
                color[y, x, 0] = fill[0]
                color[y, x, 1] = fill[1]
                color[y, x, 2] = fill[2]
                color[y, x, 3] = 255


def paint_hull(u, v, idx, color, ink):
    h, w = color.shape[:2]
    for a, b, c in idx:
        ua, va = u[a], v[a]
        ub, vb = u[b], v[b]
        uc, vc = u[c], v[c]
        area = (ub - ua) * (vc - va) - (uc - ua) * (vb - va)
        if abs(area) <= 1e-5:
            continue
        x0 = max(0, int(math.floor(min(ua, ub, uc))))
        x1 = min(w - 1, int(math.ceil(max(ua, ub, uc))))
        y0 = max(0, int(math.floor(min(va, vb, vc))))
        y1 = min(h - 1, int(math.ceil(max(va, vb, vc))))
        if x0 > x1 or y0 > y1:
            continue
        inv = 1.0 / area
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if color[y, x, 3] > 0:
                    continue
                w0 = ((ub - x) * (vc - y) - (uc - x) * (vb - y)) * inv
                w1 = ((uc - x) * (va - y) - (ua - x) * (vc - y)) * inv
                w2 = 1.0 - w0 - w1
                if w0 < 0 or w1 < 0 or w2 < 0:
                    continue
                color[y, x, 0] = ink[0]
                color[y, x, 1] = ink[1]
                color[y, x, 2] = ink[2]
                color[y, x, 3] = 255


def font(size):
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def stamp_power(im, label):
    d = ImageDraw.Draw(im)
    fnt = font(max(22, im.size[1] // 5))
    bb = im.getbbox()
    if not bb:
        return
    cx = (bb[0] + bb[2]) * 0.5
    cy = (bb[1] + bb[3]) * 0.46
    tw, th = d.textbbox((0, 0), label, font=fnt)[2:]
    tx, ty = cx - tw * 0.5, cy - th * 0.5
    for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)):
        d.text((tx + dx, ty + dy), label, font=fnt, fill=(16, 14, 20, 255))
    d.text((tx, ty), label, font=fnt, fill=(255, 255, 255, 255))


def crop_fit(im):
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def main():
    pos, nrm, idx = load_mesh()
    pink = crop_fit(raster(pos, nrm, idx, PINK))
    red = crop_fit(raster(pos, nrm, idx, RED))
    stamp_power(pink, "72")
    stamp_power(red, "40")

    ss = 4
    s = SIZE * ss
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    body = int(s * 0.46)

    def paste(src, cx):
        scale = body / src.size[1]
        w = max(1, int(round(src.size[0] * scale)))
        h = max(1, int(round(src.size[1] * scale)))
        spr = src.resize((w, h), Image.LANCZOS)
        x = int(round(cx - w * 0.5))
        y = int(round(s * 0.52 - h * 0.5))
        canvas.alpha_composite(spr, (x, y))
        return (cx, int(s * 0.52))

    left = paste(pink, int(s * 0.30))
    right = paste(red, int(s * 0.70))
    line = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(line)
    d.line([left, right], fill=LINE_INK, width=int(s * 0.070))
    d.line([left, right], fill=LINE, width=int(s * 0.046))
    canvas = Image.alpha_composite(line.filter(ImageFilter.GaussianBlur(ss * 0.28)), canvas)

    crop = crop_fit(canvas)
    pad = int(round(max(crop.size) * 0.06))
    side = max(crop.size) + pad * 2
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2), crop)
    out = square.resize((SIZE, SIZE), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    write_meta(OUT, UUID, SIZE, SIZE)
    print(OUT, out.size, "bbox", out.getbbox())


if __name__ == "__main__":
    main()
