#!/usr/bin/env python3
"""HUD side icons: reuse candy home, import AI game-circle."""

import importlib.util
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "tools/import-settings-icons.py"
WORK = ROOT / "tools/ai-item"
OUT = ROOT / "assets/resources/ui"
SRC = Path("/Users/sunix/.cursor/projects/Users-CreativeCenter-Suck/assets")

HOME_UUID = "7e22bb20-00a2-4b02-8002-0000000000a2"
CLUB_UUID = "7e22bb20-00a3-4b02-8002-0000000000a3"
GEAR_UUID = "7e22bb20-00a4-4b02-8002-0000000000a4"
SIZE = 256

AI_ICONS = [
    ("ic-hud-club-studio.png", "ic-hud-club.png", CLUB_UUID),
    ("ic-hud-gear-studio.png", "ic-hud-gear.png", GEAR_UUID),
]


def load_imp():
    spec = importlib.util.spec_from_file_location("imp", SPEC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    imp = load_imp()
    WORK.mkdir(parents=True, exist_ok=True)

    home_src = OUT / "ic-home-row.png"
    home_out = OUT / "ic-hud-home.png"
    home = Image.open(home_src).convert("RGBA")
    if home.size != (SIZE, SIZE):
        home = imp.fit_square(home, SIZE)
    home.save(home_out, "PNG")
    imp.write_meta(home_out, HOME_UUID, SIZE, SIZE)
    print(home_out.name, home.size, "bbox", home.getbbox(), "corner_a", home.getpixel((0, 0))[3])

    for src_name, out_name, uuid in AI_ICONS:
        src = SRC / src_name
        if not src.exists():
            raise SystemExit("missing studio: %s" % src)
        studio = WORK / src_name
        shutil.copy2(src, studio)
        cache = WORK / src_name.replace("-studio.png", ".rmbg.png")
        raw = Image.open(studio).convert("RGBA")
        if cache.exists():
            cut = Image.open(cache).convert("RGBA")
            print("reuse", cache.name)
        else:
            try:
                cut = imp.portal_cut(studio)
                cut.save(cache, "PNG")
                print("rmbg", src_name, cut.size, "bbox", cut.getbbox())
            except Exception as err:
                print("rmbg fallback", src_name, err, flush=True)
                cut = imp.flood_alpha(raw)
                cut.save(cache, "PNG")
        dest = OUT / out_name
        out = imp.fit_square(imp.apply_alpha(raw, cut), SIZE)
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, "PNG")
        imp.write_meta(dest, uuid, SIZE, SIZE)
        print(dest.name, out.size, "bbox", out.getbbox(), "corner_a", out.getpixel((0, 0))[3])


if __name__ == "__main__":
    main()
