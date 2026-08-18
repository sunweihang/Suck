import json
import struct
import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
OUT = r"d:\Custom\Suck\assets\resources\anims\turret-clips.json"
CTRL = 256
CLIPS = {
    "Bind_Pose": 212,
    "Idle": 218,
    "Idle_2": 219,
    "Idle_Shake": 220,
    "Shot": 221,
    "Look_Up": 235,
    "Jump_to_Slot": 230,
    "Shoot_2": 179,
    "Squash_Stretch": 177,
    "Die": 213,
    "Active_to_Disable": 211,
    "Disable": 214,
}

ATTR = {1: "pos", 2: "rot", 3: "scale", 4: "euler"}
DIM = {"pos": 3, "rot": 4, "scale": 3, "euler": 3}


def u32_to_f32(u):
    return struct.unpack("<f", struct.pack("<I", u & 0xFFFFFFFF))[0]


def read_streamed(data_u32, curve_count):
    """Decode Unity StreamedClip uint32 buffer into frames."""
    frames = []
    i = 0
    n = len(data_u32)
    while i + 2 <= n:
        time = u32_to_f32(data_u32[i])
        num_keys = data_u32[i + 1]
        i += 2
        keys = []
        for _ in range(num_keys):
            if i + 5 > n:
                break
            index = data_u32[i]
            if index >= 0x80000000:
                index -= 0x100000000
            coeff = [u32_to_f32(data_u32[i + 1 + k]) for k in range(4)]
            keys.append({"index": index, "coeff": coeff, "value": coeff[3]})
            i += 5
        frames.append({"t": time, "keys": keys})
        if num_keys == 0 and i >= n:
            break
        # safety
        if len(frames) > 4000:
            break
    return frames


def eval_streamed(frames, curve_count, t):
    """Evaluate streamed curves at time t using piecewise cubic.

    Unity packs StreamedCurveKey as [c3,c2,c1,value] high-order-first:
    v(dt) = ((c0*dt + c1)*dt + c2)*dt + c3
    """
    values = [0.0] * curve_count
    if not frames:
        return values
    usable = []
    for f in frames:
        if f["t"] > -1e20 and f["t"] < 1e20:
            usable.append(f)
    if not usable:
        return values
    prev = {}
    nxt = {}
    first = {}
    for f in usable:
        for k in f["keys"]:
            if k["index"] not in first:
                first[k["index"]] = k["value"]
            if f["t"] <= t + 1e-7:
                prev[k["index"]] = (f["t"], k)
            elif k["index"] not in nxt:
                nxt[k["index"]] = (f["t"], k)
    for idx in range(curve_count):
        if idx in prev:
            t0, k0 = prev[idx]
            dt = max(0.0, t - t0)
            c = k0["coeff"]
            values[idx] = ((c[0] * dt + c[1]) * dt + c[2]) * dt + c[3]
        elif idx in first:
            values[idx] = first[idx]
    return values


def sample_clip(streamed_frames, streamed_count, constant, stop, rate, steps=None):
    if steps is None:
        steps = max(2, int(round(stop * rate)) + 1)
    out = []
    for i in range(steps):
        t = 0.0 if steps <= 1 else stop * (i / (steps - 1))
        svals = eval_streamed(streamed_frames, streamed_count, t)
        out.append({"t": t, "v": svals + constant})
    return out


env = UnityPy.load(PACK)

# TOS from shooter controller
tos = {}
for obj in env.objects:
    if obj.path_id == CTRL and obj.type.name == "AnimatorController":
        tree = obj.read_typetree()
        for pair in tree.get("m_TOS") or []:
            if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                tos[int(pair[0])] = str(pair[1])
            elif isinstance(pair, dict):
                tos[int(pair.get("first", pair.get("key", 0)))] = str(pair.get("second", pair.get("value", "")))
        break

print("TOS")
for h, s in sorted(tos.items(), key=lambda x: x[1]):
    print(f"  {h:10d}  {s}")


BONES = {
    2077149535: "root",
    3010364956: "gun",
    2066238990: "tail",
}


def resolve_path(h):
    if h in BONES:
        return BONES[h]
    if h == 0:
        return "root"
    if h in tos:
        return tos[h]
    return f"hash_{h}"


clips_out = {}
for name, pid in CLIPS.items():
    obj = None
    for o in env.objects:
        if o.path_id == pid and o.type.name == "AnimationClip":
            obj = o
            break
    if not obj:
        print("missing", name, pid)
        continue
    t = obj.read_typetree()
    muscle = t.get("m_MuscleClip") or {}
    clip = ((muscle.get("m_Clip") or {}).get("data")) or {}
    streamed = clip.get("m_StreamedClip") or {}
    dense = clip.get("m_DenseClip") or {}
    const = clip.get("m_ConstantClip") or {}
    bind = t.get("m_ClipBindingConstant") or {}
    gens = bind.get("genericBindings") or bind.get("m_GenericBindings") or []

    raw = streamed.get("data") or []
    if isinstance(raw, dict):
        raw = raw.get("data") or []
    curve_count = int(streamed.get("curveCount") or 0)
    frames = read_streamed(raw, curve_count) if raw and curve_count else []

    cdata = const.get("data") or []
    if isinstance(cdata, dict):
        cdata = cdata.get("data") or []
    constant = [float(x) for x in cdata]

    stop = float(muscle.get("m_StopTime") or 0)
    rate = float(t.get("m_SampleRate") or 30)

    bindings = []
    cursor = 0
    for g in gens:
        attr = int(g.get("attribute") or 0)
        kind = ATTR.get(attr, f"attr_{attr}")
        dim = DIM.get(kind, 1)
        path = resolve_path(int(g.get("path") or 0))
        bindings.append({
            "path": path,
            "hash": int(g.get("path") or 0),
            "attr": kind,
            "dim": dim,
            "curve0": cursor,
        })
        cursor += dim

    # sample
    samples = sample_clip(frames, curve_count, constant, stop, rate)
    # pack as bone tracks
    tracks = {}
    for b in bindings:
        keys = []
        for s in samples:
            sl = s["v"][b["curve0"]: b["curve0"] + b["dim"]]
            keys.append({"t": round(s["t"], 5), "v": [round(x, 6) for x in sl]})
        tracks.setdefault(b["path"] or "root", {})[b["attr"]] = keys

    clips_out[name] = {
        "rate": rate,
        "stop": stop,
        "bindings": bindings,
        "streamedCount": curve_count,
        "constCount": len(constant),
        "frameN": len(frames),
        "tracks": tracks,
        "preview": {
            "t0": samples[0]["v"] if samples else None,
            "t1": samples[len(samples)//2]["v"] if samples else None,
            "tEnd": samples[-1]["v"] if samples else None,
        },
    }
    print(name, "stop", round(stop, 4), "samples", len(samples))
    for bone, attrs in tracks.items():
        for attr, keys in attrs.items():
            vs = [k["v"] for k in keys]
            mins = [min(v[i] for v in vs) for i in range(len(vs[0]))]
            maxs = [max(v[i] for v in vs) for i in range(len(vs[0]))]
            print(f"  {bone:5s} {attr:5s} min {['%.4f'%x for x in mins]} max {['%.4f'%x for x in maxs]}")
            print(f"         t0 {['%.4f'%x for x in vs[0]]} mid {['%.4f'%x for x in vs[len(vs)//2]]} end {['%.4f'%x for x in vs[-1]]}")

# compact TS for runtime — sitting idle is Idle_2 (Z-roll), not Idle (uniform breathe).
TS_OUT = r"d:\Custom\Suck\assets\scripts\battle\TurretClips.ts"
KEEP = ("Idle_2", "Shot", "Jump_to_Slot", "Die")
CLIP_KEY = {"Idle_2": "IDLE", "Jump_to_Slot": "JUMP"}


def fmt_arr(rows):
    parts = []
    for row in rows:
        inner = ",".join(f"{x:.6g}" for x in row)
        parts.append(f"[{inner}]")
    return "[" + ",".join(parts) + "]"


def clip_to_ts(name, rec):
    tracks = rec["tracks"]
    times = [k["t"] for k in next(iter(tracks.values()))[next(iter(next(iter(tracks.values())).keys()))]]
    # times from root pos or any track
    any_attr = None
    for bone in tracks.values():
        any_attr = next(iter(bone.values()))
        break
    times = [k["t"] for k in any_attr]
    def grab(bone, attr, fallback):
        keys = (tracks.get(bone) or {}).get(attr)
        if not keys:
            return [fallback[:] for _ in times]
        return [k["v"] for k in keys]
    ident_r = [0, 0, 0, 1]
    ident_s = [1, 1, 1]
    return (
        f"export const CLIP_{name.upper().replace('_TO_', '_')} = {{\n"
        f"  stop: {rec['stop']:.6g},\n"
        f"  times: [{','.join(f'{t:.5g}' for t in times)}],\n"
        f"  rootR: {fmt_arr(grab('root', 'rot', ident_r))},\n"
        f"  rootS: {fmt_arr(grab('root', 'scale', ident_s))},\n"
        f"  gunR: {fmt_arr(grab('gun', 'rot', ident_r))},\n"
        f"  gunS: {fmt_arr(grab('gun', 'scale', ident_s))},\n"
        f"}} as const;\n"
    )


ts = [
    "/** Original Shoot-a-Cube Puzzle Shooter clips, sampled from the Unity datapack. */",
    "",
]
for name in KEEP:
    if name in clips_out:
        key = CLIP_KEY.get(name, name.upper())
        rec = clips_out[name]
        tracks = rec["tracks"]
        any_attr = next(iter(next(iter(tracks.values())).values()))
        times = [k["t"] for k in any_attr]

        def grab(bone, attr, fallback):
            keys = (tracks.get(bone) or {}).get(attr)
            if not keys:
                return [list(fallback) for _ in times]
            return [k["v"] for k in keys]

        ident_r = [0.0, 0.0, 0.0, 1.0]
        ident_s = [1.0, 1.0, 1.0]
        ident_p = [0.0, 0.0, 0.0]
        ts.append(f"export const CLIP_{key} = {{")
        ts.append(f"  stop: {rec['stop']:.6g},")
        ts.append(f"  times: [{','.join(f'{t:.5g}' for t in times)}],")
        ts.append(f"  rootP: {fmt_arr(grab('root', 'pos', ident_p))},")
        ts.append(f"  rootR: {fmt_arr(grab('root', 'rot', ident_r))},")
        ts.append(f"  rootS: {fmt_arr(grab('root', 'scale', ident_s))},")
        ts.append(f"  gunR: {fmt_arr(grab('gun', 'rot', ident_r))},")
        ts.append(f"  gunS: {fmt_arr(grab('gun', 'scale', ident_s))},")
        ts.append("} as const;")
        ts.append("")

with open(TS_OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(ts))

with open(r"d:\Custom\Suck\tmp-cube-pack\shooter-decoded.json", "w", encoding="utf-8") as f:
    json.dump({k: {"stop": v["stop"], "tracks": v["tracks"]} for k, v in clips_out.items()}, f)
print("wrote", TS_OUT)

