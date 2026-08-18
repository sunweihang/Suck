import json
import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
OUT = r"d:\Custom\Suck\tmp-cube-pack\shooter-ctrl.json"

env = UnityPy.load(PACK)

ctrl = None
for obj in env.objects:
    if obj.type.name != "AnimatorController":
        continue
    try:
        data = obj.read()
    except Exception:
        continue
    if str(getattr(data, "m_Name", "") or "") != "Shooter":
        continue
    ctrl = obj
    break

tree = ctrl.read_typetree()
tos = tree.get("m_TOS") or {}
print("TOS type", type(tos))
if isinstance(tos, dict):
    print("TOS keys sample", list(tos.items())[:8])
elif isinstance(tos, list):
    print("TOS len", len(tos), "item0", tos[0] if tos else None)

clips = tree.get("m_AnimationClips") or []
print("clip refs", clips)

want_names = {
    "Bind_Pose", "Die", "Disable", "Disable_to_Active", "Disable_Touch",
    "Disable_Touch_2", "Idle", "Idle_2", "Idle_Shake", "Shot",
    "Active_to_Disable", "Jump_to_Slot", "Look_Up", "Squash_Stretch", "Shoot_2",
}

found = []
for obj in env.objects:
    if obj.type.name != "AnimationClip":
        continue
    try:
        data = obj.read()
        t = obj.read_typetree()
    except Exception:
        continue
    name = str(getattr(data, "m_Name", "") or "")
    if name not in want_names:
        continue
    muscle = t.get("m_MuscleClip") or {}
    clip = muscle.get("m_Clip") or t.get("m_Clip") or {}
    bind = t.get("m_ClipBindingConstant") or {}
    gens = bind.get("genericBindings") or bind.get("m_GenericBindings") or []
    pptr = bind.get("pptrCurveMapping") or bind.get("m_PPtrCurveMapping") or []
    streamed = clip.get("m_StreamedClip") if isinstance(clip, dict) else None
    dense = clip.get("m_DenseClip") if isinstance(clip, dict) else None
    const = clip.get("m_ConstantClip") if isinstance(clip, dict) else None
    rec = {
        "name": name,
        "path_id": obj.path_id,
        "rate": t.get("m_SampleRate"),
        "muscleSize": t.get("m_MuscleClipSize"),
        "bindings": gens,
        "clipKeys": list(clip.keys()) if isinstance(clip, dict) else type(clip).__name__,
        "streamed": {
            "curveCount": (streamed or {}).get("curveCount"),
            "dataLen": len((streamed or {}).get("data") or []),
            "times": (streamed or {}).get("times"),
        } if isinstance(streamed, dict) else streamed,
        "dense": {
            k: (len(v) if isinstance(v, list) else v)
            for k, v in (dense or {}).items()
        } if isinstance(dense, dict) else dense,
        "const": {
            k: (len(v) if isinstance(v, list) else v)
            for k, v in (const or {}).items()
        } if isinstance(const, dict) else const,
        "muscleKeys": list(muscle.keys()) if isinstance(muscle, dict) else None,
        "stopTime": muscle.get("m_StopTime") if isinstance(muscle, dict) else None,
        "startTime": muscle.get("m_StartTime") if isinstance(muscle, dict) else None,
    }
    found.append(rec)
    print(name, obj.path_id, "rate", rec["rate"], "stop", rec["stopTime"],
          "bind", len(gens), "dense", rec["dense"], "streamed", rec["streamed"])

# dump TOS + clip list
payload = {"tos": tos, "clips": found}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)
print("wrote", OUT, "clips", len(found))
