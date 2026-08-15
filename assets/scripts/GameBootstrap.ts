import {
  _decorator,
  Camera,
  Canvas,
  Color,
  Component,
  DirectionalLight,
  Graphics,
  Layers,
  Node,
  Prefab,
  UITransform,
  Vec3,
  Widget,
  assetManager,
  instantiate,
  view,
} from 'cc';
import { AudioService, setGameAudio } from './audio/AudioService';
import { buildPlayWorld } from './battle/BuildPlayWorld';
import { BattleDirector } from './battle/BattleDirector';
import { GAME } from './game/GameConfig';
import { getLevel, LEVEL_COUNT, saveLevelIndex } from './game/LevelCatalog';
import {
  LETTERBOX_CLEAR,
  applyDesignResolution,
  applyPortraitCameraRect,
  portraitVisibleSize,
} from './game/PortraitFit';
import { Theme } from './game/Theme';
import { FailPanel } from './view/FailPanel';
import { GmPanel } from './view/GmPanel';
import { HomePanel } from './view/HomePanel';
import { PlayHud } from './view/PlayHud';
import { SettingsPanel } from './view/SettingsPanel';
import { VictoryPanel } from './view/VictoryPanel';
import { PREFAB_UUID } from './battle/PrefabCatalog';
import { layoutWorldBg, spawnToyBackdrop } from './battle/ToyBackdrop';
import { preloadUiArt } from './view/UiArt';

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
  private _battle: BattleDirector | null = null;
  private _audio: AudioService | null = null;
  private _level = 1;
  private _builtLevel = 0;
  private _bootJob: Promise<void> | null = null;
  private _uiJob: Promise<void> | null = null;

  onLoad(): void {
    this._resetToFirst();
    this._stripLeftovers();
    this._uiJob = this._bootUi();
  }

  private async _bootUi(): Promise<void> {
    try {
      applyDesignResolution();
      this._tuneMainCamera();
      this._tuneLighting();
      this._ensureLetterboxCam();
      await this._buildUi();
      this._ensureAudio();
      this._applyPortraitFrame();
      view.on('canvas-resize', this._applyPortraitFrame, this);
      await preloadUiArt();
      if (this.node.scene) await spawnToyBackdrop(this.node.scene);
      this._home?.applyArt();
      this._playHud?.applyArt();
      this._applyPortraitFrame();
      this._bindBattle();
    } catch (err) {
      console.error('[Suck] boot ui failed', err);
    }
  }

  start(): void {
    void this._bootWorld();
  }

  onDestroy(): void {
    view.off('canvas-resize', this._applyPortraitFrame, this);
    setGameAudio(null);
    this._audio = null;
  }

  private _stripLeftovers(): void {
    const scene = this.node.scene;
    if (!scene) return;
    for (const child of [...scene.children]) {
      if (LEFTOVER_NAMES.has(child.name)) child.destroy();
    }
  }

  private _disposeNamed(name: string): void {
    const scene = this.node.scene;
    if (!scene) return;
    const n = scene.getChildByName(name);
    if (!n) return;
    n.name = `${name}_disposed`;
    n.removeFromParent();
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
    });
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
    this._playHud?.showCleared(cleared, this._level > cleared);
    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._home?.hide();
    this._settings?.hide();
    this._fail?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
    this._victory?.show({
      hasNext: this._level > cleared,
    });
  }

  private _onLevelFailed(): void {
    this._home?.hide();
    this._settings?.hide();
    this._victory?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
    this._fail?.show();
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
    cam.enabled = true;
  }

  private _tuneLighting(): void {
    const scene = this.node.scene;
    if (!scene) return;
    const shadows = scene.globals?.shadows;
    if (shadows) {
      shadows.enabled = true;
      shadows.type = 1;
      shadows.shadowMapSize = 1024;
      shadows.shadowColor = new Color(32, 48, 68, 200);
    }
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
      light.shadowEnabled = true;
      light.shadowPcf = 2;
      light.shadowBias = 0.0006;
      light.shadowNormalBias = 0.16;
      light.shadowSaturation = 0.64;
      light.shadowDistance = 20;
      light.shadowFixedArea = true;
      light.shadowNear = 0.5;
      light.shadowFar = 28;
      light.shadowOrthoSize = 7;
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
      this._letterboxCam.enabled = true;
    }
    layoutWorldBg(this.node.scene);
    this._home?.layoutChrome();
    this._settings?.layoutChrome();
    this._playHud?.layoutChrome();
    this._victory?.layoutChrome();
    this._fail?.layoutChrome();
    this._gm?.layoutChrome();
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

    const settingsN = new Node('SettingsPanel');
    canvasN.addChild(settingsN);
    this._settings = settingsN.addComponent(SettingsPanel);
    this._settings.setup({ onClose: () => this._showHome() });
    this._settings.hide();

    const hudN = new Node('PlayHud');
    canvasN.addChild(hudN);
    this._playHud = hudN.addComponent(PlayHud);
    this._playHud.setup({
      onHome: () => this._showHome(),
      onNext: () => void this._enterNext(),
    });
    this._playHud.hide();

    const winN = await this._spawnVictory(canvasN);
    this._victory = winN.getComponent(VictoryPanel) ?? winN.addComponent(VictoryPanel);
    this._victory.setup({
      onNext: () => void this._enterNext(),
    });
    this._victory.hide();

    const failN = await this._spawnFail(canvasN);
    this._fail = failN.getComponent(FailPanel) ?? failN.addComponent(FailPanel);
    this._fail.setup({
      onRetry: () => this._retryPlay(),
    });
    this._fail.hide();

    const gmN = new Node('GmPanel');
    canvasN.addChild(gmN);
    this._gm = gmN.addComponent(GmPanel);
    this._gm.setup({
      onWin: () => this._gmWin(),
      onFail: () => this._gmLose(),
    });

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

  private _resetToFirst(): void {
    this._level = 1;
    this._builtLevel = 0;
    saveLevelIndex(1);
  }

  private _showHome(): void {
    this._unlockAudio();
    this._resetToFirst();
    this._home?.setLevel(this._level, LEVEL_COUNT);
    this._home?.show();
    this._settings?.hide();
    this._playHud?.hide();
    this._victory?.hide();
    this._fail?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
  }

  private _showSettings(): void {
    this._unlockAudio();
    this._home?.hide();
    this._settings?.show();
    this._playHud?.hide();
    this._victory?.hide();
    this._fail?.hide();
    this._gm?.collapse();
    this._battle?.setPlaying(false);
  }

  private _enterPlay(): void {
    this._unlockAudio();
    void this._ensureWorld().then(() => {
      this._bindBattle();
      this._home?.hide();
      this._settings?.hide();
      this._victory?.hide();
      this._fail?.hide();
      this._gm?.collapse();
      this._playHud?.setLevel(this._builtLevel);
      this._playHud?.show();
      this._battle?.setPlaying(true);
    });
  }

  private _restartPlay(): void {
    this._resetToFirst();
    this._enterPlay();
  }

  private _retryPlay(): void {
    this._builtLevel = 0;
    this._enterPlay();
  }

  private async _enterNext(): Promise<void> {
    await this._ensureWorld();
    this._enterPlay();
  }
}
