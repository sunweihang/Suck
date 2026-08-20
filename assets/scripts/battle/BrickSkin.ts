import { MeshRenderer, Node } from 'cc';
import type { BlockCell } from './BlockCell';
import { wakeBrickMesh } from './ToyBlockMesh';

const SKIN_ROOT = 'BrickSkins';
const SKIP_BODY = /^(HoldRim|Outline|Crease|BlobShadow|Pad|Power|Bank|Text|Lock|Chip_|Trail_|Hit_|Muzzle_|Paint|Magnet)/;

let _host: Node | null = null;

function skipBody(name: string): boolean {
  return SKIP_BODY.test(name) || /^[DN]\d$/.test(name);
}

function setBodyEnabled(node: Node, on: boolean): void {
  const mrs = node.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (skipBody(mr.node.name)) continue;
    mr.enabled = on;
  }
}

function clearChildren(root: Node): void {
  const kids = root.children.slice();
  for (let i = 0; i < kids.length; i++) kids[i].destroy();
}

export function bindBrickSkin(_field: Node | null, actors: Node | null): void {
  if (_host?.isValid && _host.parent !== actors) {
    clearChildren(_host);
    _host.destroy();
    _host = null;
  }
  if (actors?.isValid) {
    const leftover = actors.getChildByName(SKIN_ROOT);
    if (leftover) {
      clearChildren(leftover);
      leftover.destroy();
    }
  }
  _host = null;
}

export function clearBrickSkin(): void {
  if (_host?.isValid) {
    clearChildren(_host);
    _host.destroy();
  }
  _host = null;
}

export function dirtyBrickSkin(): void {
  /* merge off */
}

export function popBrickSkin(block: BlockCell | null | undefined): void {
  if (!block?.node?.isValid) return;
  setBodyEnabled(block.node, true);
  wakeBrickMesh(block.node);
}

export function coverBrickSkin(_block: BlockCell | null | undefined): void {
  /* merge off */
}

/** Keep every brick mesh on. Merged skins stay disabled. */
export function flushBrickSkin(blocks: BlockCell[], _buried: (b: BlockCell) => boolean): void {
  if (_host?.isValid) {
    clearChildren(_host);
    _host.destroy();
    _host = null;
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.node?.isValid) continue;
    setBodyEnabled(b.node, true);
    wakeBrickMesh(b.node);
  }
}
