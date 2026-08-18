import struct
import UnityPy

PACK = r"d:\Custom\Suck\tmp-cube-pack\datapack.unity3d"
PID = 221  # Shot


def u32_to_f32(u):
    return struct.unpack("<f", struct.pack("<I", u & 0xFFFFFFFF))[0]


env = UnityPy.load(PACK)
obj = None
for o in env.objects:
    if o.path_id == PID and o.type.name == "AnimationClip":
        obj = o
        break
t = obj.read_typetree()
muscle = t["m_MuscleClip"]
clip = muscle["m_Clip"]["data"]
streamed = clip["m_StreamedClip"]
raw = streamed["data"]
print("curveCount", streamed["curveCount"], "rawN", len(raw))
print("first 40 u32")
for i, u in enumerate(raw[:40]):
    print(f"  [{i:3d}] u={u:10d}  f={u32_to_f32(u)!r}")

print("\n--- frames ---")
i = 0
n = len(raw)
fi = 0
while i + 2 <= n and fi < 15:
    time = u32_to_f32(raw[i])
    num_keys = raw[i + 1]
    print(f"\nframe {fi} time={time!r} numKeys={num_keys} at={i}")
    i += 2
    if num_keys > 80:
        print("  abort, numKeys insane")
        break
    for k in range(num_keys):
        if i + 5 > n:
            print("  truncated")
            break
        index = raw[i]
        if index >= 0x80000000:
            index -= 0x100000000
        coeff = [u32_to_f32(raw[i + 1 + c]) for c in range(4)]
        print(f"  key {k:2d} idx={index:3d} coeff={coeff}")
        i += 5
    fi += 1

print("remaining", n - i, "const", clip["m_ConstantClip"]["data"][:16])
print("indexArray", muscle.get("m_IndexArray"))
print("valueArrayDelta", (muscle.get("m_ValueArrayDelta") or [])[:8])
print("valueArrayRef", (muscle.get("m_ValueArrayReferencePose") or [])[:8])
print("startX", muscle.get("m_StartX"))
print("stopX", muscle.get("m_StopX"))
print("deltaPose root", muscle.get("m_DeltaPose", {}).get("m_RootX"))
