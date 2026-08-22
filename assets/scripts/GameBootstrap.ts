import {
  _decorator,
  Camera,
  Canvas,
  Color,
  Component,
  Director,
  director,
  DirectionalLight,
  EventKeyboard,
  Graphics,
  Input,
  KeyCode,
  Layers,
  MeshRenderer,
  Node,
  Prefab,
  UITransform,
  Vec3,
  Widget,
  assetManager,
  input,
  instantiate,
  view,
} from 'cc';
import {
  destroyGameClubButton,
  initGameCircle,
  relayoutGameClubButton,
} from './ads/GameCircleService';
import { initRewardedAd, showRewardedVideoAd } from './ads/RewardedAdService';
import { initWxShare } from './ads/WxShareService';
import { AudioService, setGameAudio } from './audio/AudioService';
import { buildPlayWorld } from './battle/BuildPlayWorld';
import { BattleDirector } from './battle/BattleDirector';
import { resetPlayFx } from './battle/InkShot';
import { GAME, playCamLookAtY, playCamOrthoHeight } from './game/GameConfig';
import { UGC_PLAY_BTN_LIFT, playViewBand } from './game/ViewFit';
import { applyLevel, ensureLevel, ensureLevels, getLevel, itemUnlocked, LEVEL_COUNT, loadLevelIndex, saveLevelIndex, WIN_DOUBLE_ONLY_FROM, type ItemId } from './game/LevelCatalog';
import { completeGuide, grantGuideItem, guideIdForLevel, isGuideDone, reclaimTeachItem, resetGuideProgress } from './game/TutorialGuide';
import {
  LETTERBOX_CLEAR,
  applyDesignResolution,
  applyPortraitCameraRect,
  capRenderResolution,
  needsLetterbox,
  portraitVisibleSize,
} from './game/PortraitFit';
import { Theme } from './game/Theme';
import { rollChestReward, type ChestReward } from './game/ChestLoot';
import { consumePendingChest, markChestPending, peekPendingChest, resetChestProgress } from './game/ChestProgress';
import { GOLD, goldAdReward, itemGoldCost, PlayerWallet, slotGoldCost } from './game/PlayerWallet';
import { ChestActor } from './battle/ChestActor';
import { SlotPad } from './battle/SlotPad';
import { ChestPanel } from './view/ChestPanel';
import { ItemShopPanel, isItemShopKind, type ShopKind } from './view/ItemShopPanel';
import { FailPanel } from './view/FailPanel';
import { GmPanel } from './view/GmPanel';
import { GoldHud } from './view/GoldHud';
import { HomePanel } from './view/HomePanel';
import { PlayHud } from './view/PlayHud';
import { SettingsPanel } from './view/SettingsPanel';
import { UgcHud } from './view/UgcHud';
import { VictoryPanel } from './view/VictoryPanel';
import { UgcEditor } from './ugc/UgcEditor';
import { encodeUgcText, getUgcMap, listUgcMaps, newUgcMap, parseUgcText, saveUgcMap, ugcToLevelDef } from './ugc/UgcStore';
import { PREFAB_UUID } from './battle/PrefabCatalog';
import { layoutWorldBg, spawnToyBackdrop } from './battle/ToyBackdrop';
import { ensureCoinFxRoot, playCoinFlyBurst, warmupCoinFlyers, worldToFxLocal } from './view/CoinFlyFx';
import { playItemGrantFly, playItemUseFly } from './view/ItemFlyFx';
import { artFrame, preloadHomeArt, preloadUiArt } from './view/UiArt';
import { loadGameBundles, loadHomeBundles } from './boot/LoadBundles';
import { attachBootLoad, type BootLoad } from './view/BootLoad';
import { initPlayerCloud } from './net/PlayerCloud';

function loadPrefab(uuid: string): Promise<Prefab> {
  return new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid }, (err, asset) => {
      if (err || !asset) {
        reject(err ?? new Error(`prefab missing ${uuid}`));
        return;
      }
      resolve(asset as Prefab);
    });
  });
}

function consumeClearChest(self: { _clearChest: ChestReward | null; _wallet: PlayerWallet }): ChestReward {
  const chest = self._clearChest;
  self._clearChest = null;
  if (!chest) return { gold: 0, items: [] };
  consumePendingChest();
  for (const id of chest.items) self._wallet.addItem(id, 1);
  return chest;
}

const { ccclass } = _decorator;

const LEFTOVER_NAMES = new Set(['SmokeCube', 'HintHand', 'Cube']);

function afterDraws(n: number): Promise<void> {
  return new Promise((resolve) => {
    let left = Math.max(1, n);
    const step = (): void => {
      left -= 1;
      if (left > 0) return;
      director.off(Director.EVENT_AFTER_DRAW, step);
      resolve();
    };
    director.on(Director.EVENT_AFTER_DRAW, step);
  });
}

/** Keeps a boot job that runs alongside others from taking the whole boot down with it. */
function bootStep(tag: string, job: Promise<unknown>): Promise<void> {
  return job.then(
    () => undefined,
    (err) => {
      console.error(`[Suck] boot ${tag} failed`, err);
    },
  );
}

/** Host splash (WeChat first-screen / web #SplashOverlay) waits on this before hiding. */
function notifyHostSplashHomeReady(): void {
  type SplashGate = {
    __unravelHomeReady?: boolean;
    __unravelNotifyHomeReady?: () => void;
  };
  const targets: SplashGate[] = [globalThis as SplashGate];
  const gg = (globalThis as { GameGlobal?: SplashGate }).GameGlobal;
  if (gg && gg !== targets[0]) targets.push(gg);

  for (const g of targets) {
    g.__unravelHomeReady = true;
    try {
      g.__unravelNotifyHomeReady?.();
    } catch {
      /* host optional */
    }
  }
}

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _mainCam: Camera | null = null;
  private _letterboxCam: Camera | null = null;
  private _uiCam: Camera | null = null;
  private _canvas: Node | null = null;
  private _home: HomePanel | null = null;
  private _settings: SettingsPanel | null = null;
  private _ugcHud: UgcHud | null = null;
  private _ugcEditor: UgcEditor | null = null;
  private _ugcPlay = false;
  private _ugcHoldPlay = false;
  private _ugcMapId: string | null = null;
  private _ugcLevel: ReturnType<typeof ugcToLevelDef> | null = null;
  private _worldKey = '';
  private _guideLandGen = 0;
  private _worldTouched = false;
  private _bootEpoch = 0;
  private _bootJobEpoch = -1;
  private _enteringPlay = false;
  private _loadShown = false;
  private _load: BootLoad | null = null;
  private _playHud: PlayHud | null = null;
  private _victory: VictoryPanel | null = null;
  private _fail: FailPanel | null = null;
  private _gm: GmPanel | null = null;
  private _gold: GoldHud | null = null;
  private _chest: ChestPanel | null = null;
  private _itemShop: ItemShopPanel | null = null;
  private _chestActor: ChestActor | null = null;
  private _pendingSlot: SlotPad | null = null;
  private _chestBusy = false;
  private _clearChest: ChestReward | null = null;
  private _itemShopBusy = false;
  private _wallet = new PlayerWallet();
  private _battle: BattleDirector | null = null;
  private _audio: AudioService | null = null;
  private _level = 1;
  private _builtLevel = 0;
  private _bootJob: Promise<void> | null = null;
  private _uiJob: Promise<void> | null = null;
  private _clearGold = 0;
  private _doubleBusy = false;
  /** Built level already settled; blocks repeat onWin while the panel is up. */
  private _settledBuilt = -1;
  /** Host splash stays until BootLoad has painted once. */
  private _homeDrawn = false;

  onLoad(): void {
    initWxShare();
    initGameCircle();
    this._holdHostSplash();
    this._restoreProgress();
    this._stripLeftovers();
    input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    this._uiJob = this._bootUi();
  }

  /** Keep company splash pixels: no camera may SOLID_COLOR-wipe before BootLoad. */
  private _holdHostSplash(): void {
    applyDesignResolution();
    capRenderResolution(this.node);
    const camNode = this.node.scene?.getChildByName('Main Camera');
    const cam = camNode?.getComponent(Camera);
    if (cam) {
      cam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
      cam.clearColor = Theme.sky;
      cam.enabled = false;
      this._mainCam = cam;
    }
    this._ensureLetterboxCam();
    if (this._letterboxCam?.isValid) this._letterboxCam.enabled = false;
  }

  private _revealHomeAndLiftSplash(): void {
    if (this._homeDrawn) return;
    this._homeDrawn = true;
    this._ugcHud?.hide();
    this._syncLetterboxCam();
    this._setWorldLive(false);
    notifyHostSplashHomeReady();
    initRewardedAd();
  }

  private _warmAfterHome(artJob: Promise<void>): void {
    const audio = this._ensureAudio();
    void artJob.then(() => {
      if (!this.isValid) return;
      this._playHud?.applyArt();
      this._gold?.applyArt();
      this._settings?.applyArt();
      this._chest?.applyArt();
      this._itemShop?.applyArt();
    });
    void bootStep('win audio', audio.ensureWin());
    if (this._canvas) warmupCoinFlyers(this._canvas);
    if (this.node.scene && this._mainCam?.node) {
      void bootStep('backdrop', spawnToyBackdrop(this.node.scene, this._mainCam.node));
    }
  }

  private async _bootUi(): Promise<void> {
    try {
      applyDesignResolution();
      capRenderResolution(this.node);
      this._tuneMainCamera();
      this._tuneLighting();
      this._ensureLetterboxCam();
      const canvas = this._ensureUiCanvas();
      if (this._uiCam?.isValid) {
        this._uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
      }
      const load = await attachBootLoad(canvas);
      this._load = load;
      await afterDraws(2);
      notifyHostSplashHomeReady();
      await loadHomeBundles((p) => load.set(p));
      void loadGameBundles();
      load.set(0.78);
      await ensureLevels();
      this._restoreProgress();
      this._wallet.load();
      this._bindPlayerCloud();
      load.raise();
      await this._buildUi();
      load.raise();
      this._home?.hide();
      load.set(0.86);
      this._ensureAudio();
      const artJob = bootStep('ui art', preloadUiArt());
      this._applyPortraitFrame();
      view.on('canvas-resize', this._applyPortraitFrame, this);
      await preloadHomeArt();
      this._home?.applyArt();
      this._ugcHud?.hide();
      this._applyPortraitFrame();
      await load.finish();
      this._showHome();
      this._revealHomeAndLiftSplash();
      await afterDraws(1);
      load.hide();
      this._warmAfterHome(artJob);
    } catch (err) {
      console.error('[Suck] boot ui failed', err);
      this._showHome();
      this._revealHomeAndLiftSplash();
    }
  }

  start(): void {
    /* world boots after subpackages in _bootUi */
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    view.off('canvas-resize', this._applyPortraitFrame, this);
    destroyGameClubButton();
    setGameAudio(null);
    this._audio = null;
    this._disposeUgcEditor();
  }

  private _onKeyDown(e: EventKeyboard): void {
    if (this._ugcPlay || this._ugcEditor) return;
    if (e.keyCode === KeyCode.KEY_N || e.keyCode === KeyCode.ARROW_RIGHT || e.keyCode === KeyCode.BRACKET_RIGHT) {
      this._gmSkip(this._level + 1);
      return;
    }
    if (e.keyCode === KeyCode.KEY_P || e.keyCode === KeyCode.ARROW_LEFT || e.keyCode === KeyCode.BRACKET_LEFT) {
      this._gmSkip(this._level - 1);
    }
  }

  private _stripLeftovers(): void {
    const scene = this.node.scene;
    if (!scene) return;
    for (const child of [...scene.children]) {
      if (LEFTOVER_NAMES.has(child.name)) this._disposeTree(child);
    }
  }

  private _disposeNamed(name: string): void {
    const scene = this.node.scene;
    if (!scene) return;
    const n = scene.getChildByName(name);
    if (!n) return;
    n.name = `${name}_disposed`;
    n.removeFromParent();
    this._disposeTree(n);
    if (name === 'PlayWorld' || name === 'PlayWorldStandby') resetPlayFx();
  }

  /** Drop renderers with a missing GPU descriptor set before engine destroyModel. */
  private _disposeTree(n: Node): void {
    for (const mr of n.getComponentsInChildren(MeshRenderer)) {
      mr.enabled = false;
      const model = mr.model as { subModels?: Array<{ descriptorSet: unknown }> } | null;
      if (!model?.subModels?.some((sub) => sub && !sub.descriptorSet)) continue;
      const raw = mr as unknown as { _model: null; _models: unknown[] };
      raw._model = null;
      raw._models = [];
    }
    n.destroy();
  }

  private _invalidateWorldBoot(): void {
    this._bootEpoch++;
  }

  private _abandonedBoot(epoch: number): boolean {
    return epoch !== this._bootEpoch || !this.isValid;
  }

  /** Instantiates the current map. Home prefetches it so Play can skip a second BootLoad. */
  private _bootWorld(): Promise<void> {
    if (this._bootJob && this._bootJobEpoch === this._bootEpoch) return this._bootJob;
    const epoch = this._bootEpoch;
    this._bootJobEpoch = epoch;
    this._bootJob = this._bootWorldInner(epoch).finally(() => {
      if (this._bootJobEpoch === epoch) this._bootJob = null;
    });
    return this._bootJob;
  }

  private _prefetchPlayWorld(): void {
    if (!this.isValid || this._ugcPlay || this._ugcEditor) return;
    void this._bootWorld();
  }

  private _playWorldKey(): string {
    return this._ugcPlay ? `ugc:${this._ugcMapId}` : `lv:${this._level}`;
  }

  /** Dim covers the field; stop drawing it so the settle panel and confetti keep the frame. */
  private _sleepPlayWorld(): void {
    const world = this._ugcEditor?.node ?? this._battle?.node;
    if (world?.isValid) world.active = false;
    const cam = this._mainCam;
    if (!cam?.isValid) return;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = Theme.sky;
  }

  private _openSettle(): void {
    this._sleepPlayWorld();
    this._playHud?.hide();
  }

  private async _runLevelLoad(work: (set: (p: number) => void) => Promise<void>): Promise<void> {
    const load = this._load;
    if (!load) {
      await work(() => undefined);
      return;
    }
    this._loadShown = true;
    load.show();
    load.set(0.1);
    this._home?.hide();
    this._playHud?.hide();
    this._victory?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._settings?.hide();
    this._setGoldVisible(false);
    try {
      await work((p) => load.set(p));
      await load.finish();
    } finally {
      this._loadShown = false;
      load.hide();
    }
  }

  private async _bootWorldInner(epoch: number): Promise<void> {
    try {
      await loadGameBundles();
      if (this._abandonedBoot(epoch) || this._ugcEditor) return;
      await ensureLevels();
      if (this._abandonedBoot(epoch) || this._ugcEditor || !this.node.scene) return;
      const key = this._playWorldKey();
      if (this._worldKey === key && this._battle?.isValid) return;
      this._disposeNamed('PlayWorld');
      this._disposeUgcEditor();
      if (!(this._ugcPlay && this._ugcLevel)) await ensureLevel(this._level);
      if (this._abandonedBoot(epoch) || this._ugcEditor || !this.node.scene) return;
      const level = this._ugcPlay && this._ugcLevel ? this._ugcLevel : getLevel(this._level);
      const world = await buildPlayWorld(this.node.scene, level, {
        onProgress: (p) => {
          if (this._loadShown) this._load?.set(0.22 + p * 0.7);
        },
      });
      if (this._abandonedBoot(epoch) || this._ugcEditor) {
        if (world.root?.isValid) {
          world.root.name = 'PlayWorld_abandoned';
          world.root.removeFromParent();
          this._disposeTree(world.root);
        }
        return;
      }
      this._battle = world.battle;
      this._worldKey = key;
      this._builtLevel = this._ugcPlay ? 1 : this._level;
      this._frameMainCamera();
      this._bindBattle();
      this._home?.setLevel(this._level, LEVEL_COUNT);
      this._playHud?.setLevel(this._level);
      this._setWorldLive(false);
    } catch (err) {
      console.error('[Suck] boot world failed', err);
    }
  }

  private _bindBattle(): void {
    if (!this._battle?.isValid || !this._mainCam || !this._canvas) return;
    this._battle.bind({
      camera: this._mainCam,
      canvas: this._canvas,
      onWin: () => this._onLevelCleared(),
      onLose: () => this._onLevelFailed(),
      onItems: (state) => this._playHud?.setItems(state),
      onGuide: (guide) => this._playHud?.setGuide(guide),
      onGoldDenied: () => this._gold?.deny(),
      onChest: (chest) => this._onChestReady(chest),
      onUnlockSlot: (slot) => this._showSlotShop(slot),
      onItemUseFx: (req) => this._playItemUseFx(req),
      wallet: this._wallet,
    });
    this._playHud?.setItems(this._battle.itemState());
    this._gold?.setCoins(this._wallet.coins);
  }

  private _playWorldReady(): boolean {
    return this._worldKey === this._playWorldKey() && !!this._battle?.isValid;
  }

  private async _ensureWorld(): Promise<void> {
    if (this._bootJob && this._bootJobEpoch === this._bootEpoch) await this._bootJob;
    if (this._playWorldReady()) return;
    await this._bootWorld();
  }

  private _onLevelCleared(): void {
    if (this._settledBuilt === this._builtLevel) return;
    this._settledBuilt = this._builtLevel;
    if (this._ugcPlay) {
      this._clearGold = 0;
      this._clearChest = null;
      this._home?.hide();
      this._ugcHud?.hide();
      this._settings?.hide();
      this._fail?.hide();
      this._chest?.hide();
      this._itemShop?.hide();
      this._gm?.collapse();
      this._battle?.setPlaying(false);
      this._setGoldVisible(false);
      this._openSettle();
      this._victory?.show({
        hasNext: true,
        gold: 0,
        canDouble: false,
        nextLabel: '返回创作',
        cleared: 0,
      });
      return;
    }
    const cleared = this._level;
    if (this._level < LEVEL_COUNT) this._level += 1;
    saveLevelIndex(this._level);
    this._clearGold = GOLD.win;
    const gid = guideIdForLevel(cleared);
    if (gid === 'tap' || gid === 'spin') completeGuide(gid);
    reclaimTeachItem(this._wallet, cleared);
    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._home?.hide();
    this._settings?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
    this._setGoldVisible(true);
    markChestPending(cleared);
    this._clearChest = peekPendingChest() ? rollChestReward(cleared) : null;
    this._openSettle();
    this._victory?.show({
      hasNext: this._level > cleared && cleared < WIN_DOUBLE_ONLY_FROM,
      gold: GOLD.win,
      canDouble: true,
      cleared,
      chestItems: this._clearChest?.items ?? [],
    });
    if (this._canvas) {
      this._gold?.node.setSiblingIndex(this._canvas.children.length - 1);
      this._gm?.node.setSiblingIndex(this._canvas.children.length - 1);
    }
  }

  private _claimNext(): void {
    this._claimSettle('win');
  }

  private _claimRetry(): void {
    this._claimSettle('fail');
  }

  private _beginSettleClaim(kind: 'win' | 'fail'): void {
    this._lockSettle(kind);
    if (kind === 'win') this._victory?.releaseFx();
  }

  private _claimSettle(kind: 'win' | 'fail'): void {
    if (this._doubleBusy) return;
    this._beginSettleClaim(kind);
    const fallback = kind === 'fail' ? GOLD.fail : GOLD.win;
    const amount = this._clearGold > 0 ? this._clearGold : fallback;
    this._clearGold = 0;
    const extra = consumeClearChest(this);
    void this._flyGoldThen(amount + extra.gold, kind);
  }

  private _claimDouble(): void {
    void this._claimSettleDouble('win');
  }

  private _claimFailDouble(): void {
    void this._claimSettleDouble('fail');
  }

  private async _claimSettleDouble(kind: 'win' | 'fail'): Promise<void> {
    if (this._doubleBusy) return;
    this._doubleBusy = true;
    this._beginSettleClaim(kind);
    const result = await showRewardedVideoAd();
    const fallback = kind === 'fail' ? GOLD.fail : GOLD.win;
    const base = this._clearGold > 0 ? this._clearGold : fallback;
    const extra = consumeClearChest(this);
    const amount = (result === 'rewarded' ? base * 2 : base) + extra.gold;
    this._clearGold = 0;
    this._doubleBusy = false;
    void this._flyGoldThen(amount, kind);
  }

  private _lockSettle(kind: 'win' | 'fail'): void {
    if (kind === 'fail') this._fail?.lock();
    else this._victory?.lock();
  }

  private async _flyGoldThen(amount: number, kind: 'win' | 'fail'): Promise<void> {
    if (this._doubleBusy) return;
    this._doubleBusy = true;
    this._beginSettleClaim(kind);
    const after = () => {
      this._doubleBusy = false;
      if (kind === 'fail') this._retryPlay();
      else void this._enterNext();
    };
    const canvas = this._canvas;
    if (!canvas?.isValid || amount <= 0) {
      if (amount > 0) this._wallet.add(amount);
      after();
      return;
    }
    await afterDraws(1);
    if (!this.isValid || !canvas.isValid) {
      after();
      return;
    }
    const fx = ensureCoinFxRoot(canvas);
    this._gold?.node.setSiblingIndex(canvas.children.length - 1);
    fx.setSiblingIndex(canvas.children.length - 1);
    const start = new Vec3();
    const end = new Vec3();
    const panel = kind === 'fail' ? this._fail : this._victory;
    panel?.goldStartWorld(start);
    if (this._gold) this._gold.iconWorldPos(end);
    else end.set(start.x + 360, start.y + 720, 0);
    worldToFxLocal(fx, start, start);
    worldToFxLocal(fx, end, end);
    await new Promise<void>((resolve) => {
      playCoinFlyBurst({
        fxRoot: fx,
        start,
        end,
        amount,
        frame: panel?.goldIconFrame() ?? artFrame('goldIcon'),
        onCredit: (n) => this._wallet.add(n, true, false),
        onDone: () => resolve(),
      });
    });
    this._wallet.save();
    after();
  }

  private _onLevelFailed(): void {
    if (this._settledBuilt === this._builtLevel) return;
    this._settledBuilt = this._builtLevel;
    if (this._ugcPlay) {
      this._clearGold = 0;
      this._home?.hide();
      this._ugcHud?.hide();
      this._settings?.hide();
      this._victory?.hide();
      this._chest?.hide();
      this._itemShop?.hide();
      this._gm?.collapse();
      this._battle?.setPlaying(false);
      this._setGoldVisible(false);
      this._openSettle();
      this._fail?.show({ gold: 0, canDouble: false });
      return;
    }
    this._clearGold = GOLD.fail;
    this._clearChest = null;
    this._home?.hide();
    this._settings?.hide();
    this._victory?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
    this._setGoldVisible(true);
    this._openSettle();
    this._fail?.show({
      gold: GOLD.fail,
      canDouble: true,
    });
    if (this._canvas) {
      this._gold?.node.setSiblingIndex(this._canvas.children.length - 1);
      this._gm?.node.setSiblingIndex(this._canvas.children.length - 1);
    }
  }

  private _onChestReady(chest: ChestActor): void {
    this._chestActor = chest;
    this._home?.hide();
    this._settings?.hide();
    this._victory?.hide();
    this._fail?.hide();
    this._itemShop?.hide();
    this._gm?.collapse();
    this._chest?.show();
  }

  private async _watchChest(): Promise<void> {
    if (this._chestBusy) return;
    this._chestBusy = true;
    this._chest?.setBusy(true);
    const result = await showRewardedVideoAd();
    this._chestBusy = false;
    this._chest?.setBusy(false);
    if (result !== 'rewarded') return;
    this._chestActor?.playOpen();
    this._chest?.reveal(rollChestReward(this._builtLevel || this._level));
  }

  private _claimChest(reward: ChestReward): void {
    this._wallet.add(reward.gold);
    for (const id of reward.items) this._wallet.addItem(id, 1);
    const actor = this._chestActor;
    this._chestActor = null;
    this._chest?.hide();
    if (actor) this._battle?.claimChest(actor);
    this._battle?.setPlaying(true);
    this._flyGrantedItems(reward.items);
  }

  private _takeClearChest(): ChestReward {
    return consumeClearChest(this);
  }

  private _grantLeftoverChest(): void {
    if (this._ugcPlay) return;
    const cleared = peekPendingChest();
    if (!cleared) return;
    consumePendingChest();
    const reward = rollChestReward(cleared);
    this._wallet.add(reward.gold);
    for (const id of reward.items) this._wallet.addItem(id, 1);
    this._flyGrantedItems(reward.items);
  }

  private _onPlayItem(id: ItemId): void {
    const level = this._builtLevel || this._level;
    if (!itemUnlocked(id, level)) return;
    const gid = guideIdForLevel(level);
    if (gid && !isGuideDone(gid)) {
      if (gid === 'tap' || gid === 'spin' || id !== gid) return;
    }
    if (this._wallet.itemCount(id) > 0) {
      this._battle?.useItem(id);
      return;
    }
    this._showItemShop(id);
  }

  private _showSlotShop(slot: SlotPad): void {
    if (!slot.locked) return;
    this._pendingSlot = slot;
    this._showItemShop('slot');
  }

  private _showGoldShop(): void {
    if (this._victory?.isOpen() || this._fail?.node.active || this._chest?.node.active) return;
    this._showItemShop('gold');
  }

  private _showItemShop(kind: ShopKind): void {
    this._unlockAudio();
    this._itemShopBusy = false;
    this._itemShop?.show(kind, isItemShopKind(kind) ? this._wallet.itemCount(kind) : 0);
    if (this._canvas) {
      this._gold?.node.setSiblingIndex(this._canvas.children.length - 1);
      this._gm?.node.setSiblingIndex(this._canvas.children.length - 1);
    }
    this._gm?.collapse();
    this._battle?.setPlaying(false);
  }

  private _closeItemShop(): void {
    this._itemShopBusy = false;
    this._pendingSlot = null;
    this._itemShop?.hide();
    if (this._chest?.node.active || this._settings?.node.active) return;
    if (this._victory?.isOpen() || this._fail?.node.active) return;
    if (this._playHud?.node.active) this._battle?.setPlaying(true);
  }

  private _buyShop(kind: ShopKind): void {
    if (kind === 'gold') return;
    if (kind === 'slot') this._buySlot();
    else this._buyItem(kind);
  }

  private _useShop(kind: ShopKind): void {
    if (!isItemShopKind(kind)) return;
    this._closeItemShop();
    this._battle?.useItem(kind);
  }

  private _watchShop(kind: ShopKind): Promise<void> {
    if (kind === 'gold') return this._watchGold();
    return kind === 'slot' ? this._watchSlot() : this._watchItem(kind);
  }

  private _buyItem(id: ItemId): void {
    if (this._itemShopBusy) return;
    const cost = itemGoldCost(id);
    if (!this._wallet.spend(cost)) {
      this._gold?.deny();
      return;
    }
    this._wallet.addItem(id, 1);
    this._closeItemShop();
    this._flyGrantedItems([id]);
  }

  private async _watchItem(id: ItemId): Promise<void> {
    if (this._itemShopBusy) return;
    this._itemShopBusy = true;
    this._itemShop?.setBusy(true);
    const result = await showRewardedVideoAd();
    this._itemShopBusy = false;
    this._itemShop?.setBusy(false);
    if (result !== 'rewarded') return;
    this._wallet.addItem(id, 1);
    this._closeItemShop();
    this._flyGrantedItems([id]);
  }

  private _buySlot(): void {
    if (this._itemShopBusy) return;
    if (!this._wallet.spend(slotGoldCost())) {
      this._gold?.deny();
      return;
    }
    this._finishSlotUnlock();
  }

  private async _watchSlot(): Promise<void> {
    if (this._itemShopBusy) return;
    this._itemShopBusy = true;
    this._itemShop?.setBusy(true);
    const result = await showRewardedVideoAd();
    this._itemShopBusy = false;
    this._itemShop?.setBusy(false);
    if (result !== 'rewarded') return;
    this._finishSlotUnlock();
  }

  private _finishSlotUnlock(): void {
    const slot = this._pendingSlot;
    this._pendingSlot = null;
    this._closeItemShop();
    if (slot) this._battle?.unlockSlot(slot);
  }

  private async _watchGold(): Promise<void> {
    if (this._itemShopBusy) return;
    this._itemShopBusy = true;
    this._itemShop?.setBusy(true);
    const result = await showRewardedVideoAd();
    this._itemShopBusy = false;
    this._itemShop?.setBusy(false);
    if (result !== 'rewarded') return;
    const start = new Vec3();
    this._itemShop?.iconWorldPos(start);
    this._closeItemShop();
    this._flyShopGold(start, goldAdReward());
  }

  private _flyShopGold(startWorld: Vec3, amount: number): void {
    const canvas = this._canvas;
    if (!canvas?.isValid || amount <= 0) {
      if (amount > 0) this._wallet.add(amount);
      return;
    }
    const fx = ensureCoinFxRoot(canvas);
    this._gold?.node.setSiblingIndex(canvas.children.length - 1);
    fx.setSiblingIndex(canvas.children.length - 1);
    const start = startWorld.clone();
    const end = new Vec3();
    if (this._gold) this._gold.iconWorldPos(end);
    else end.set(start.x + 360, start.y + 720, 0);
    worldToFxLocal(fx, start, start);
    worldToFxLocal(fx, end, end);
    playCoinFlyBurst({
      fxRoot: fx,
      start,
      end,
      amount,
      frame: artFrame('goldIcon'),
      onCredit: (n) => this._wallet.add(n),
    });
  }

  private _playItemState() {
    return this._battle?.itemState() ?? {
      coins: this._wallet.coins,
      shuffle: this._wallet.itemCount('shuffle'),
      hook: this._wallet.itemCount('hook'),
      shovel: this._wallet.itemCount('shovel'),
      bomb: this._wallet.itemCount('bomb'),
      hookPick: false,
      shovelPick: false,
      bombPick: false,
      canShovel: false,
    };
  }

  private _flyGrantedItems(ids: readonly ItemId[]): void {
    void this._flyChestItems(ids);
  }

  private _flyChestItems(ids: readonly ItemId[]): Promise<void> {
    const canvas = this._canvas;
    this._playHud?.show();
    this._playHud?.setItems(this._playItemState());
    this._playHud?.layoutChrome();
    if (!canvas?.isValid || ids.length <= 0) return Promise.resolve();
    const start = new Vec3();
    this._victory?.chestStartWorld(start);
    return new Promise((resolve) => {
      playItemGrantFly({
        canvas,
        ids,
        startWorld: start,
        slotWorldPos: (id, out) => this._playHud?.itemIconWorldPos(id, out) ?? false,
        onLand: (id) => this._playHud?.pulseItem(id),
        onDone: () => resolve(),
      });
    });
  }

  private _playItemUseFx(req: {
    id: ItemId;
    world: Vec3 | null;
    onArrive: () => void;
  }): void {
    const canvas = this._canvas;
    if (!canvas?.isValid) {
      req.onArrive();
      return;
    }
    const start = new Vec3();
    if (!this._playHud?.itemIconWorldPos(req.id, start)) {
      req.onArrive();
      return;
    }
    this._playHud.pulseItem(req.id);
    playItemUseFly({
      canvas,
      id: req.id,
      startWorld: start,
      endWorld: req.world,
      worldCam: this._mainCam,
      onArrive: req.onArrive,
    });
  }

  private _gmWin(): void {
    if (this._battle?.isValid) {
      this._battle.forceWin();
      return;
    }
    this._onLevelCleared();
  }

  private _gmLose(): void {
    if (this._battle?.isValid) {
      this._battle.forceLose();
      return;
    }
    this._onLevelFailed();
  }

  private _gmSkip(n: number): void {
    this._level = Math.max(1, Math.min(LEVEL_COUNT, n | 0));
    saveLevelIndex(this._level);
    this._builtLevel = 0;
    this._gm?.setLevel(this._level);
    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._playHud?.setLevel(this._level);
    this._victory?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._enterPlay();
  }

  private _gmReset(): void {
    this._worldKey = '';
    this._builtLevel = 0;
    this._victory?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._enterPlay();
  }

  private _gmWipeLocal(): void {
    resetGuideProgress();
    resetChestProgress();
    this._wallet.reset();
    this._gmSkip(1);
  }

  private _tuneMainCamera(): void {
    const camNode = this.node.scene?.getChildByName('Main Camera');
    const cam = camNode?.getComponent(Camera);
    if (!cam || !camNode) return;
    this._mainCam = cam;
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = playCamOrthoHeight();
    cam.fov = GAME.worldCamFovDeg;
    cam.near = GAME.worldCamNear;
    cam.far = GAME.worldCamFar;
    cam.clearColor = Theme.sky;
    cam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    cam.priority = 1;
    cam.visibility = Layers.Enum.DEFAULT | Layers.Enum.UI_3D;
    this._frameMainCamera();
    cam.enabled = false;
  }

  /** Pin the turret dock to the item tray; leftover height is the sculpture field. */
  private _frameMainCamera(): void {
    const cam = this._mainCam;
    const camNode = cam?.node;
    if (!cam || !camNode) return;
    cam.orthoHeight = playCamOrthoHeight();
    const pitch = (GAME.worldCamPitchDeg * Math.PI) / 180;
    const yaw = (GAME.worldCamYawDeg * Math.PI) / 180;
    const dist = GAME.worldCamDist;
    const look = new Vec3(
      GAME.worldCamLookAtX,
      playCamLookAtY(
        playViewBand(
          portraitVisibleSize().height,
          this._ugcEditor && !this._ugcPlay ? UGC_PLAY_BTN_LIFT : 0,
        ).pinFrac,
      ),
      GAME.worldCamLookAtZ,
    );
    camNode.setPosition(
      look.x + dist * Math.sin(yaw) * Math.cos(pitch),
      look.y + dist * Math.sin(pitch),
      look.z + dist * Math.cos(yaw) * Math.cos(pitch),
    );
    camNode.lookAt(look, Vec3.UNIT_Y);
    applyPortraitCameraRect(cam);
    layoutWorldBg(camNode.scene);
  }

  private _tuneLighting(): void {
    const scene = this.node.scene;
    if (!scene) return;
    const shadows = scene.globals?.shadows;
    if (shadows) shadows.enabled = false;
    const ambient = scene.globals?.ambient;
    if (ambient) {
      ambient.skyIllum = 26000;
      ambient.skyColor = new Color(254, 250, 220, 255);
      ambient.groundAlbedo = new Color(176, 226, 236, 255);
    }
    const lightNode = scene.getChildByName('Directional Light');
    const light = lightNode?.getComponent(DirectionalLight);
    if (light && lightNode) {
      lightNode.setPosition(8, 16, 10);
      lightNode.setRotationFromEuler(-58, 46, 0);
      light.color = new Color(255, 232, 204, 255);
      light.illuminance = 215000;
      light.shadowEnabled = false;
    }
    const fillNode = scene.getChildByName('Fill Light');
    if (fillNode) fillNode.active = false;
  }

  private _ensureLetterboxCam(): void {
    const scene = this.node.scene;
    if (!scene) return;
    let node = scene.getChildByName('LetterboxCam');
    if (!node) {
      node = new Node('LetterboxCam');
      scene.addChild(node);
    }
    let cam = node.getComponent(Camera);
    if (!cam) cam = node.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = 10;
    cam.priority = -100;
    cam.visibility = 0;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = LETTERBOX_CLEAR;
    cam.rect.set(0, 0, 1, 1);
    cam.enabled = false;
    this._letterboxCam = cam;
    this._syncLetterboxCam();
  }

  private _syncLetterboxCam(): void {
    const cam = this._letterboxCam;
    if (!cam?.isValid) return;
    cam.clearColor = LETTERBOX_CLEAR;
    cam.rect.set(0, 0, 1, 1);
    cam.enabled = this._homeDrawn && needsLetterbox();
  }

  private _applyPortraitFrame = (): void => {
    applyDesignResolution();
    capRenderResolution(this.node);
    const vis = portraitVisibleSize();
    this._canvas?.getComponent(UITransform)?.setContentSize(vis.width, vis.height);
    if (this._uiCam?.isValid) {
      this._uiCam.orthoHeight = vis.height * 0.5;
      this._uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
      applyPortraitCameraRect(this._uiCam);
    }
    if (this._mainCam?.isValid) this._frameMainCamera();
    this._syncLetterboxCam();
    if (this._battle?.node.active) this._battle.reposeView();
    layoutWorldBg(this.node.scene);
    this._home?.layoutChrome();
    this._ugcHud?.layoutChrome();
    this._settings?.layoutChrome();
    this._playHud?.layoutChrome();
    this._gold?.layoutChrome();
    this._victory?.layoutChrome();
    this._fail?.layoutChrome();
    this._chest?.layoutChrome();
    this._itemShop?.layoutChrome();
    this._gm?.layoutChrome();
    relayoutGameClubButton();
  };

  private _ensureUiCanvas(): Node {
    if (this._canvas?.isValid) return this._canvas;
    const scene = this.node.scene!;
    const vis = portraitVisibleSize();
    const canvasN = new Node('Canvas');
    scene.addChild(canvasN);
    canvasN.layer = Layers.Enum.UI_2D;
    canvasN.addComponent(UITransform).setContentSize(vis.width, vis.height);
    const canvas = canvasN.addComponent(Canvas);
    canvas.alignCanvasWithScreen = false;

    const camNode = new Node('UiCamera');
    canvasN.addChild(camNode);
    camNode.layer = Layers.Enum.UI_2D;
    camNode.setPosition(0, 0, 1000);
    const uiCam = camNode.addComponent(Camera);
    uiCam.projection = Camera.ProjectionType.ORTHO;
    uiCam.orthoHeight = vis.height * 0.5;
    uiCam.near = 0.1;
    uiCam.far = 2000;
    uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    uiCam.priority = 10;
    uiCam.visibility = Layers.Enum.UI_2D;
    applyPortraitCameraRect(uiCam);
    canvas.cameraComponent = uiCam;
    this._uiCam = uiCam;
    this._canvas = canvasN;
    return canvasN;
  }

  private async _buildUi(): Promise<void> {
    const canvasN = this._ensureUiCanvas();

    const touch = new Node('TouchPad');
    canvasN.addChild(touch);
    touch.layer = Layers.Enum.UI_2D;
    touch.addComponent(UITransform).setContentSize(1080, 1920);
    const tw = touch.addComponent(Widget);
    tw.isAlignTop = tw.isAlignBottom = tw.isAlignLeft = tw.isAlignRight = true;
    tw.top = tw.bottom = tw.left = tw.right = 0;
    const g = touch.addComponent(Graphics);
    g.fillColor = new Color(0, 0, 0, 0);
    g.rect(-540, -960, 1080, 1920);
    g.fill();

    const homeN = await this._spawnHome(canvasN);
    this._home = homeN.getComponent(HomePanel) ?? homeN.addComponent(HomePanel);
    this._home.setup({
      onPlay: () => this._enterPlay(),
      onSettings: () => this._showSettings(),
    });

    const ugcHudN = new Node('UgcHud');
    ugcHudN.active = false;
    canvasN.addChild(ugcHudN);
    this._ugcHud = ugcHudN.addComponent(UgcHud);
    this._ugcHud.setup({
      onBack: () => this._leaveUgcEditor(),
      onPlay: () => {
        const ed = this._ugcEditor;
        if (!ed || ed.brickCount <= 0) return;
        ed.persist();
        this._enterUgcPlay(ed.map.id);
      },
      onTool: (t) => {
        this._ugcEditor?.setTool(t);
        this._syncUgcHud();
      },
      onLayer: (n) => {
        this._ugcEditor?.setLayer(n);
        this._syncUgcHud();
      },
      onDepth: (n) => {
        this._ugcEditor?.setDepth(n);
        this._syncUgcHud();
      },
      onUndo: () => {
        this._ugcEditor?.undo();
        this._syncUgcHud();
      },
      onDel: () => {
        this._ugcEditor?.removeLayer();
        this._syncUgcHud();
      },
      onPreview: () => {
        this._ugcEditor?.setPreview(true);
        this._syncUgcHud();
      },
      onEdit: () => {
        this._ugcEditor?.setPreview(false);
        this._syncUgcHud();
      },
      onLoad: (text) => this._loadUgcText(text),
      onExport: () => {
        const ed = this._ugcEditor;
        if (!ed) return '';
        ed.persist();
        return encodeUgcText(ed.map);
      },
      onClear: () => {
        const id = this._ugcEditor?.map.id ?? this._ugcMapId;
        this._ugcEditor?.clearModel();
        void this._enterUgcEditor(id ?? undefined);
      },
      onExit: () => this._leaveUgcEditor(),
    });
    this._ugcHud.hide();

    const settingsN = await this._spawnSettings(canvasN);
    this._settings = settingsN.getComponent(SettingsPanel) ?? settingsN.addComponent(SettingsPanel);
    this._settings.setup({
      onClose: () => this._closeSettings(),
      onRestart: () => this._retryPlay(),
    });
    this._settings.hide();

    const hudN = new Node('PlayHud');
    canvasN.addChild(hudN);
    this._playHud = hudN.addComponent(PlayHud);
    this._playHud.setup({
      onHome: () => (this._ugcPlay ? this._returnToEditor() : this._showHome()),
      onNext: () => void this._enterNext(),
      onSettings: () => this._showSettings(),
      onRevealGm: () => this._gm?.revealEntry(),
      onItem: (id) => this._onPlayItem(id),
    });
    this._playHud.hide();

    const winN = await this._spawnVictory(canvasN);
    this._victory = winN.getComponent(VictoryPanel) ?? winN.addComponent(VictoryPanel);
    this._victory.setup({
      onNext: () => this._claimNext(),
      onDouble: () => this._claimDouble(),
    });
    this._victory.hide();

    const failN = await this._spawnFail(canvasN);
    this._fail = failN.getComponent(FailPanel) ?? failN.addComponent(FailPanel);
    this._fail.setup({
      onRetry: () => this._claimRetry(),
      onDouble: () => this._claimFailDouble(),
    });
    this._fail.hide();

    const chestN = new Node('ChestPanel');
    canvasN.addChild(chestN);
    this._chest = chestN.addComponent(ChestPanel);
    this._chest.setup({
      onWatch: () => void this._watchChest(),
      onClaim: (reward) => this._claimChest(reward),
    });
    this._chest.hide();

    const shopN = await this._spawnItemShop(canvasN);
    this._itemShop = shopN.getComponent(ItemShopPanel) ?? shopN.addComponent(ItemShopPanel);
    this._itemShop.setup({
      onBuy: (kind) => this._buyShop(kind),
      onWatch: (kind) => void this._watchShop(kind),
      onUse: (kind) => this._useShop(kind),
      onClose: () => this._closeItemShop(),
    });
    this._itemShop.hide();

    const goldN = new Node('GoldHud');
    canvasN.addChild(goldN);
    this._gold = goldN.addComponent(GoldHud);
    this._gold.setup({
      onPlus: () => this._showGoldShop(),
    });
    this._gold.setCoins(this._wallet.coins);
    this._setGoldVisible(false);
    this._wallet.watch((coins, animate) => {
      this._gold?.setCoins(coins, animate);
      if (!this._playHud?.node.active) return;
      this._playHud.setItems(this._battle?.itemState() ?? {
        coins,
        shuffle: this._wallet.itemCount('shuffle'),
        hook: this._wallet.itemCount('hook'),
        shovel: this._wallet.itemCount('shovel'),
        bomb: this._wallet.itemCount('bomb'),
        hookPick: false,
        shovelPick: false,
        bombPick: false,
        canShovel: false,
      });
    });

    const gmN = new Node('GmPanel');
    canvasN.addChild(gmN);
    this._gm = gmN.addComponent(GmPanel);
    this._gm.setup({
      onWin: () => this._gmWin(),
      onFail: () => this._gmLose(),
      onReset: () => this._gmReset(),
      onWipe: () => this._gmWipeLocal(),
      onSkip: (n) => this._gmSkip(n),
      onAddGold: (delta) => this._wallet.add(delta),
      onSetGold: (n) => this._wallet.setCoins(n),
    });
    this._gm.setLevel(this._level);

    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._playHud?.setLevel(this._level);
  }

  private async _spawnFail(canvasN: Node): Promise<Node> {
    try {
      const pf = await loadPrefab(PREFAB_UUID.FailPanel);
      const n = instantiate(pf);
      n.name = 'FailPanel';
      canvasN.addChild(n);
      return n;
    } catch (err) {
      console.warn('[Suck] FailPanel prefab missing, fallback node', err);
      const n = new Node('FailPanel');
      canvasN.addChild(n);
      return n;
    }
  }

  private async _spawnVictory(canvasN: Node): Promise<Node> {
    try {
      const pf = await loadPrefab(PREFAB_UUID.VictoryPanel);
      const n = instantiate(pf);
      n.name = 'VictoryPanel';
      canvasN.addChild(n);
      return n;
    } catch (err) {
      console.warn('[Suck] VictoryPanel prefab missing, fallback node', err);
      const n = new Node('VictoryPanel');
      canvasN.addChild(n);
      return n;
    }
  }

  private async _spawnSettings(canvasN: Node): Promise<Node> {
    try {
      const pf = await loadPrefab(PREFAB_UUID.SettingsPanel);
      const n = instantiate(pf);
      n.name = 'SettingsPanel';
      canvasN.addChild(n);
      return n;
    } catch (err) {
      console.warn('[Suck] SettingsPanel prefab missing, fallback node', err);
      const n = new Node('SettingsPanel');
      canvasN.addChild(n);
      return n;
    }
  }

  private async _spawnItemShop(canvasN: Node): Promise<Node> {
    try {
      const pf = await loadPrefab(PREFAB_UUID.ItemShopPanel);
      const n = instantiate(pf);
      n.name = 'ItemShopPanel';
      canvasN.addChild(n);
      return n;
    } catch (err) {
      console.warn('[Suck] ItemShopPanel prefab missing, fallback node', err);
      const n = new Node('ItemShopPanel');
      canvasN.addChild(n);
      return n;
    }
  }

  private async _spawnHome(canvasN: Node): Promise<Node> {
    try {
      const pf = await loadPrefab(PREFAB_UUID.HomePanel);
      const n = instantiate(pf);
      n.name = 'HomePanel';
      n.active = false;
      canvasN.addChild(n);
      return n;
    } catch (err) {
      console.warn('[Suck] HomePanel prefab missing, fallback node', err);
      const n = new Node('HomePanel');
      n.active = false;
      canvasN.addChild(n);
      return n;
    }
  }

  private _ensureAudio(): AudioService {
    if (this._audio) return this._audio;
    this._audio = new AudioService(this.node);
    setGameAudio(this._audio);
    return this._audio;
  }

  private _unlockAudio(): void {
    this._ensureAudio().startBgm();
  }

  private _restoreProgress(): void {
    this._level = loadLevelIndex();
    this._builtLevel = 0;
  }

  private _bindPlayerCloud(): void {
    initPlayerCloud({
      snapshot: () => ({
        level: this._level,
        coins: this._wallet.coins,
        items: this._wallet.items,
      }),
      apply: (save) => {
        this._level = save.level;
        saveLevelIndex(save.level);
        this._wallet.applyCloud(save.coins, save.items);
        this._home?.setLevel(this._level, LEVEL_COUNT);
        this._playHud?.setLevel(this._level);
        this._gm?.setLevel(this._level);
      },
    });
  }

  private _setGoldVisible(on: boolean): void {
    if (this._gold?.node) this._gold.node.active = on;
    this._gm?.layoutChrome();
  }

  /** Home covers the 3D field; keep the world hidden until play. Sky stays on the main camera. */
  private _setWorldLive(on: boolean): void {
    if (!on) {
      this._battle?.parkView();
      this._frameMainCamera();
      this._tuneLighting();
    }
    const world = this._ugcEditor?.node ?? this._battle?.node;
    if (world?.isValid) world.active = on;
    const cam = this._mainCam;
    if (!cam?.isValid) return;
    cam.enabled = this._homeDrawn;
    if (this._homeDrawn) {
      cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
      cam.clearColor = Theme.sky;
    }
  }

  private _showHome(): void {
    this._unlockAudio();
    this._disposeUgcEditor();
    this._clearUgcPlay();
    this._ugcHoldPlay = false;
    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._home?.show();
    this._ugcHud?.hide();
    this._settings?.hide();
    this._playHud?.hide();
    this._victory?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._setGoldVisible(false);
    this._gm?.setLevel(this._level);
    this._gm?.collapse();
    this._battle?.setPlaying(false);
    if (this._worldTouched) {
      this._worldTouched = false;
      this._invalidateWorldBoot();
      this._disposeNamed('PlayWorld');
      this._battle = null;
      this._worldKey = '';
      this._builtLevel = 0;
    }
    this._setWorldLive(false);
    this._prefetchPlayWorld();
  }

  private _showSettings(): void {
    this._unlockAudio();
    this._itemShop?.hide();
    this._settings?.show();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
  }

  private _closeSettings(): void {
    this._settings?.hide();
    if (this._chest?.node.active) return;
    if (this._itemShop?.node.active) return;
    if (this._playHud?.node.active) {
      this._battle?.setPlaying(true);
      return;
    }
    this._home?.show();
    this._setWorldLive(false);
  }

  private _enterPlay(): void {
    if (this._enteringPlay) return;
    void this._enterPlayAsync();
  }

  private async _enterPlayAsync(): Promise<void> {
    this._enteringPlay = true;
    try {
      this._settledBuilt = -1;
      this._unlockAudio();
      if (this._playWorldReady()) {
        this._revealPlay();
        return;
      }
      const fromHome = !this._ugcPlay && !!this._home?.node.active;
      if (fromHome) {
        await this._ensureWorld();
      } else {
        await this._runLevelLoad(async (set) => {
          set(0.16);
          await this._ensureWorld();
          set(0.94);
        });
      }
      if (!this.isValid || this._ugcEditor) return;
      if (this._ugcHoldPlay && !this._ugcPlay) return;
      if (!this._playWorldReady()) {
        await this._runLevelLoad(async (set) => {
          set(0.16);
          await this._ensureWorld();
          set(0.94);
        });
        if (!this.isValid || this._ugcEditor) return;
        if (this._ugcHoldPlay && !this._ugcPlay) return;
      }
      this._revealPlay();
    } finally {
      this._enteringPlay = false;
    }
  }

  private _revealPlay(): void {
    const level = this._ugcPlay && this._ugcLevel ? this._ugcLevel : getLevel(this._level);
    applyLevel(level);
    this._frameMainCamera();
    this._setWorldLive(true);
    this._bindBattle();
    this._battle?.reposeView();
    this._home?.hide();
    this._ugcHud?.hide();
    this._settings?.hide();
    this._victory?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._gm?.collapse();
    this._playHud?.setUgc(this._ugcPlay);
    this._gm?.setLevel(this._builtLevel);
    const gifted = this._ugcPlay ? [] : grantGuideItem(this._wallet, this._builtLevel);
    const landGen = ++this._guideLandGen;
    if (gifted.length) {
      this._playHud?.holdUnlock(gifted[0]);
      this._battle?.setItemsReady(false);
    } else {
      this._battle?.setItemsReady(true);
    }
    this._playHud?.setLevel(this._builtLevel);
    this._playHud?.show();
    this._setGoldVisible(!this._ugcPlay);
    this._playHud?.setItems(this._battle?.itemState() ?? this._playItemState());
    this._worldTouched = true;
    this._battle?.setPlaying(true);
    this._clearChest = null;
    this._grantLeftoverChest();
    if (gifted.length) {
      void this._flyChestItems(gifted).then(() => {
        if (!this.isValid || landGen !== this._guideLandGen) return;
        this._playHud?.releaseUnlock(gifted[0]);
        this.scheduleOnce(() => {
          if (!this.isValid || landGen !== this._guideLandGen) return;
          this._battle?.setItemsReady(true);
        }, 0.22);
      });
    }
  }

  private _retryPlay(): void {
    this._worldKey = '';
    this._builtLevel = 0;
    this._enterPlay();
  }

  private async _enterNext(): Promise<void> {
    this._clearGold = 0;
    if (this._ugcPlay) {
      this._returnToEditor();
      return;
    }
    resetPlayFx();
    this._worldKey = '';
    this._builtLevel = 0;
    this._disposeNamed('PlayWorld');
    this._battle = null;
    this._enterPlay();
  }

  private _clearUgcPlay(): void {
    this._ugcPlay = false;
    this._ugcMapId = null;
    this._ugcLevel = null;
  }

  private _disposeUgcEditor(): void {
    this._ugcEditor?.dispose();
    this._ugcEditor = null;
    this._disposeNamed('UgcWorld');
  }

  private _syncUgcHud(): void {
    const ed = this._ugcEditor;
    if (!ed) return;
    this._ugcHud?.setState({
      token: ed.token,
      tool: ed.tool,
      layer: ed.layer,
      depth: ed.depth,
      bricks: ed.brickCount,
      canUndo: ed.canUndo,
      undoCount: ed.undoCount,
      showAll: ed.showAll,
    });
  }

  private _loadUgcText(text: string): string | true {
    const parsed = parseUgcText(text);
    if (!parsed || parsed.bricks.length <= 0) return '配置无效，请检查粘贴内容';
    const id = this._ugcEditor?.map.id ?? parsed.id;
    saveUgcMap({ ...parsed, id });
    void this._enterUgcEditor(id);
    return true;
  }

  private _leaveUgcEditor(): void {
    this._ugcEditor?.persist();
    this._disposeUgcEditor();
    this._ugcHud?.hide();
    if (this._ugcHoldPlay && !this._ugcPlay) {
      this._ugcHoldPlay = false;
      this._enterPlay();
      return;
    }
    this._ugcHoldPlay = false;
    this._showHome();
  }

  private _returnToEditor(): void {
    const id = this._ugcMapId;
    this._ugcEditor?.persist();
    this._disposeUgcEditor();
    this._ugcHud?.hide();
    if (this._ugcPlay) {
      this._ugcPlay = false;
      this._ugcLevel = null;
      this._disposeNamed('PlayWorld');
      this._battle = null;
      this._worldKey = '';
    }
    void this._enterUgcEditor(id ?? undefined);
  }

  private async _enterUgcEditor(id?: string): Promise<void> {
    const map = id ? getUgcMap(id) : (listUgcMaps()[0] ?? newUgcMap());
    if (!map || !this.node.scene || !this._mainCam) return;
    this._invalidateWorldBoot();
    this._unlockAudio();
    try {
      await loadGameBundles();
      this._disposeNamed('PlayWorld');
      this._battle = null;
      this._worldKey = '';
      this._disposeUgcEditor();
      this._ugcEditor = await UgcEditor.open(this.node.scene, map, {
        camera: this._mainCam,
        overUi: (loc) => this._ugcHud?.hitsChrome(loc) ?? false,
        onDirty: () => this._syncUgcHud(),
      });
    } catch (err) {
      console.error('[Suck] ugc editor failed', err);
      this._disposeUgcEditor();
      this._leaveUgcEditor();
      return;
    }
    this._home?.hide();
    this._playHud?.hide();
    this._victory?.hide();
    this._fail?.hide();
    this._settings?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._setGoldVisible(false);
    this._ugcMapId = map.id;
    this._frameMainCamera();
    this._setWorldLive(true);
    this._ugcHud?.show();
    this._syncUgcHud();
  }

  private _enterUgcPlay(id: string): void {
    const map = getUgcMap(id);
    if (!map || map.bricks.length <= 0) return;
    this._invalidateWorldBoot();
    this._ugcEditor?.persist();
    this._disposeUgcEditor();
    this._ugcPlay = true;
    this._ugcMapId = id;
    this._ugcLevel = ugcToLevelDef(map);
    this._worldKey = '';
    this._builtLevel = 0;
    this._ugcHud?.hide();
    this._enterPlay();
  }
}
