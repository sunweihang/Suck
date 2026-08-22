#!/usr/bin/env python3
"""HUD rank trophy: import AI studio icon."""

import importlib.util
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "tools/import-settings-icons.py"
WORK = ROOT / "tools/ai-item"
OUT = ROOT / "assets/resources/ui"
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets")

RANK_UUID = "7e22bb20-00a5-4b02-8002-0000000000a5"
SIZE = 256


def load_imp():
    spec = importlib.util.spec_from_file_location("imp", SPEC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    imp = load_imp()
    WORK.mkdir(parents=True, exist_ok=True)
    src = SRC / "ic-hud-rank-studio.png"
    if not src.exists():
        raise SystemExit("missing studio: %s" % src)
    studio = WORK / "ic-hud-rank-studio.png"
    shutil.copy2(src, studio)
    cache = WORK / "ic-hud-rank.rmbg.png"
    raw = Image.open(studio).convert("RGBA")
    if cache.exists():
        cut = Image.open(cache).convert("RGBA")
        print("reuse", cache.name)
    else:
        try:
            cut = imp.portal_cut(studio)
            cut.save(cache, "PNG")
            print("rmbg", studio.name, cut.size, "bbox", cut.getbbox())
        except Exception as err:
            print("rmbg fallback", studio.name, err, flush=True)
            cut = raw if raw.getextrema()[3][0] < 255 else imp.flood_alpha(raw)
            cut.save(cache, "PNG")
    dest = OUT / "ic-hud-rank.png"
    out = imp.fit_square(imp.apply_alpha(raw, cut), SIZE)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "PNG")
    imp.write_meta(dest, RANK_UUID, SIZE, SIZE)
    print(dest.name, out.size, "bbox", out.getbbox(), "corner_a", out.getpixel((0, 0))[3])


if __name__ == "__main__":
    main()
