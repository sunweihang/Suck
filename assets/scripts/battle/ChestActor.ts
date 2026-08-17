import { _decorator, Animation, Component, Node, Tween, Vec3, tween } from 'cc';
import { SPECIAL_SPAN } from '../game/GameConfig';

const { ccclass } = _decorator;

const LID_NAMES = ['baoxiang01', 'Bone001'] as const;
const LID_REST_POS = new Vec3(0, 0.93695068359375, -0.6244735717773438);
const LID_REST_EULER = new Vec3(-90, 0, 0);
const LID_OPEN_POS = new Vec3(0, 0.974, -0.501);
const LID_OPEN_EULER = new Vec3(-196.659, 0, 0);

@ccclass('ChestActor')
export class ChestActor extends Component {
  trapped = true;
  claimed = false;
  trapCol = 0;
  trapRow = 0;
  trapSpan = SPECIAL_SPAN;

  private _bobbing = false;

  onLoad(): void {
    this._prepVisual();
    this.syncFromName();
  }

  syncFromName(): void {
    const parts = this.node.name.split('_');
    if (parts[0] !== 'Chest') return;
    this.trapCol = Number(parts[1]) || 0;
    this.trapRow = Number(parts[2]) || 0;
  }

  idleBob(): void {
    if (this._bobbing) return;
    this._bobbing = true;
    Tween.stopAllByTarget(this.node);
    const base = this.node.position.clone();
    tween(this.node)
      .repeatForever(
        tween(this.node)
          .to(0.7, { position: new Vec3(base.x, base.y + 0.03, base.z) }, { easing: 'sineInOut' })
          .to(0.7, { position: base.clone() }, { easing: 'sineInOut' }),
      )
      .start();
  }

  playOpen(done?: () => void): void {
    Tween.stopAllByTarget(this.node);
    this._bobbing = false;
    const lid = this._lid();
    const anim = lid?.getComponent(Animation);
    const clip = anim?.defaultClip ?? anim?.clips?.[0] ?? null;
    if (anim && clip) {
      anim.play(clip.name);
      this.scheduleOnce(() => done?.(), Math.max(0.45, clip.duration || 0.7));
      return;
    }
    if (!lid) {
      done?.();
      return;
    }
    lid.active = true;
    lid.setPosition(LID_REST_POS);
    lid.setRotationFromEuler(LID_REST_EULER.x, LID_REST_EULER.y, LID_REST_EULER.z);
    tween(lid)
      .to(0.72, { position: LID_OPEN_POS.clone(), eulerAngles: LID_OPEN_EULER.clone() }, { easing: 'quadOut' })
      .call(() => done?.())
      .start();
  }

  dismiss(): void {
    Tween.stopAllByTarget(this.node);
    this.claimed = true;
    this.trapped = false;
    tween(this.node)
      .to(0.22, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
      .call(() => {
        if (this.node.isValid) this.node.active = false;
      })
      .start();
  }

  private _prepVisual(): void {
    const gold = this.node.getChildByName('ui_gold_icon');
    if (gold) gold.active = false;
    const lid = this._lid();
    if (lid) {
      lid.active = true;
      lid.setPosition(LID_REST_POS);
      lid.setRotationFromEuler(LID_REST_EULER.x, LID_REST_EULER.y, LID_REST_EULER.z);
    }
  }

  private _lid(): Node | null {
    for (const name of LID_NAMES) {
      const n = this.node.getChildByName(name);
      if (n) return n;
    }
    return null;
  }
}
