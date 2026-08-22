import { _decorator, Component } from 'cc';
import type { UnitActor } from './UnitActor';
import { applyToySlot } from './ToySlotMesh';

const { ccclass } = _decorator;

@ccclass('SlotPad')
export class SlotPad extends Component {
  index = 0;
  homeCol = 0;
  locked = false;
  occupant: UnitActor | null = null;

  onLoad(): void {
    const p = this.node.name.split('_');
    if (p.length >= 2) this.index = Number(p[1]) || 0;
    this.refreshLook();
  }

  refreshLook(): void {
    applyToySlot(this.node, this.locked);
  }

  unlock(): boolean {
    if (!this.locked) return false;
    this.locked = false;
    this.refreshLook();
    return true;
  }

  get empty(): boolean {
    const u = this.occupant;
    if (!u?.node?.isValid || u.trapped) return true;
    // Die clip still owns the pit — auto-place must not sit on top of it.
    if (u.vanishing) return false;
    if (!u.node.active) return true;
    // Bench / drag have left the pit. Walk still owns it while flying in
    // (`usable` is false during that arc).
    return u.state === 'bench' || u.state === 'drag';
  }

  get open(): boolean {
    return this.node.active && !this.locked;
  }
}
