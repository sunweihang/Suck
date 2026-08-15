import { instantiate, Node, Prefab, RenderRoot2D, UITransform } from 'cc';

export function applyLockNails(root: Node, prefab: Prefab): void {
  if (root.getChildByName('LockNails')) return;
  const host = root.parent;
  if (host && !host.getComponent(RenderRoot2D)) host.addComponent(RenderRoot2D);
  const n = instantiate(prefab);
  n.name = 'LockNails';
  root.addChild(n);
  n.setPosition(0, 0, 0);
  n.setRotationFromEuler(0, 0, 0);
  n.setScale(1, 1, 1);
  for (const c of n.children) {
    const ut = c.getComponent(UITransform);
    if (ut) ut.hitTest = () => false;
  }
}
