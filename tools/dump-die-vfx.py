import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
env = UnityPy.load(PACK)

for obj in env.objects:
    try:
        t = obj.read_typetree()
    except Exception:
        continue
    name = str(t.get("m_Name") or "")
    if "Disappear" not in name and "disappear" not in name.lower():
        if name not in ("Die", "VFX_Shooter_Disappear", "VFX_Shooter_Disappear 1"):
            continue
    print(obj.type.name, obj.path_id, name, list(t.keys())[:12] if isinstance(t, dict) else "")
