import json
import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
env = UnityPy.load(PACK)

for obj in env.objects:
    if obj.type.name != "AnimatorController":
        continue
    try:
        data = obj.read()
    except Exception:
        continue
    name = str(getattr(data, "m_Name", "") or "")
    if name != "Shooter":
        continue
    print("controller", name, obj.path_id)
    clips = getattr(data, "m_AnimationClips", None) or []
    print("clips field", type(clips), len(clips) if clips else 0)
    for c in clips:
        try:
            clip = c.read() if hasattr(c, "read") else None
            print("  clip", getattr(clip, "m_Name", c))
        except Exception as e:
            print("  clip fail", e, c)
    tree = None
    try:
        tree = obj.read_typetree()
    except Exception as e:
        print("typetree fail", e)
    if isinstance(tree, dict):
        print("keys", list(tree.keys())[:40])
        anims = tree.get("m_AnimationClips") or tree.get("m_Clips")
        print("anims", type(anims), str(anims)[:400] if anims else None)

print("--- clips with Shooter_jnt ---")
hits = []
for obj in env.objects:
    if obj.type.name != "AnimationClip":
        continue
    try:
        data = obj.read()
    except Exception:
        continue
    name = str(getattr(data, "m_Name", "") or "")
    for attr in ("m_PositionCurves", "m_RotationCurves", "m_ScaleCurves"):
        curves = getattr(data, attr, None) or []
        for c in curves:
            path = str(getattr(c, "path", getattr(c, "m_Path", "")) or "")
            if "Shooter" in path or "Gun_jnt" in path or "Pipe" in path:
                hits.append((obj.path_id, name, path, attr, len(getattr(c, "curve", getattr(c, "m_Curve", [])) or [])))
for h in hits:
    print(h)
