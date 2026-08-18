import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
env = UnityPy.load(PACK)

for obj in env.objects:
    typ = obj.type.name
    if typ not in ("AnimationClip", "AnimatorController", "Avatar", "Mesh"):
        continue
    try:
        data = obj.read()
    except Exception:
        continue
    name = str(getattr(data, "m_Name", "") or "")
    low = name.lower()
    keep = typ in ("AnimationClip", "AnimatorController") or any(
        k in low for k in ("shoot", "pipe", "rig", "idle", "turn", "aim", "transfer")
    )
    if not keep:
        continue
    extra = ""
    if typ == "AnimationClip":
        extra = f" rate={getattr(data, 'm_SampleRate', None)}"
        bindings = getattr(data, "m_ClipBindingConstant", None) or getattr(data, "m_EditorCurves", None)
        extra += f" bindings={type(bindings).__name__ if bindings is not None else None}"
        float_curves = getattr(data, "m_FloatCurves", None)
        pos_curves = getattr(data, "m_PositionCurves", None)
        rot_curves = getattr(data, "m_RotationCurves", None)
        scale_curves = getattr(data, "m_ScaleCurves", None)
        extra += (
            f" float={len(float_curves) if float_curves else 0}"
            f" pos={len(pos_curves) if pos_curves else 0}"
            f" rot={len(rot_curves) if rot_curves else 0}"
            f" scale={len(scale_curves) if scale_curves else 0}"
        )
    print(f"{typ:22} {name[:70]} path={obj.path_id}{extra}")
