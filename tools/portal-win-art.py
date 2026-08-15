#!/usr/bin/env python3
"""Portal Klein dewatermark + rmbg-v2, then rebuild victory sprites."""

from __future__ import annotations

import importlib.util
import os
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

os.environ.setdefault("RMBG_PORTAL_URL", "http://10.1.4.130:8080")
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tools/ai-win"
OUT_DIR = ROOT / "assets/resources/ui"
DEWATER = Path("/Users/Custom/CartoonGame/scripts/dewatermark-portal-client.py")
RMBG = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")

SRC = {
    "panel-win": Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (3).png"),
    "btn-win-next": Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (4).png"),
    "btn-win-back": Path("/Users/sunix/Downloads/主界面UI关卡显示设计 (5).png"),
}
PROMPT = {
    "panel-win": "remove Doubao 豆包 corner logo watermark, keep rounded white victory card, cyan title, pink octopus, stars and ribbons",
    "btn-win-next": "remove Doubao 豆包 corner logo watermark, keep mint green glossy pill button and 下一关 text",
    "btn-win-back": "remove Doubao 豆包 corner logo watermark, keep cream glossy pill button and 返回 text",
}
UUID = {
    "panel-win": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21",
    "btn-win-next": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    "btn-win-back": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e24",
}


def load_mod(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


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
    "fixAlphaTransparencyArtifacts": false,
    "hasAlpha": true,
    "redirect": "{uuid}@6c48a"
  }}
}}
""",
        encoding="utf-8",
    )


def trim_alpha(im: Image.Image, pad: int = 8) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    return im.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(im.size[0], x1 + pad),
        min(im.size[1], y1 + pad),
    ))


def punch_outer_white(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    walk = Image.new("1", (w, h), 0)
    wp = walk.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            if mn >= 246 and (mx - mn) < 12:
                wp[x, y] = 1
    seen = Image.new("1", (w, h), 0)
    sp = seen.load()
    q = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if wp[x, y] and not sp[x, y]:
            sp[x, y] = 1
            q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and wp[nx, ny] and not sp[nx, ny]:
                sp[nx, ny] = 1
                q.append((nx, ny))
    out = rgb.convert("RGBA")
    op = out.load()
    for y in range(h):
        for x in range(w):
            if sp[x, y]:
                r, g, b, _ = op[x, y]
                op[x, y] = (r, g, b, 0)
    return out


def save_asset(im: Image.Image, name: str) -> Image.Image:
    path = OUT_DIR / f"{name}.png"
    im.save(path, "PNG")
    write_meta(path, UUID[name], *im.size)
    print("wrote", path.name, im.size, flush=True)
    return im


def preview(parts: dict) -> None:
    canvas = Image.new("RGBA", (540, 960), (186, 214, 236, 255))
    panel = parts["panel-win"].copy()
    panel.thumbnail((430, 620), Image.LANCZOS)
    canvas.alpha_composite(panel, dest=(270 - panel.size[0] // 2, 90))
    back = parts["btn-win-back"].copy()
    nxt = parts["btn-win-next"].copy()
    back.thumbnail((168, 70), Image.LANCZOS)
    nxt.thumbnail((168, 70), Image.LANCZOS)
    y = 90 + panel.size[1] - 118
    canvas.alpha_composite(back, dest=(90, y))
    canvas.alpha_composite(nxt, dest=(282, y))
    out = WORK / "win-portal-preview.png"
    canvas.convert("RGB").save(out)
    print("preview", out, flush=True)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dw = load_mod(DEWATER, "dewatermark")
    rb = load_mod(RMBG, "rmbg")

    parts = {}
    for name, src in SRC.items():
        clean = WORK / f"{name}-src.png"
        Image.open(src).convert("RGB").save(clean, "PNG")
        dw_path = WORK / f"{name}.dewatermark.png"
        if dw_path.exists():
            print(f"  reuse {dw_path.name}", flush=True)
            dw_im = Image.open(dw_path).convert("RGBA")
        else:
            print(f"dewatermark {name} <- {src.name}", flush=True)
            dw_im = dw.remove_watermark(
                clean,
                extra_prompt=PROMPT[name],
                timeout_s=480,
            )
            dw_im.convert("RGB").save(dw_path, "PNG")
            print(f"  dewatermarked {dw_im.size}", flush=True)

        cut_path = WORK / f"{name}.rmbg.png"
        if cut_path.exists():
            print(f"  reuse {cut_path.name}", flush=True)
            cut = Image.open(cut_path).convert("RGBA")
        else:
            print(f"rmbg {name}", flush=True)
            cut = rb.remove_background(dw_path)
            cut.save(cut_path, "PNG")
            print(
                f"  rmbg {cut.size} bbox={cut.getbbox()} corner={cut.getpixel((0, 0))[3]}",
                flush=True,
            )

        if name == "panel-win":
            # RMBG eats the white plate. Keep 2048 card, drop 豆包 on outer white.
            src_im = Image.open(src).convert("RGB")
            from PIL import ImageDraw
            sw, sh = src_im.size
            ImageDraw.Draw(src_im).rectangle((sw - 280, sh - 180, sw, sh), fill=(255, 255, 255))
            cut = punch_outer_white(src_im)
        cut = trim_alpha(cut, 10)
        parts[name] = save_asset(cut, name)

    preview(parts)


if __name__ == "__main__":
    main()
