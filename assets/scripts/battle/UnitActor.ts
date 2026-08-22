import { _decorator, Component, Node, Vec3 } from 'cc';
import { vibrateShort } from '../game/Haptic';
import { benchColOf, benchRankOf, ColorId, PLAY, SPECIAL_SPAN, TOKEN_RGB, parseColorToken, tokenOfColorId } from '../game/GameConfig';
import { nearestVoxelId } from '../game/VoxelPalette';
import { applyGhostLook, hideQueueColors, paintUnitColor } from './BrickSpecials';
import { TurretAnim } from './TurretAnim';
import { bindPowerMark, paintPowerMark, posePowerMark, preloadPowerDigits } from './PowerMark';
import { applyToyCaster } from './ToyBlockMesh';
import { TURRET_SCALE } from './ToyLook';
import { applyQueueBlockLook, applyTurretLook } from './TurretLook';
import { applyIceShell, clearIceShell, iceNeed } from './IceShell';
import { clearPickMark } from './PickMark';

const { ccclass } = _decorator;

export type UnitState = 'bench' | 'drag' | 'walk' | 'attack';

@ccclass('UnitActor')
export class UnitActor extends Component {
  static animLive = true;
  colorId: ColorId = ColorId.Orange;
  /** Official ColorLibrary id this turret shoots. -1 if unknown. */
  voxelId = -1;
  ghost = false;
  /** Shoveled back: sit as a queue cube with no power number until the front row. */
  asBlock = false;
  /** This cube rolled the hidden pattern for the current level. */
  colorHidden = false;
  trapped = false;
  freeing = false;
  /** Bench ice: cannot deploy until the shared field-count thaws. */
  frozen = false;
  trapCol = -1;
  trapRow = -1;
  trapSpan = SPECIAL_SPAN;
  power = 60;
  maxPower = 60;
  index = 0;
  benchCol = 0;
  benchRank = 0;
  state: UnitState = 'bench';

  readonly homePos = new Vec3();
  readonly targetPos = new Vec3();
  lockedCol = -1;
  suckWait = 0;
  inflight = 0;

  private readonly _q = new TurretAnim();
  private readonly _slideFrom = new Vec3();
  private readonly _slideTo = new Vec3();
  private readonly _flyFromScale = new Vec3(1, 1, 1);
  private _slideLeft = 0;
  private _slideDur = 0.22;
  private _flyWait = 0;
  private _flyArc = 0;
  private _flying = false;
  private _prevState: UnitState = 'bench';
  private _prevTrapped = false;
  private _prevPower = 40;
  private _prevInflight = 0;
  private _armed = false;
  private _vanish = false;
  private _powerTag: Node | null = null;
  private _shownPower = -1;
  private _powerOn = false;
  private _muzzle: Node | null = null;
  private _queuePosed = false;
  private _lookKind = '';
  private _lookColor = -1;
  private _lookOutline = false;
  private _lookHidden = false;
  private _aimX = NaN;
  private _aimY = NaN;
  private _aimZ = NaN;
  private _flyDone: (() => void) | null = null;
  private _flyKeepScale = false;

  onLoad(): void {
    applyToyCaster(this.node, false, false);
    this.syncFromName();
  }

  syncFromName(): void {
    this._parseName();
    this.node.getPosition(this.homePos);
    this._q.bind(this.node, this.index);
    this._queuePosed = false;
    this._lookKind = '';
    this._lookColor = -1;
    this._lookOutline = false;
    this._lookHidden = false;
    this._aimX = NaN;
    this._aimY = NaN;
    this._aimZ = NaN;
    this.refreshSeatLook();
    this._bindMuzzle();
    this._ensurePowerLabel();
    this.refreshPowerVisible();
    this._prevState = this.state;
    this._prevTrapped = this.trapped;
    this._prevPower = this.power;
    this._prevInflight = this.inflight;
    this._armed = false;
    this._vanish = false;
  }

  mouthWorld(out: Vec3): Vec3 {
    if (!this._muzzle?.isValid) this._bindMuzzle();
    if (this._muzzle?.isValid) return this._muzzle.getWorldPosition(out);
    this.node.getWorldPosition(out);
    out.y += 0.22;
    return out;
  }

  aimAt(world: Vec3): void {
    if (this.asBlock) return;
    if (
      Math.abs(world.x - this._aimX) < 0.012
      && Math.abs(world.y - this._aimY) < 0.012
      && Math.abs(world.z - this._aimZ) < 0.012
    ) {
      return;
    }
    this._aimX = world.x;
    this._aimY = world.y;
    this._aimZ = world.z;
    this._q.aimAt(world);
  }

  clearAim(): void {
    this._aimX = NaN;
    this._aimY = NaN;
    this._aimZ = NaN;
    this._q.clearAim();
  }

  setPowerVisible(on: boolean): void {
    this._powerOn = on;
    this.refreshPowerVisible();
  }

  refreshPowerVisible(): void {
    if (!this._powerTag) return;
    if (this._vanish && this.power <= 0) {
      this._powerTag.active = true;
      return;
    }
    this._powerTag.active = this._powerOn && !this.frozen && (this.usable || this.trapped) && this._shouldShowPower();
  }

  syncPowerLabel(): void {
    this._syncPowerText();
  }

  rebindPower(): void {
    if (this._powerTag?.isValid) {
      this._powerTag.removeFromParent();
      this._powerTag.destroy();
    }
    this._powerTag = null;
    this._shownPower = -1;
    this._ensurePowerLabel();
    this.refreshPowerVisible();
  }

  get recyclable(): boolean {
    return this.node.isValid && !this.node.active && !this.trapped && !this.freeing;
  }

  reuse(name: string): void {
    this.asBlock = false;
    this.colorHidden = false;
    this.trapped = false;
    this.freeing = false;
    this.frozen = false;
    clearIceShell(this.node, true);
    clearPickMark(this.node);
    this.lockedCol = -1;
    this.inflight = 0;
    this.suckWait = 0;
    this.state = 'bench';
    this._vanish = false;
    this._flying = false;
    this._slideLeft = 0;
    this._flyWait = 0;
    this._flyArc = 0;
    this._armed = false;
    this._queuePosed = false;
    this._lookKind = '';
    this._lookColor = -1;
    this._lookOutline = false;
    this._lookHidden = false;
    this._aimX = NaN;
    this._aimY = NaN;
    this._aimZ = NaN;
    this._flyDone = null;
    this._flyKeepScale = false;
    this.node.name = name;
    this.node.active = true;
    this.node.setRotationFromEuler(0, 0, 0);
    this.syncFromName();
  }

  get usable(): boolean {
    return this.node.activeInHierarchy && !this.trapped && !this._flying && !this._vanish && !this.frozen;
  }

  get onBench(): boolean {
    return this.node.activeInHierarchy
      && !this.trapped
      && !this._flying
      && !this._vanish
      && (this.state === 'bench' || this.state === 'drag');
  }

  setFrozen(on: boolean): void {
    if (this.frozen === on) {
      if (on) {
        this._q.holdSit();
        applyIceShell(this.node);
      } else clearIceShell(this.node);
      return;
    }
    this.frozen = on;
    if (on) {
      this._q.holdSit();
      applyIceShell(this.node);
    } else clearIceShell(this.node);
    this._shownPower = -1;
    this.refreshSeatLook();
    this._syncPowerText();
  }

  get traveling(): boolean {
    return this._flying || this._slideLeft > 0 || this._flyWait > 0 || this._vanish;
  }

  get vanishing(): boolean {
    return this._vanish;
  }

  private _wake(): void {
    this.enabled = true;
  }

  playVanish(done?: () => void): void {
    if (this._vanish) {
      done?.();
      return;
    }
    this._wake();
    this._vanish = true;
    if (this.frozen) {
      this.frozen = false;
      clearIceShell(this.node);
    }
    vibrateShort('medium');
    this._shownPower = -1;
    this._syncPowerText();
    this.refreshPowerVisible();
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      done?.();
    };
    this._q.playDie(finish);
    this.scheduleOnce(finish, 0.7);
  }

  resetHome(): void {
    this._wake();
    this.state = 'bench';
    this.lockedCol = -1;
    this._slideLeft = 0;
    this._flyWait = 0;
    this._flyArc = 0;
    this._flying = false;
    this._vanish = false;
    this.node.setPosition(this.homePos);
  }

  slideToHome(): void {
    this._wake();
    this.node.getPosition(this._slideFrom);
    this._slideTo.set(this.homePos);
    this._flying = false;
    this._flyArc = 0;
    this._slideDur = 0.22;
    this._slideLeft = 0.22;
  }

  flyToHome(done?: () => void): void {
    this._flyDone = done ?? null;
    this._beginFly(this.homePos, 0.72, 0.95, true, true);
  }

  /** Arc from the current pose to a world seat (bench → pit). */
  flyToWorld(world: Vec3, delay = 0, keepScale = false): void {
    if (this.node.parent) this.node.parent.inverseTransformPoint(this.targetPos, world);
    else this.targetPos.set(world);
    const dx = this.targetPos.x - this.node.position.x;
    const dz = this.targetPos.z - this.node.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this._flyDone = null;
    this._beginFly(
      this.targetPos,
      0.28 + Math.min(0.34, dist * 0.14),
      0.32 + Math.min(0.55, dist * 0.24),
      true,
      keepScale,
    );
    this._flyWait = Math.max(0, delay);
    if (this._flyWait <= 0) this._q.punchPick();
  }

  private _beginFly(local: Vec3, dur: number, arc: number, occupy: boolean, keepScale = false): void {
    this._wake();
    this.node.getPosition(this._slideFrom);
    this.node.getScale(this._flyFromScale);
    this._slideTo.set(local);
    this._flying = occupy;
    this._flyArc = arc;
    this._flyKeepScale = keepScale;
    this._slideDur = dur;
    this._slideLeft = dur;
  }

  flashFree(): void {
    this._wake();
    this._q.punchMerge();
  }

  update(dt: number): void {
    if (!this.node.activeInHierarchy) return;
    if (this._flyWait > 0) {
      this._flyWait = Math.max(0, this._flyWait - dt);
      if (this._flyWait <= 0) this._q.punchPick();
    } else if (this._slideLeft > 0) {
      this._slideLeft = Math.max(0, this._slideLeft - dt);
      const t = this._slideDur <= 0 ? 1 : 1 - this._slideLeft / this._slideDur;
      const k = t * t * (3 - 2 * t);
      const lift = this._flyArc > 0 ? Math.sin(t * Math.PI) : 0;
      this.node.setPosition(
        this._slideFrom.x + (this._slideTo.x - this._slideFrom.x) * k,
        this._slideFrom.y + (this._slideTo.y - this._slideFrom.y) * k + lift * this._flyArc,
        this._slideFrom.z + (this._slideTo.z - this._slideFrom.z) * k,
      );
      if (this._flyArc > 0) {
        if (!this._flyKeepScale) {
          const s = this._flyFromScale.x + (TURRET_SCALE - this._flyFromScale.x) * k;
          this.node.setScale(s, s, s);
        }
        if (this._slideLeft <= 0) {
          this._flying = false;
          this._flyArc = 0;
          if (this._flyKeepScale) this.node.setScale(this._flyFromScale);
          else this.node.setScale(TURRET_SCALE, TURRET_SCALE, TURRET_SCALE);
          this.node.setRotationFromEuler(0, 0, 0);
          this.node.setPosition(this._slideTo);
          this._q.punchLand();
          this.refreshSeatLook();
          this.refreshPowerVisible();
          const done = this._flyDone;
          this._flyDone = null;
          done?.();
        }
      }
    }
    if (this._activateFrontSeat() && !this._flying) this.refreshSeatLook();
    if (!this._armed) {
      this._armed = true;
      this._prevState = this.state;
      this._prevTrapped = this.trapped;
      this._prevPower = this.power;
      this._prevInflight = this.inflight;
    } else {
      if (this.state !== this._prevState || this.trapped !== this._prevTrapped) {
        if (!this._vanish && !this.frozen) {
          if (this.state === 'drag') this._q.punchPick();
          else if (this._prevState === 'drag') this._q.punchLand();
          if (!this._flying) this.refreshSeatLook();
        }
        this._prevState = this.state;
        this._prevTrapped = this.trapped;
      }
      if (!this.frozen) {
        if (this.inflight > this._prevInflight) this._q.punchSpit();
        if (this.power < this._prevPower) this._q.punchEat();
        else if (this.power > this._prevPower && this.state === 'bench' && !this._queued()) this._q.punchMerge();
      }
      this._prevPower = this.power;
      this._prevInflight = this.inflight;
    }
    if (this.frozen && !this._vanish) {
      this._q.holdSit();
    } else if (this._vanish) {
      this._q.tick(dt, this.state, this.inflight);
    } else if (this._queued()) {
      if (!this._queuePosed) {
        this._q.rest();
        this.clearAim();
        this._queuePosed = true;
      }
    } else {
      this._queuePosed = false;
      if (this._wantsAnim()) this._q.tick(dt, this.state, this.inflight);
    }
    if (this._shownPower !== this._shownNeed()) this._syncPowerText();
    if (this._canSleep()) this.enabled = false;
  }

  private _canSleep(): boolean {
    return this._queued()
      && this._queuePosed
      && this._slideLeft <= 0
      && this._flyWait <= 0
      && !this._flying
      && !this._vanish;
  }

  private _wantsOutline(): boolean {
    return !this.trapped && !this._queued();
  }

  /** Shoveled cubes stay queued until they occupy the front row. */
  private _activateFrontSeat(): boolean {
    if (!this.asBlock || this.trapped || this.benchRank > 0) return false;
    this.asBlock = false;
    return true;
  }

  private _queued(): boolean {
    if (this.trapped || this.benchRank === 0) return false;
    if (this.asBlock) return true;
    return !this._flying && this.state === 'bench';
  }

  private _wantsAnim(): boolean {
    if (this.frozen || this._queued()) return false;
    if (this.state === 'bench' && this.benchRank > 0 && !this.trapped) return false;
    if (this._vanish || this._slideLeft > 0 || this.state === 'drag' || this.state === 'walk' || this.state === 'attack') {
      return true;
    }
    if (!UnitActor.animLive || this.trapped) return false;
    return this.state === 'bench';
  }

  private _shouldShowPower(): boolean {
    if (this.trapped || this._queued()) return false;
    if (this.state === 'drag' || this.state === 'walk' || this.state === 'attack') return true;
    return this.state === 'bench' && this.benchRank === 0;
  }

  private _parseName(): void {
    const p = this.node.name.split('_');
    if (p.length < 3) return;
    if (p[0] === 'Rescue' && p.length >= 5) {
      this.colorId = parseColorToken(p[1]);
      this.trapCol = Number(p[2]) || 0;
      this.trapRow = Number(p[3]) || 0;
      const pow = Number(p[4]);
      if (Number.isFinite(pow) && pow > 0) this.power = pow;
      this.maxPower = this.power;
      this.trapped = true;
      return;
    }
    this.index = Number(p[1]) || 0;
    this.benchCol = benchColOf(this.index);
    this.benchRank = benchRankOf(this.index);
    this.colorId = parseColorToken(p[2]);
    const pow = Number(p[3]);
    if (Number.isFinite(pow) && pow > 0) this.power = pow;
    this.maxPower = this.power;
    this.ghost = p[4] === 'ghost';
    this.asBlock = p[4] === 'block';
    this.frozen = p[4] === 'frozen';
  }

  applySpecialLook(): void {
    if (this.ghost) applyGhostLook(this.node);
  }

  syncVoxelId(): void {
    const token = tokenOfColorId(this.colorId);
    this.voxelId = nearestVoxelId(PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.o);
  }

  refreshSeatLook(): void {
    this._wake();
    this._activateFrontSeat();
    const kind = this._queued() ? 'queue' : 'turret';
    const outline = this._wantsOutline();
    const hidden = kind === 'queue' && this.colorHidden && hideQueueColors();
    if (
      kind !== this._lookKind
      || this.colorId !== this._lookColor
      || outline !== this._lookOutline
      || hidden !== this._lookHidden
    ) {
      this._lookKind = kind;
      this._lookColor = this.colorId;
      this._lookOutline = outline;
      this._lookHidden = hidden;
      if (kind === 'queue') {
        this._q.rest();
        applyQueueBlockLook(this.node, this.colorId, hidden);
        this._queuePosed = true;
      } else {
        this.colorHidden = false;
        applyTurretLook(this.node, this.colorId, outline);
        this._queuePosed = false;
        paintUnitColor(this.node, tokenOfColorId(this.colorId));
      }
      this.syncVoxelId();
    }
    if (this._powerTag?.isValid) posePowerMark(this.node, this._powerTag);
    this.refreshPowerVisible();
    if (this.frozen && !this._vanish) applyIceShell(this.node);
  }

  private _bindMuzzle(): void {
    this._muzzle = this.node.getChildByName('Rig')?.getChildByName('Body')?.getChildByName('Mouth')
      ?? this.node.getChildByName('Body')?.getChildByName('Mouth')
      ?? this.node.getChildByName('Mouth')
      ?? this.node.getChildByName('Rig')?.getChildByName('Mouth')
      ?? null;
  }

  private _ensurePowerLabel(): void {
    this._powerTag = bindPowerMark(this.node);
    this._powerTag.active = true;
    this._shownPower = -1;
    this._syncPowerText();
    preloadPowerDigits().then(() => {
      if (!this.isValid || !this._powerTag?.isValid) return;
      this._shownPower = -1;
      this._syncPowerText();
    });
  }

  private _shownNeed(): number {
    return this.frozen ? iceNeed() : this.power;
  }

  private _syncPowerText(): void {
    if (!this._powerTag) return;
    const value = this._shownNeed();
    if (this._shownPower === value) return;
    if (!paintPowerMark(this._powerTag, value)) return;
    this._shownPower = value;
  }
}
