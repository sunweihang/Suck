#!/usr/bin/env python3
"""Portal RMBG-2.0 the four item icons. Keep original RGB, use portal alpha only."""

import importlib.util
import json
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = Path("/Users/sunix/Desktop/ICON1")
OUT = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-item"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")

ITEMS = (
    ("20260816-232351.png", "ic-item-shuffle.png"),
    ("20260816-232347.png", "ic-item-merge.png"),
    ("20260816-232340.png", "ic-item-hook.png"),
    ("20260816-232316.png", "ic-item-shovel.png"),
)


def load_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def portal_cut(src):
    Client = load_client()

    class Sharp(Client):
        @staticmethod
        def _build_prompt(image_name):
            prompt = Client._build_prompt(image_name)
            prompt["13"]["inputs"]["process_res"] = 1024
            prompt["13"]["inputs"]["mask_blur"] = 0
            prompt["13"]["inputs"]["mask_offset"] = 0
            prompt["13"]["inputs"]["refine_foreground"] = True
            return prompt

    last = None
    for base in PORTALS:
        if not base:
            continue
        print("portal rmbg", base, src.name, flush=True)
        try:
            raw = Sharp(base=base).remove_background(src)
            if isinstance(raw, Image.Image):
                return raw.convert("RGBA")
            from io import BytesIO
            return Image.open(BytesIO(raw)).convert("RGBA")
        except Exception as err:
            last = err
            print("  fail", base, err, flush=True)
    raise RuntimeError("portal rmbg failed: %s" % last)


def apply_alpha(src_rgb, cut):
    rgb = src_rgb.convert("RGB")
    alpha = cut.split()[3]
    if alpha.size != rgb.size:
        alpha = alpha.resize(rgb.size, Image.LANCZOS)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def patch_meta(path, w, h):
    meta_path = path.with_suffix(".png.meta")
    meta = json.loads(meta_path.read_text())
    hw, hh = w / 2.0, h / 2.0
    sf = meta["subMetas"]["f9941"]["userData"]
    sf["width"] = w
    sf["height"] = h
    sf["rawWidth"] = w
    sf["rawHeight"] = h
    sf["vertices"] = {
        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, h, w, h, 0, 0, w, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": [-hw, -hh, 0],
        "maxPos": [hw, hh, 0],
    }
    meta["userData"]["hasAlpha"] = True
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    for src_name, dest_name in ITEMS:
        src = SRC_DIR / src_name
        dest = OUT / dest_name
        cache = WORK / (Path(dest_name).stem + ".rmbg.png")
        if cache.exists():
            cut = Image.open(cache).convert("RGBA")
            print("reuse", cache.name, cut.size, flush=True)
        else:
            cut = portal_cut(src)
            cut.save(cache, "PNG")
            print("  rmbg", cut.size, "bbox", cut.getbbox(), "corner", cut.getpixel((0, 0))[3], flush=True)
        out = apply_alpha(Image.open(src), cut)
        out.save(dest, "PNG")
        patch_meta(dest, out.size[0], out.size[1])
        print(dest_name, out.size, "bbox", out.getbbox(), "corner_a", out.getpixel((0, 0))[3])


if __name__ == "__main__":
    main()
