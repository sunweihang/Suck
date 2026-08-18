import zlib
import struct
import UnityPy

TARGETS = [2077149535, 3010364956, 2066238990]
NAMES = [
    "",
    "Shooter_jnt",
    "Gun_jnt",
    "Tail_jnt",
    "Shooter_Pipe_jnt",
    "Shooter_jnt/Gun_jnt",
    "Shooter_jnt/Tail_jnt",
    "Shooter_jnt/Shooter_Pipe_jnt",
    "Root",
    "Bone",
    "body",
    "Body",
    "pipe",
    "Pipe",
    "gun",
    "Gun",
    "tail",
    "Tail",
    "Shooter",
    "Shooter_rig",
    "Armature",
    "Armature/Shooter_jnt",
    "Armature/Shooter_jnt/Gun_jnt",
    "Armature/Shooter_jnt/Tail_jnt",
]


def crc32_unity(s: str) -> int:
    return zlib.crc32(s.encode("utf-8")) & 0xFFFFFFFF


def crc32_lower(s: str) -> int:
    return zlib.crc32(s.lower().encode("utf-8")) & 0xFFFFFFFF


# Unity Animator.StringToHash is actually a custom hash (not zlib crc)
# from UnityCsReference Runtime/Export/Scripting/UnityString.cs / Animator
def unity_string_to_hash(s: str) -> int:
    # Many sources say it's CRC32 of UTF8
    return crc32_unity(s)


print("target", TARGETS)
for n in NAMES:
    h = crc32_unity(n)
    hl = crc32_lower(n)
    mark = ""
    if h in TARGETS or hl in TARGETS:
        mark = " <<<"
    print(f"{h:10d} {hl:10d}  {n}{mark}")

# search all GameObject names containing shooter/gun/tail/jnt
PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
env = UnityPy.load(PACK)
seen = set()
for obj in env.objects:
    if obj.type.name not in ("GameObject", "Transform"):
        continue
    try:
        t = obj.read_typetree()
    except Exception:
        continue
    name = str(t.get("m_Name") or "")
    if not name:
        continue
    low = name.lower()
    if any(k in low for k in ("shoot", "gun_jnt", "tail_jnt", "pipe_jnt", "jnt")):
        if name in seen:
            continue
        seen.add(name)
        print("go", name, "hash", crc32_unity(name))
