import json
import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
OUT = r"d:\Custom\Suck\tmp-cube-pack\shooter-anims.json"
env = UnityPy.load(PACK)

WANT = {
    88: "Idle",
    90: "Pipe_anim",
    91: "Bind_Pose",
    165: "Shoot",
    243: "Anim_Shooter_TransferShooter",
    244: "Anim_Shooter_Shoot",
}


def sample(curve):
    times = getattr(curve, "times", None) or getattr(curve, "m_Curve", None)
    if times is None and hasattr(curve, "curve"):
        times = curve.curve
    out = []
    keys = getattr(curve, "m_Curve", None)
    if keys:
        for k in keys:
            t = getattr(k, "time", getattr(k, "t", None))
            v = getattr(k, "value", getattr(k, "value", None))
            if hasattr(v, "x"):
                v = [v.x, v.y, v.z, getattr(v, "w", None)]
            out.append({"t": t, "v": v})
        return out
    return str(type(curve))


def dump_clip(data):
    pack = {
        "name": getattr(data, "m_Name", ""),
        "rate": getattr(data, "m_SampleRate", None),
        "pos": [],
        "rot": [],
        "scale": [],
        "muscle": bool(getattr(data, "m_MuscleClipSize", 0) or getattr(data, "m_ClipBindingConstant", None)),
    }
    for kind, attr in (("pos", "m_PositionCurves"), ("rot", "m_RotationCurves"), ("scale", "m_ScaleCurves")):
        curves = getattr(data, attr, None) or []
        for c in curves:
            path = getattr(c, "path", getattr(c, "m_Path", ""))
            pack[kind].append({"path": path, "keys": sample(c.curve if hasattr(c, "curve") else c)})
    bind = getattr(data, "m_ClipBindingConstant", None)
    if bind:
        generic = getattr(bind, "genericBindings", None) or getattr(bind, "m_GenericBindings", None)
        if generic:
            pack["bindings"] = []
            for g in generic[:20]:
                pack["bindings"].append({
                    "path": getattr(g, "path", getattr(g, "m_Path", None)),
                    "attribute": getattr(g, "attribute", None),
                    "type": str(getattr(g, "typeID", None)),
                })
    return pack


found = {}
for obj in env.objects:
    if obj.path_id not in WANT and obj.type.name != "AnimationClip":
        continue
    if obj.type.name != "AnimationClip":
        continue
    try:
        data = obj.read()
    except Exception:
        continue
    name = str(getattr(data, "m_Name", "") or "")
    if obj.path_id in WANT or name in ("Shoot", "Idle", "Pipe_anim", "Bind_Pose", "Anim_Shooter_Shoot"):
        key = f"{name}_{obj.path_id}"
        found[key] = dump_clip(data)
        print("dumped", key, "pos", len(found[key]["pos"]), "rot", len(found[key]["rot"]))

# shooter hierarchy
print("--- shooter gos ---")
for obj in env.objects:
    if obj.type.name != "GameObject":
        continue
    try:
        data = obj.read()
    except Exception:
        continue
    name = str(getattr(data, "m_Name", "") or "")
    if name in ("Shooter", "Shooter_rig", "Shooter_jnt", "Shooter_Pipe", "Shooter_Pipe_jnt"):
        print("GO", name, "path", obj.path_id)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(found, f, indent=2, default=str)
print("wrote", OUT, "clips", len(found))
