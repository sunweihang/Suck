#!/usr/bin/env python3
"""Copy item-get chrome from Downloads and write Cocos image metas."""

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/resources/ui"
SRC = {
    "panel-item-get.png": Path("/Users/sunix/Downloads/背景框.png"),
    "item-get-box.png": Path("/Users/sunix/Downloads/Box.png"),
    "btn-item-close.png": Path("/Users/sunix/Downloads/close.png"),
}
UUID = {
    "panel-item-get.png": "7e22bb20-0080-4b02-8002-000000000080",
    "item-get-box.png": "7e22bb20-0081-4b02-8002-000000000081",
    "btn-item-close.png": "7e22bb20-0082-4b02-8002-000000000082",
}


def write_meta(path: Path, uuid: str, w: int, h: int) -> None:
    hw, hh = w / 2, h / 2
    stem = path.stem
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": uuid,
        "files": [".json", ".png"],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": f"{uuid}@6c48a",
                "displayName": stem,
                "id": "6c48a",
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "anisotropy": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": uuid,
                    "visible": False,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            "f9941": {
                "importer": "sprite-frame",
                "uuid": f"{uuid}@f9941",
                "displayName": stem,
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": False,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": f"{uuid}@6c48a",
                    "atlasUuid": "",
                    "trimType": "none",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": True,
            "redirect": f"{uuid}@6c48a",
        },
    }
    path.with_suffix(".png.meta").write_text(f"{json.dumps(meta, indent=2)}\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, src in SRC.items():
        if not src.exists():
            raise SystemExit(f"missing {src}")
        dest = OUT / name
        shutil.copy2(src, dest)
        im = Image.open(dest)
        write_meta(dest, UUID[name], im.size[0], im.size[1])
        print(name, im.size, UUID[name])


if __name__ == "__main__":
    main()
