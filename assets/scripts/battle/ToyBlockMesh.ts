import { Mesh, MeshRenderer, Material, Node } from 'cc';

export function applyMesh(
  mr: MeshRenderer | null,
  mesh: Mesh | null,
  mat: Material | null,
): boolean {
  if (!mr) return false;
  if (!mesh || !mat?.passes?.length) {
    mr.enabled = false;
    return false;
  }
  mr.enabled = false;
  mr.setSharedMaterial(mat, 0);
  mr.mesh = mesh;
  mr.enabled = true;
  return true;
}

export function applyShadowReceiver(node: { getComponent: (t: typeof MeshRenderer) => MeshRenderer | null }): void {
  const mr = node.getComponent(MeshRenderer);
  if (!mr) return;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
}

export function applyToyCaster(node: Node, receive = false): void {
  for (const mr of node.getComponentsInChildren(MeshRenderer)) {
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
    mr.shadowReceivingMode = receive
      ? MeshRenderer.ShadowReceivingMode.ON
      : MeshRenderer.ShadowReceivingMode.OFF;
  }
}
