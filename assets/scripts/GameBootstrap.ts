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
import { GAME } from './game/GameConfig';
import { ensureLevels, getLevel, itemUnlocked, LEVEL_COUNT, loadLevelIndex, saveLevelIndex, type ItemId } from './game/LevelCatalog';
import {
  LETTERBOX_CLEAR,
  applyDesignResolution,
  applyPortraitCameraRect,
  portraitVisibleSize,
} from './game/PortraitFit';
import { Theme } from './game/Theme';
import { rollChestReward, type ChestReward } from './game/ChestLoot';
import { GOLD, itemGoldCost, PlayerWallet, slotGoldCost } from './game/PlayerWallet';
import { ChestActor } from './battle/ChestActor';
import { SlotPad } from './battle/SlotPad';
import { ChestPanel } from './view/ChestPanel';
import { ItemShopPanel, type ShopKind } from './view/ItemShopPanel';
import { FailPanel } from './view/FailPanel';
import { GmPanel } from './view/GmPanel';
import { GoldHud } from './view/GoldHud';
import { HomePanel } from './view/HomePanel';
import { PlayHud } from './view/PlayHud';
import { SettingsPanel } from './view/SettingsPanel';
import { VictoryPanel } from './view/VictoryPanel';
import { PREFAB_UUID } from './battle/PrefabCatalog';
import { layoutWorldBg, spawnToyBackdrop } from './battle/ToyBackdrop';
import { ensureCoinFxRoot, playCoinFlyBurst, worldToFxLocal } from './view/CoinFlyFx';
import { playItemGrantFly } from './view/ItemFlyFx';
import { artFrame, ensureHomeLevelArt, preloadUiArt } from './view/UiArt';
import { loadGameBundles } from './boot/LoadBundles';

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

const { ccclass } = _decorator;

const LEFTOVER_NAMES = new Set(['SmokeCube', 'HintHand', 'Cube']);

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
  /** Host splash stays until HomePanel has painted once. */
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

  /** Keep company splash pixels: no camera may SOLID_COLOR-wipe before HomePanel. */
  private _holdHostSplash(): void {
    applyDesignResolution();
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
    if (this._letterboxCam?.isValid) {
      this._letterboxCam.clearColor = LETTERBOX_CLEAR;
      this._letterboxCam.enabled = true;
    }
    notifyHostSplashHomeReady();
    initRewardedAd();
  }

  private async _bootUi(): Promise<void> {
    try {
      await loadGameBundles();
      applyDesignResolution();
      this._tuneMainCamera();
      this._tuneLighting();
      this._ensureLetterboxCam();
      await ensureLevels();
      this._restoreProgress();
      this._wallet.load();
      await this._buildUi();
      this._ensureAudio();
      this._applyPortraitFrame();
      view.on('canvas-resize', this._applyPortraitFrame, this);
      director.once(Director.EVENT_AFTER_DRAW, () => {
        if (!this.isValid) return;
        this._revealHomeAndLiftSplash();
      });
      await preloadUiArt();
      await ensureHomeLevelArt();
      if (this.node.scene) await spawnToyBackdrop(this.node.scene);
      this._home?.applyArt();
      this._playHud?.applyArt();
      this._gold?.applyArt();
      this._settings?.applyArt();
      this._chest?.applyArt();
      this._itemShop?.applyArt();
      this._applyPortraitFrame();
      this._bindBattle();
    } catch (err) {
      console.error('[Suck] boot ui failed', err);
      this._revealHomeAndLiftSplash();
    }
  }

  start(): void {
    void this._bootWorld();
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    view.off('canvas-resize', this._applyPortraitFrame, this);
    destroyGameClubButton();
    setGameAudio(null);
    this._audio = null;
  }

  private _onKeyDown(e: EventKeyboard): void {
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

  private _bootWorld(): Promise<void> {
    if (this._bootJob) return this._bootJob;
    this._bootJob = this._bootWorldInner().finally(() => {
      this._bootJob = null;
    });
    return this._bootJob;
  }

  private async _bootWorldInner(): Promise<void> {
    try {
      if (!this._canvas && this._uiJob) await this._uiJob;
      if (!this.node.scene) return;
      this._disposeNamed('PlayWorld');
      const world = await buildPlayWorld(this.node.scene, getLevel(this._level));
      this._battle = world.battle;
      this._builtLevel = this._level;
      this._bindBattle();
      this._home?.setLevel(this._level, LEVEL_COUNT);
      this._playHud?.setLevel(this._level);
      if (this._home?.node.active) this._setWorldLive(false);
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
      onGoldDenied: () => this._gold?.deny(),
      onChest: (chest) => this._onChestReady(chest),
      onUnlockSlot: (slot) => this._showSlotShop(slot),
      wallet: this._wallet,
    });
    this._playHud?.setItems(this._battle.itemState());
    this._gold?.setCoins(this._wallet.coins);
  }

  private async _ensureWorld(): Promise<void> {
    if (this._bootJob) await this._bootJob;
    if (this._builtLevel === this._level && this._battle?.isValid) return;
    await this._bootWorld();
  }

  private _onLevelCleared(): void {
    const cleared = this._level;
    if (this._level < LEVEL_COUNT) this._level += 1;
    saveLevelIndex(this._level);
    this._clearGold = GOLD.win;
    this._playHud?.showCleared(cleared, this._level > cleared);
    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._home?.hide();
    this._settings?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
    this._setGoldVisible(true);
    this._victory?.show({
      hasNext: this._level > cleared,
      gold: GOLD.win,
      canDouble: true,
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

  private _claimSettle(kind: 'win' | 'fail'): void {
    if (this._doubleBusy) return;
    const fallback = kind === 'fail' ? GOLD.fail : GOLD.win;
    const amount = this._clearGold > 0 ? this._clearGold : fallback;
    this._clearGold = 0;
    void this._flyGoldThen(amount, kind);
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
    this._lockSettle(kind);
    const result = await showRewardedVideoAd();
    const fallback = kind === 'fail' ? GOLD.fail : GOLD.win;
    const base = this._clearGold > 0 ? this._clearGold : fallback;
    const amount = result === 'rewarded' ? base * 2 : base;
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
    this._lockSettle(kind);
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
        onCredit: (n) => this._wallet.add(n),
        onDone: () => resolve(),
      });
    });
    after();
  }

  private _onLevelFailed(): void {
    this._clearGold = GOLD.fail;
    this._home?.hide();
    this._settings?.hide();
    this._victory?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
    this._setGoldVisible(true);
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
    this._flyGrantedItems(reward.items);
  }

  private _onPlayItem(id: ItemId): void {
    if (!itemUnlocked(id, this._builtLevel || this._level)) return;
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

  private _showItemShop(kind: ShopKind): void {
    this._unlockAudio();
    this._itemShopBusy = false;
    this._itemShop?.show(kind);
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
    if (this._playHud?.node.active) this._battle?.setPlaying(true);
  }

  private _buyShop(kind: ShopKind): void {
    if (kind === 'slot') this._buySlot();
    else this._buyItem(kind);
  }

  private _watchShop(kind: ShopKind): Promise<void> {
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

  private _playItemState() {
    return this._battle?.itemState() ?? {
      coins: this._wallet.coins,
      shuffle: this._wallet.itemCount('shuffle'),
      merge: this._wallet.itemCount('merge'),
      hook: this._wallet.itemCount('hook'),
      shovel: this._wallet.itemCount('shovel'),
      hookPick: false,
      shovelPick: false,
    };
  }

  private _flyGrantedItems(ids: readonly ItemId[]): void {
    const canvas = this._canvas;
    this._playHud?.show();
    this._playHud?.setItems(this._playItemState());
    this._playHud?.layoutChrome();
    if (!canvas?.isValid || ids.length <= 0) return;
    playItemGrantFly({
      canvas,
      ids,
      slotWorldPos: (id, out) => this._playHud?.itemIconWorldPos(id, out) ?? false,
      onLand: (id) => this._playHud?.pulseItem(id),
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
    this._builtLevel = 0;
    this._victory?.hide();
    this._fail?.hide();
    this._chest?.hide();
    this._itemShop?.hide();
    this._enterPlay();
  }

  private _tuneMainCamera(): void {
    const camNode = this.node.scene?.getChildByName('Main Camera');
    const cam = camNode?.getComponent(Camera);
    if (!cam || !camNode) return;
    this._mainCam = cam;
    const pitch = (GAME.worldCamPitchDeg * Math.PI) / 180;
    const yaw = (GAME.worldCamYawDeg * Math.PI) / 180;
    const dist = GAME.worldCamDist;
    const look = new Vec3(GAME.worldCamLookAtX, GAME.worldCamLookAtY, GAME.worldCamLookAtZ);
    camNode.setPosition(
      look.x + dist * Math.sin(yaw) * Math.cos(pitch),
      look.y + dist * Math.sin(pitch),
      look.z + dist * Math.cos(yaw) * Math.cos(pitch),
    );
    camNode.lookAt(look);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fov = GAME.worldCamFovDeg;
    cam.near = GAME.worldCamNear;
    cam.far = GAME.worldCamFar;
    cam.clearColor = Theme.sky;
    cam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    cam.priority = 1;
    cam.visibility = Layers.Enum.DEFAULT | Layers.Enum.UI_3D;
    applyPortraitCameraRect(cam);
    cam.enabled = false;
  }

  private _tuneLighting(): void {
    const scene = this.node.scene;
    if (!scene) return;
    const shadows = scene.globals?.shadows;
    if (shadows) shadows.enabled = false;
    const ambient = scene.globals?.ambient;
    if (ambient) {
      ambient.skyIllum = 42000;
      ambient.skyColor = new Color(255, 248, 240, 255);
      ambient.groundAlbedo = new Color(210, 196, 230, 255);
    }
    const lightNode = scene.getChildByName('Directional Light');
    const light = lightNode?.getComponent(DirectionalLight);
    if (light && lightNode) {
      lightNode.setPosition(6, 14, -8);
      lightNode.setRotationFromEuler(-32, 22, 0);
      light.color = new Color(255, 244, 228, 255);
      light.illuminance = 210000;
      light.shadowEnabled = false;
    }
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
    cam.enabled = this._homeDrawn;
    this._letterboxCam = cam;
  }

  private _applyPortraitFrame = (): void => {
    applyDesignResolution();
    const vis = portraitVisibleSize();
    this._canvas?.getComponent(UITransform)?.setContentSize(vis.width, vis.height);
    if (this._uiCam?.isValid) {
      this._uiCam.orthoHeight = vis.height * 0.5;
      this._uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
      applyPortraitCameraRect(this._uiCam);
    }
    if (this._mainCam?.isValid) applyPortraitCameraRect(this._mainCam);
    if (this._letterboxCam?.isValid) {
      this._letterboxCam.clearColor = LETTERBOX_CLEAR;
      this._letterboxCam.rect.set(0, 0, 1, 1);
      this._letterboxCam.enabled = this._homeDrawn;
    }
    layoutWorldBg(this.node.scene);
    this._home?.layoutChrome();
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

  private async _buildUi(): Promise<void> {
    const scene = this.node.scene!;
    this._disposeNamed('Canvas');
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
      onPlay: () => this._restartPlay(),
      onSettings: () => this._showSettings(),
    });

    const settingsN = await this._spawnSettings(canvasN);
    this._settings = settingsN.getComponent(SettingsPanel) ?? settingsN.addComponent(SettingsPanel);
    this._settings.setup({ onClose: () => this._closeSettings() });
    this._settings.hide();

    const hudN = new Node('PlayHud');
    canvasN.addChild(hudN);
    this._playHud = hudN.addComponent(PlayHud);
    this._playHud.setup({
      onHome: () => this._showHome(),
      onNext: () => void this._enterNext(),
      onSettings: () => this._showSettings(),
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
      onClose: () => this._closeItemShop(),
    });
    this._itemShop.hide();

    const goldN = new Node('GoldHud');
    canvasN.addChild(goldN);
    this._gold = goldN.addComponent(GoldHud);
    this._gold.setup();
    this._gold.setCoins(this._wallet.coins);
    this._setGoldVisible(false);
    this._wallet.watch((coins, animate) => {
      this._gold?.setCoins(coins, animate);
      this._playHud?.setItems(this._battle?.itemState() ?? {
        coins,
        shuffle: this._wallet.itemCount('shuffle'),
        merge: this._wallet.itemCount('merge'),
        hook: this._wallet.itemCount('hook'),
        shovel: this._wallet.itemCount('shovel'),
        hookPick: false,
        shovelPick: false,
      });
    });

    const gmN = new Node('GmPanel');
    canvasN.addChild(gmN);
    this._gm = gmN.addComponent(GmPanel);
    this._gm.setup({
      onWin: () => this._gmWin(),
      onFail: () => this._gmLose(),
      onReset: () => this._gmReset(),
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
      canvasN.addChild(n);
      return n;
    } catch (err) {
      console.warn('[Suck] HomePanel prefab missing, fallback node', err);
      const n = new Node('HomePanel');
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

  private _setGoldVisible(on: boolean): void {
    if (this._gold?.node) this._gold.node.active = on;
    this._gm?.layoutChrome();
  }

  /** Home covers the 3D field; keep the world and shadow pass off until play. */
  private _setWorldLive(on: boolean): void {
    const world = this._battle?.node;
    if (world?.isValid) world.active = on;
    if (this._mainCam?.isValid) this._mainCam.enabled = on;
    const shadows = this.node.scene?.globals?.shadows;
    if (shadows) shadows.enabled = false;
  }

  private _showHome(): void {
    this._unlockAudio();
    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._home?.show();
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
    this._setWorldLive(false);
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
    this._unlockAudio();
    void this._ensureWorld().then(() => {
      this._setWorldLive(true);
      this._bindBattle();
      this._home?.hide();
      this._settings?.hide();
      this._victory?.hide();
      this._fail?.hide();
      this._chest?.hide();
      this._itemShop?.hide();
      this._gm?.collapse();
      this._playHud?.setLevel(this._builtLevel);
      this._gm?.setLevel(this._builtLevel);
      this._playHud?.show();
      this._setGoldVisible(true);
      this._battle?.setPlaying(true);
    });
  }

  private _restartPlay(): void {
    this._builtLevel = 0;
    this._enterPlay();
  }

  private _retryPlay(): void {
    this._builtLevel = 0;
    this._enterPlay();
  }

  private async _enterNext(): Promise<void> {
    this._clearGold = 0;
    await this._ensureWorld();
    this._enterPlay();
  }
}
