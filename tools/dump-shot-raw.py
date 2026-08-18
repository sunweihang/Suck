import json
import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
env = UnityPy.load(PACK)

# controller clips only
WANT = {211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 230, 235, 177, 179}

def summarize(obj, depth=0, maxd=4):
    if depth > maxd:
        return type(obj).__name__
    if obj is None or isinstance(obj, (int, float, bool, str)):
        return obj
    if isinstance(obj, bytes):
        return f"bytes:{len(obj)}"
    if isinstance(obj, list):
        if not obj:
            return []
        if isinstance(obj[0], (int, float)):
            return {"list": len(obj), "head": obj[:8], "tail": obj[-4:]}
        return [summarize(obj[0], depth + 1, maxd), f"...x{len(obj)}"]
    if isinstance(obj, dict):
        return {k: summarize(v, depth + 1, maxd) for k, v in obj.items()}
    return type(obj).__name__

for obj in env.objects:
    if obj.type.name != "AnimationClip" or obj.path_id not in WANT:
        continue
    t = obj.read_typetree()
    muscle = t.get("m_MuscleClip") or {}
    clip = muscle.get("m_Clip")
    print("=" * 60)
    print(t.get("m_Name"), obj.path_id)
    print("muscle keys", list(muscle.keys()))
    print("clip type", type(clip))
    if isinstance(clip, dict):
        print("clip keys", list(clip.keys()))
        print(json.dumps(summarize(clip, 0, 3), indent=2)[:4000])
    elif isinstance(clip, (bytes, bytearray)):
        print("clip bytes", len(clip), "head", bytes(clip[:32]).hex())
    else:
        print("clip", str(clip)[:300])
    # also look at AnimationClip object attributes
    data = obj.read()
    print("obj attrs", [a for a in dir(data) if not a.startswith("_")][:40])
