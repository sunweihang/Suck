import json
import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
env = UnityPy.load(PACK)
WANT = {218, 219, 220, 221, 235, 177, 176, 179, 88}

for obj in env.objects:
    if obj.path_id not in WANT:
        continue
    try:
        data = obj.read()
        tree = obj.read_typetree()
    except Exception as e:
        print("fail", obj.path_id, e)
        continue
    name = str(getattr(data, "m_Name", "") or "")
    print("====", name, obj.path_id)
    if isinstance(tree, dict):
        print("keys", list(tree.keys()))
        for k, v in tree.items():
            if k in ("m_Name", "m_SampleRate", "m_MuscleClipSize", "m_UseHighQualityCurve"):
                print(" ", k, v)
            elif k == "m_ClipBindingConstant":
                gens = (v or {}).get("genericBindings") or (v or {}).get("m_GenericBindings") or []
                print("  bindings", len(gens))
                for g in gens[:12]:
                    print("   ", g)
            elif k in ("m_PositionCurves", "m_RotationCurves", "m_ScaleCurves", "m_FloatCurves", "m_EditorCurves"):
                print(" ", k, type(v), len(v) if v else 0)
            elif k == "m_MuscleClip":
                print("  muscle type", type(v), str(v)[:200] if v else None)
            elif k == "m_Clip":
                print("  clip type", type(v), list(v.keys())[:20] if isinstance(v, dict) else str(v)[:200])
