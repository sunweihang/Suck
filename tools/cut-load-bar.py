#!/usr/bin/env python3
"""Portal RMBG-2.0 cut for the boot progress-bar sprites."""

import json
import os
import time
import uuid
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

BASE = os.environ.get("RMBG_PORTAL_URL", "http://10.1.4.130:8080")
USER = os.environ.get("RMBG_PORTAL_USER", "admin")
PASS = os.environ.get("RMBG_PORTAL_PASS", "admin123")

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = Path(r"C:\Users\elex\.cursor\projects\d-Custom-Suck\assets")
OUT_DIR = ROOT / "assets/resources/ui"
WORK = ROOT / "tools/ai-load"
BLUE = (12, 70, 136)

JOBS = (
    ("load-track", True),
    ("load-fill", True),
    ("load-knob", False),
)


def login() -> str:
    req = urllib.request.Request(
        BASE + "/api/auth/login",
        data=json.dumps({"username": USER, "password": PASS}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["sessionToken"]


def api(token: str, path: str, data=None):
    headers = {"Cookie": "portal_session=" + token}
    body = None
    method = "GET"
    if data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def upload(token: str, path: Path) -> str:
    boundary = "----PortalForm" + uuid.uuid4().hex
    raw = path.read_bytes()
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{path.name}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode()
    mid = (
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="overwrite"\r\n\r\n'
        f"true\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        BASE + "/api/comfyui/upload/image",
        data=head + raw + mid,
        headers={
            "Cookie": "portal_session=" + token,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)["name"]


def download_output(token: str, filename: str, dest: Path) -> None:
    url = (
        BASE
        + "/api/comfyui/view?filename="
        + urllib.request.quote(filename)
        + "&type=output&subfolder="
    )
    req = urllib.request.Request(url, headers={"Cookie": "portal_session=" + token})
    with urllib.request.urlopen(req, timeout=120) as r:
        dest.write_bytes(r.read())


def portal_cut(token: str, src: Path, dest: Path) -> Image.Image:
    name = upload(token, src)
    prefix = "suck_load_" + src.stem + "_" + uuid.uuid4().hex[:8]
    prompt = {
        "2": {"class_type": "LoadImage", "inputs": {"image": name}},
        "13": {
            "class_type": "RMBG",
            "inputs": {
                "image": ["2", 0],
                "model": "RMBG-2.0",
                "sensitivity": 1.0,
                "process_res": 2048,
                "mask_blur": 0,
                "mask_offset": 0,
                "invert_output": False,
                "refine_foreground": True,
                "background": "Alpha",
                "background_color": "#222222",
            },
        },
        "16": {
            "class_type": "SaveImage",
            "inputs": {"images": ["13", 0], "filename_prefix": prefix},
        },
    }
    client_id = str(uuid.uuid4())
    queued = api(token, "/api/comfyui/prompt", {"prompt": prompt, "client_id": client_id})
    prompt_id = queued["prompt_id"]
    out_name = None
    for _ in range(180):
        time.sleep(1.5)
        hist = api(token, "/api/comfyui/history/" + prompt_id)
        if prompt_id not in hist:
            continue
        outputs = hist[prompt_id].get("outputs") or {}
        for node in outputs.values():
            imgs = node.get("images") or []
            if imgs:
                out_name = imgs[0]["filename"]
                break
        if out_name:
            break
    if not out_name:
        raise RuntimeError(f"timeout waiting for {src.name}")
    download_output(token, out_name, dest)
    print("  rmbg", dest.name, "<-", out_name, flush=True)
    return Image.open(dest).convert("RGBA")


def paint_outer_white(im: Image.Image, fill=BLUE, min_luma=236, max_chroma=8) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    walk = Image.new("1", (w, h), 0)
    wp = walk.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            luma = 0.3 * r + 0.59 * g + 0.11 * b
            chroma = max(r, g, b) - min(r, g, b)
            if luma >= min_luma and chroma <= max_chroma:
                wp[x, y] = 1
    seen = Image.new("1", (w, h), 0)
    sp = seen.load()
    q = deque()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for x in range(0, w, 32):
        seeds += [(x, 0), (x, h - 1)]
    for y in range(0, h, 32):
        seeds += [(0, y), (w - 1, y)]
    for x, y in seeds:
        if wp[x, y] and not sp[x, y]:
            sp[x, y] = 1
            q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and wp[nx, ny] and not sp[nx, ny]:
                sp[nx, ny] = 1
                q.append((nx, ny))
    out = rgb.copy()
    op = out.load()
    n = 0
    for y in range(h):
        for x in range(w):
            if sp[x, y]:
                op[x, y] = fill
                n += 1
    print(f"  staged blue bg={n}", flush=True)
    return out


def hole_mask(body: Image.Image) -> Image.Image:
    empty = body.point(lambda p: 0 if p else 255)
    rgb = Image.merge("RGB", (empty, empty, empty))
    for pt in ((0, 0), (body.size[0] - 1, 0), (0, body.size[1] - 1), (body.size[1] - 1, body.size[1] - 1)):
        ImageDraw = __import__("PIL.ImageDraw", fromlist=["ImageDraw"]).ImageDraw
        ImageDraw.floodfill(rgb, pt, (0, 0, 0))
    return rgb.split()[0]


def fill_alpha_holes(alpha: Image.Image) -> Image.Image:
    from PIL import ImageDraw

    a = np.array(alpha)
    body = Image.fromarray(np.where(a > 80, 255, 0).astype(np.uint8), "L")
    empty = body.point(lambda p: 0 if p else 255)
    rgb = Image.merge("RGB", (empty, empty, empty))
    for pt in ((0, 0), (body.size[0] - 1, 0), (0, body.size[1] - 1), (body.size[0] - 1, body.size[1] - 1)):
        ImageDraw.floodfill(rgb, pt, (0, 0, 0))
    holes = rgb.split()[0]
    if holes.getbbox():
        ha = np.array(holes)
        a = np.where(ha > 0, np.maximum(a, 255), a)
        print("  filled interior holes", int((ha > 0).sum()), flush=True)
    return Image.fromarray(a.astype(np.uint8), "L")


def decontaminate(im: Image.Image, bg) -> Image.Image:
    arr = np.array(im).astype(np.float32)
    a = arr[:, :, 3:4] / 255.0
    rgb = arr[:, :, :3]
    back = np.array(bg, dtype=np.float32)
    mask = (a[:, :, 0] > 0.02) & (a[:, :, 0] < 0.97)
    fg = (rgb - (1.0 - a) * back) / np.clip(a, 1e-4, 1.0)
    rgb[mask] = np.clip(fg[mask], 0, 255)
    arr[:, :, :3] = rgb
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


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


def patch_meta(path: Path, w: int, h: int, inset: int) -> None:
    meta_path = path.with_suffix(".png.meta")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    hw, hh = w / 2.0, h / 2.0
    sf = meta["subMetas"]["f9941"]["userData"]
    sf["width"] = w
    sf["height"] = h
    sf["rawWidth"] = w
    sf["rawHeight"] = h
    sf["borderLeft"] = inset
    sf["borderRight"] = inset
    sf["borderTop"] = 0
    sf["borderBottom"] = 0
    sf["vertices"] = {
        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, h, w, h, 0, 0, w, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": [-hw, -hh, 0],
        "maxPos": [hw, hh, 0],
    }
    meta["userData"]["hasAlpha"] = True
    meta["userData"]["fixAlphaTransparencyArtifacts"] = True
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def bleed_rgb(im: Image.Image, steps: int = 8) -> Image.Image:
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    known = arr[:, :, 3] > 16
    for _ in range(steps):
        nxt = rgb.copy()
        nxt_k = known.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            src_k = np.roll(np.roll(known, dy, 0), dx, 1)
            src_c = np.roll(np.roll(rgb, dy, 0), dx, 1)
            if dy < 0:
                src_k[dy:, :] = False
            elif dy > 0:
                src_k[:dy, :] = False
            if dx < 0:
                src_k[:, dx:] = False
            elif dx > 0:
                src_k[:, :dx] = False
            take = (~nxt_k) & src_k
            nxt[take] = src_c[take]
            nxt_k |= take
        rgb, known = nxt, nxt_k
    arr[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def fit_h(im: Image.Image, height: int) -> Image.Image:
    if im.size[1] <= height:
        return im
    w = max(1, round(im.size[0] * height / im.size[1]))
    return im.resize((w, height), Image.LANCZOS)


def finish(im: Image.Image, height: int | None) -> Image.Image:
    im = bleed_rgb(im)
    if height:
        im = fit_h(im, height)
        im = bleed_rgb(im, 4)
    return im


def preview(track: Image.Image, fill: Image.Image, knob: Image.Image) -> None:
    canvas = Image.new("RGBA", (720, 180), (72, 148, 58, 255))
    t = track.copy()
    t.thumbnail((560, 80), Image.LANCZOS)
    f = fill.copy()
    f.thumbnail((280, 56), Image.LANCZOS)
    k = knob.copy()
    k.thumbnail((72, 72), Image.LANCZOS)
    cx, cy = 360, 90
    canvas.alpha_composite(t, dest=(cx - t.size[0] // 2, cy - t.size[1] // 2))
    canvas.alpha_composite(f, dest=(cx - t.size[0] // 2 + 10, cy - f.size[1] // 2))
    canvas.alpha_composite(k, dest=(cx - t.size[0] // 2 + 10 + f.size[0] - k.size[0] // 2, cy - k.size[1] // 2))
    out = WORK / "load-bar-preview.png"
    canvas.convert("RGB").save(out)
    print("preview", out, flush=True)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    print("portal", BASE, flush=True)
    token = login()
    cuts = {}
    for name, fill_holes in JOBS:
        src = SRC_DIR / f"{name}.png"
        print("cut", name, src.size if False else Image.open(src).size, flush=True)
        staged = paint_outer_white(Image.open(src))
        staged_path = WORK / f"{name}.blue.png"
        staged.save(staged_path, "PNG")
        cache = WORK / f"{name}.rmbg.png"
        cut = portal_cut(token, staged_path, cache)
        alpha = cut.split()[3]
        if alpha.size != staged.size:
            alpha = alpha.resize(staged.size, Image.LANCZOS)
        if fill_holes:
            alpha = fill_alpha_holes(alpha)
        rgb = Image.open(src).convert("RGB")
        if rgb.size != alpha.size:
            alpha = alpha.resize(rgb.size, Image.LANCZOS)
        out = rgb.convert("RGBA")
        out.putalpha(alpha)
        out = decontaminate(out, (253, 253, 253))
        out = trim_alpha(out, 8)
        target_h = {"load-track": 64, "load-fill": 40, "load-knob": 80}[name]
        out = finish(out, target_h)
        dest = OUT_DIR / f"{name}.png"
        out.save(dest, "PNG")
        inset = 0 if name == "load-knob" else max(12, out.size[1] // 2)
        patch_meta(dest, out.size[0], out.size[1], inset)
        cuts[name] = out
        print(name, out.size, "bbox", out.getbbox(), "corner_a", out.getpixel((0, 0))[3], flush=True)
    preview(cuts["load-track"], cuts["load-fill"], cuts["load-knob"])


if __name__ == "__main__":
    main()
