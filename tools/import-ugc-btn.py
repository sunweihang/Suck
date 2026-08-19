#!/usr/bin/env python3
"""Knock out the AI 创作 icon background and write ui/btn-ugc.png."""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"C:\Users\elex\.cursor\projects\d-Custom-Suck\assets\btn-ugc-src.png")
OUT = Path(__file__).resolve().parents[1] / "assets" / "resources" / "ui" / "btn-ugc.png"
UUID = "7e22bb20-0088-4b02-8002-000000000088"
SIZE = 256


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


def _dilate(mask: np.ndarray, rad: int) -> np.ndarray:
    out = mask.copy()
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            if dx * dx + dy * dy > rad * rad:
                continue
            shifted = np.zeros_like(mask)
            ys = slice(max(0, dy), mask.shape[0] + min(0, dy))
            xs = slice(max(0, dx), mask.shape[1] + min(0, dx))
            src_y = slice(max(0, -dy), mask.shape[0] - max(0, dy))
            src_x = slice(max(0, -dx), mask.shape[1] - max(0, dx))
            shifted[ys, xs] = mask[src_y, src_x]
            out |= shifted
    return out


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    outside = np.zeros((h, w), dtype=bool)
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        q.append((0, x))
        q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0))
        q.append((y, w - 1))
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x]:
            continue
        seen[y, x] = True
        if mask[y, x]:
            continue
        outside[y, x] = True
        q.append((y + 1, x))
        q.append((y - 1, x))
        q.append((y, x + 1))
        q.append((y, x - 1))
    return mask | (~outside)


def knockout(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = rgb.mean(axis=2)
    # Mid-gray plate from the generator. White plus / highlights stay protected.
    gray_bg = (sat <= 0.12) & (np.abs(lum - 128.0) <= 36.0)
    color = sat >= 0.18
    keep = _fill_holes(_dilate(color, 3))

    bg = np.zeros((h, w), dtype=bool)
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        q.append((0, x))
        q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0))
        q.append((y, w - 1))
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x]:
            continue
        seen[y, x] = True
        if keep[y, x] or not gray_bg[y, x]:
            continue
        bg[y, x] = True
        q.append((y + 1, x))
        q.append((y - 1, x))
        q.append((y, x + 1))
        q.append((y, x - 1))

    alpha = np.where(bg, 0.0, 255.0)
    fringe = gray_bg & (~bg) & (~keep)
    fade = np.clip(1.0 - np.abs(lum - 128.0) / 36.0, 0.0, 1.0)
    alpha = np.where(fringe, alpha * (1.0 - fade * 0.85), alpha)
    # Soft shadows: leftover dark gray near the knockout stays as dark-tinted alpha.
    shadow = (~keep) & (~bg) & (sat <= 0.10) & (lum < 110)
    alpha = np.where(shadow, np.clip((110.0 - lum) * 2.2, 0, 140), alpha)
    return np.clip(alpha, 0, 255).astype(np.uint8)


def crop_pad(arr: np.ndarray, pad: int = 18) -> np.ndarray:
    ys, xs = np.where(arr[:, :, 3] > 8)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    cut = arr[y0:y1, x0:x1]
    canvas = np.zeros((cut.shape[0] + pad * 2, cut.shape[1] + pad * 2, 4), dtype=np.uint8)
    canvas[pad : pad + cut.shape[0], pad : pad + cut.shape[1]] = cut
    return canvas


def fit_square(arr: np.ndarray, size: int) -> np.ndarray:
    im = Image.fromarray(arr, "RGBA")
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - im.width) // 2
    y = (size - im.height) // 2
    canvas.paste(im, (x, y), im)
    return np.array(canvas)


def publish_library() -> None:
    root = OUT.resolve().parents[3]
    lib = root / "library" / "7e"
    lib.mkdir(parents=True, exist_ok=True)
    stem = UUID
    dest = lib / f"{stem}.png"
    dest.write_bytes(OUT.read_bytes())
    (lib / f"{stem}.json").write_text(
        '{\n  "__type__": "cc.ImageAsset",\n  "content": {\n    "fmt": "0",\n    "w": 0,\n    "h": 0\n  }\n}\n',
        encoding="utf-8",
    )
    (lib / f"{stem}@6c48a.json").write_text(
        '{\n  "__type__": "cc.Texture2D",\n  "content": {\n    "base": "2,2,2,2,0,0",\n    "mipmaps": [\n      "'
        + UUID
        + '"\n    ]\n  }\n}\n',
        encoding="utf-8",
    )
    hw = SIZE / 2.0
    (lib / f"{stem}@f9941.json").write_text(
        f"""{{
  "__type__": "cc.SpriteFrame",
  "content": {{
    "name": "btn-ugc",
    "atlas": "",
    "rect": {{ "x": 0, "y": 0, "width": {SIZE}, "height": {SIZE} }},
    "offset": {{ "x": 0, "y": 0 }},
    "originalSize": {{ "width": {SIZE}, "height": {SIZE} }},
    "rotated": false,
    "capInsets": [0, 0, 0, 0],
    "vertices": {{
      "rawPosition": [{-hw}, {-hw}, 0, {hw}, {-hw}, 0, {-hw}, {hw}, 0, {hw}, {hw}, 0],
      "indexes": [0, 1, 2, 2, 1, 3],
      "uv": [0, {SIZE}, {SIZE}, {SIZE}, 0, 0, {SIZE}, 0],
      "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
      "minPos": {{ "x": {-hw}, "y": {-hw}, "z": 0 }},
      "maxPos": {{ "x": {hw}, "y": {hw}, "z": 0 }}
    }},
    "texture": "{UUID}@6c48a",
    "packable": false,
    "pixelsToUnit": 100,
    "pivot": {{ "x": 0.5, "y": 0.5 }},
    "meshType": 0
  }}
}}
""",
        encoding="utf-8",
    )
    info_path = root / "library" / ".assets-info.json"
    raw = info_path.read_text(encoding="utf-8")
    now = OUT.stat().st_mtime * 1000
    png_key = '"resources\\\\ui\\\\btn-ugc.png"'
    if png_key not in raw:
        needle = '"resources\\\\ui\\\\btn-settings-bg.png": {'
        insert = (
            f'"resources\\\\ui\\\\btn-ugc.png": {{\n'
            f'      "time": {now},\n'
            f'      "uuid": "{UUID}"\n'
            f'    }},\n    '
        )
        raw = raw.replace(needle, insert + needle, 1)
        needle_m = '"resources\\\\ui\\\\btn-settings-bg.png.meta": {'
        insert_m = (
            f'"resources\\\\ui\\\\btn-ugc.png.meta": {{\n'
            f'      "time": {now}\n'
            f'    }},\n    '
        )
        raw = raw.replace(needle_m, insert_m + needle_m, 1)
        info_path.write_text(raw, encoding="utf-8")
    print("library", dest)


def main() -> None:
    if SRC.exists():
        im = Image.open(SRC).convert("RGBA")
        arr = np.array(im)
        arr[:, :, 3] = knockout(arr[:, :, :3].astype(np.float32))
        arr = crop_pad(arr)
        arr = fit_square(arr, SIZE)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(arr, "RGBA").save(OUT, "PNG")
        write_meta(OUT, UUID, SIZE, SIZE)
        print("wrote", OUT, arr.shape, "alpha0", int((arr[:, :, 3] == 0).sum()))
    if not OUT.exists():
        raise SystemExit(f"missing {OUT}")
    publish_library()


if __name__ == "__main__":
    main()
