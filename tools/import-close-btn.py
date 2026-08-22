#!/usr/bin/env python3
"""User close PNG → btn-close.png. Byte copy only, no resize/crop/rmbg."""

import importlib.util
import os
import shutil
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/Users/sunix/Desktop/剧情/20260822-215659.png")
WORK = ROOT / "tools/ai-item"
OUT = ROOT / "assets/resources/ui" / "btn-close.png"
UUID = "7e22bb20-0065-4b02-8002-000000000065"
CLIENT = Path("/Users/Custom/Cookie/scripts/rmbg-v2-client.py")
PORTALS = (
    os.environ.get("RMBG_PORTAL_URL", ""),
    "http://10.1.4.130:8080",
    "http://182.92.120.159:18080",
)
os.environ.setdefault("RMBG_PORTAL_USER", "admin")
os.environ.setdefault("RMBG_PORTAL_PASS", "admin123")


def write_meta(path, uuid, w, h):
    hw, hh = w / 2.0, h / 2.0
    path.with_suffix(".png.meta").write_text(
        """{
  "ver": "1.0.27",
  "importer": "image",
  "imported": true,
  "uuid": "%s",
  "files": [".json", ".png"],
  "subMetas": {
    "6c48a": {
      "importer": "texture",
      "uuid": "%s@6c48a",
      "displayName": "%s",
      "id": "6c48a",
      "name": "texture",
      "userData": {
        "wrapModeS": "clamp-to-edge",
        "wrapModeT": "clamp-to-edge",
        "minfilter": "linear",
        "magfilter": "linear",
        "mipfilter": "none",
        "anisotropy": 0,
        "isUuid": true,
        "imageUuidOrDatabaseUri": "%s",
        "visible": false
      },
      "ver": "1.0.22",
      "imported": true,
      "files": [".json"],
      "subMetas": {}
    },
    "f9941": {
      "importer": "sprite-frame",
      "uuid": "%s@f9941",
      "displayName": "%s",
      "id": "f9941",
      "name": "spriteFrame",
      "userData": {
        "trimThreshold": 1,
        "rotated": false,
        "offsetX": 0,
        "offsetY": 0,
        "trimX": 0,
        "trimY": 0,
        "width": %d,
        "height": %d,
        "rawWidth": %d,
        "rawHeight": %d,
        "borderTop": 0,
        "borderBottom": 0,
        "borderLeft": 0,
        "borderRight": 0,
        "packable": false,
        "pixelsToUnit": 100,
        "pivotX": 0.5,
        "pivotY": 0.5,
        "meshType": 0,
        "vertices": {
          "rawPosition": [%s, %s, 0, %s, %s, 0, %s, %s, 0, %s, %s, 0],
          "indexes": [0, 1, 2, 2, 1, 3],
          "uv": [0, %d, %d, %d, 0, 0, %d, 0],
          "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
          "minPos": [%s, %s, 0],
          "maxPos": [%s, %s, 0]
        },
        "isUuid": true,
        "imageUuidOrDatabaseUri": "%s@6c48a",
        "atlasUuid": "",
        "trimType": "none"
      },
      "ver": "1.0.12",
      "imported": true,
      "files": [".json"],
      "subMetas": {}
    }
  },
  "userData": {
    "type": "sprite-frame",
    "fixAlphaTransparencyArtifacts": true,
    "hasAlpha": true,
    "redirect": "%s@6c48a",
    "maxWidth": %d,
    "maxHeight": %d,
    "compressSettings": {
      "useCompressTexture": false,
      "presetId": "webUi"
    }
  }
}
"""
        % (
            uuid,
            uuid,
            path.stem,
            uuid,
            uuid,
            path.stem,
            w,
            h,
            w,
            h,
            -hw,
            -hh,
            hw,
            -hh,
            -hw,
            hh,
            hw,
            hh,
            h,
            w,
            h,
            w,
            -hw,
            -hh,
            hw,
            hh,
            uuid,
            uuid,
            w,
            h,
        ),
        encoding="utf-8",
    )


def load_client():
    spec = importlib.util.spec_from_file_location("rmbg", CLIENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.RmbgV2Client


def portal_cut(src):
    if not CLIENT.exists():
        raise RuntimeError("rmbg client missing")
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
            return Image.open(BytesIO(raw)).convert("RGBA")
        except Exception as err:
            last = err
            print("  fail", base, err, flush=True)
    raise RuntimeError("portal rmbg failed: %s" % last)


def main():
    if not SRC.exists():
        raise SystemExit("missing close source: %s" % SRC)
    WORK.mkdir(parents=True, exist_ok=True)
    studio = WORK / "btn-close-studio.png"
    shutil.copy2(SRC, studio)
    im = Image.open(SRC)
    w, h = im.size
    OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC, OUT)
    write_meta(OUT, UUID, w, h)
    print(OUT.name, (w, h), "bytes", OUT.stat().st_size, "bbox", im.convert("RGBA").getbbox())


if __name__ == "__main__":
    main()
