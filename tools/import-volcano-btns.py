#!/usr/bin/env python3
"""Cut Button_Green / Button_Yellow chrome from 火山素材 (2).psd. No baked text."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PSD = Path(
    "/Users/CreativeCenter/美术资源/K 卡通Q版休闲游戏UI界面手游弹窗按钮元素图标PSD分层设计素材模板"
    "/230717 游戏UI界面元素/界面/火山素材 (2).psd"
)
OUT = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-result"
TARGET_W = 800

JOBS = (
    {
        "group": "Button_Yellow",
        "out": "btn-win-double.png",
        "uuid": "a43b8381-cf88-4be8-9cf6-81e475e50c06",
    },
    {
        "group": "Button_Green",
        "out": "btn-win-action.png",
        "uuid": "c60db3f9-8067-4a17-87f5-dad8b07c60a9",
    },
)


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


def find_named(layer, name):
    hits = []
    if layer.name == name:
        hits.append(layer)
    if hasattr(layer, "__iter__"):
        try:
            for child in layer:
                hits.extend(find_named(child, name))
        except TypeError:
            pass
    return hits


def child_named(layer, name):
    for child in layer:
        if child.name == name:
            return child
    return None


def disable_stroke(layer) -> None:
    effects = getattr(layer, "effects", None)
    if not effects:
        return
    for e in effects:
        if type(e).__name__ == "Stroke" and e.enabled:
            try:
                e.enabled = False
            except Exception:
                pass


def strip_black_stroke(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA"))
    lum = arr[:, :, :3].astype(np.int16).mean(axis=2)
    dark = (arr[:, :, 3] > 0) & (lum < 48)
    arr[:, :, 3][dark] = 0
    return Image.fromarray(arr, "RGBA")


def defringe(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGBA"))
    color = arr[:, :, :3].copy()
    alpha = arr[:, :, 3]
    solid = alpha >= 248
    filled = solid.copy()
    for _ in range(8):
        src = color.copy()
        mask = filled.copy()
        grew = False
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            rolled = np.roll(np.roll(src, dy, 0), dx, 1)
            near = np.roll(np.roll(mask, dy, 0), dx, 1)
            take = (~filled) & near
            if not take.any():
                continue
            color[take] = rolled[take]
            filled[take] = True
            grew = True
        if not grew:
            break
    fringe = (alpha > 8) & (alpha < 248)
    arr[:, :, :3][fringe] = color[fringe]
    arr[:, :, 3] = np.where(alpha < 8, 0, alpha)
    return Image.fromarray(arr, "RGBA")


def layer_rgba(layer) -> Image.Image:
    disable_stroke(layer)
    im = layer.composite()
    if im is None:
        raise SystemExit("composite failed for %s" % layer.name)
    return strip_black_stroke(im.convert("RGBA"))


def export_btn(group) -> Image.Image:
    chrome = child_named(group, "btn")
    if chrome is None:
        raise SystemExit("missing btn child in %s" % group.name)
    back = child_named(chrome, "btn_back")
    face = child_named(chrome, "btn")
    if back is None or face is None:
        raise SystemExit("missing btn/btn_back in %s" % group.name)
    back_im = layer_rgba(back)
    face_im = layer_rgba(face)
    bx0, by0, bx1, by1 = back.bbox
    fx0, fy0, fx1, fy1 = face.bbox
    canvas = Image.new("RGBA", (bx1 - bx0, by1 - by0), (0, 0, 0, 0))
    lip = Image.new("RGBA", back_im.size, (0, 0, 0, 0))
    lip_y = max(0, (fy1 - by0) - 2)
    lip.paste(back_im.crop((0, lip_y, back_im.width, back_im.height)), (0, lip_y))
    canvas.paste(lip, (0, 0), lip)
    canvas.alpha_composite(face_im, (fx0 - bx0, fy0 - by0))
    bbox = canvas.getbbox()
    if not bbox:
        raise SystemExit("empty bbox for %s" % group.name)
    im = defringe(canvas.crop(bbox))
    h = max(1, round(im.height * TARGET_W / im.width))
    return defringe(im.resize((TARGET_W, h), Image.LANCZOS))


DOWNLOADS = (
    {
        "src": Path("/Users/sunix/Downloads/橙色.png"),
        "out": "btn-win-double.png",
        "uuid": "a43b8381-cf88-4be8-9cf6-81e475e50c06",
    },
    {
        "src": Path("/Users/sunix/Downloads/火山素材 (2).png"),
        "out": "btn-win-action.png",
        "uuid": "c60db3f9-8067-4a17-87f5-dad8b07c60a9",
    },
    {
        "src": Path("/Users/sunix/Downloads/蓝色按钮.png"),
        "out": "btn-win-next.png",
        "uuid": "e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e25",
    },
)


def main() -> None:
    import shutil

    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    if all(job["src"].exists() for job in DOWNLOADS):
        for job in DOWNLOADS:
            dest = OUT / job["out"]
            shutil.copy2(job["src"], dest)
            im = Image.open(dest)
            write_meta(dest, job["uuid"], *im.size)
            print("copied", dest.name, im.size, "from", job["src"].name)
        return
    raise SystemExit("original PNGs missing; will not process PSD")


if __name__ == "__main__":
    main()
