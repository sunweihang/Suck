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
  UITransform,
  Vec3,
  Widget,
  view,
} from 'cc';
import { buildPlayWorld } from './battle/BuildPlayWorld';
import { BattleDirector } from './battle/BattleDirector';
import { GAME } from './game/GameConfig';
import {
  LETTERBOX_CLEAR,
  applyDesignResolution,
  applyPortraitCameraRect,
  portraitVisibleSize,
} from './game/PortraitFit';
import { Theme } from './game/Theme';
import { HomePanel } from './view/HomePanel';
import { PlayHud } from './view/PlayHud';
import { SettingsPanel } from './view/SettingsPanel';

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
  private _battle: BattleDirector | null = null;

  onLoad(): void {
    this._stripLeftovers();
    try {
      applyDesignResolution();
      this._tuneMainCamera();
      this._tuneLighting();
      this._ensureLetterboxCam();
      this._buildUi();
      this._applyPortraitFrame();
      view.on('canvas-resize', this._applyPortraitFrame, this);
    } catch (err) {
      console.error('[Suck] boot ui failed', err);
    }
  }

  start(): void {
    void this._bootWorld();
  }

  onDestroy(): void {
    view.off('canvas-resize', this._applyPortraitFrame, this);
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

  private async _bootWorld(): Promise<void> {
    try {
      if (!this.node.scene) return;
      this._disposeNamed('PlayWorld');
      const world = await buildPlayWorld(this.node.scene);
      this._battle = world.battle;
      if (this._mainCam && this._canvas) {
        this._battle.bind({
          camera: this._mainCam,
          canvas: this._canvas,
          powerRoot: this._playHud?.powerRoot ?? null,
          winLabel: this._playHud?.winLabel ?? null,
        });
      }
      this._showHome();
    } catch (err) {
      console.error('[Suck] boot world failed', err);
    }
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
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
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
      shadows.shadowColor = new Color(18, 28, 40, 220);
    }
    const ambient = scene.globals?.ambient;
    if (ambient) {
      ambient.skyIllum = 16000;
    }
    const lightNode = scene.getChildByName('Directional Light');
    const light = lightNode?.getComponent(DirectionalLight);
    if (!light || !lightNode) return;
    lightNode.setPosition(8, 16, 10);
    lightNode.setRotationFromEuler(-52, 40, 0);
    light.color = new Color(255, 232, 200, 255);
    light.illuminance = 240000;
    light.shadowEnabled = true;
    light.shadowPcf = 1;
    light.shadowBias = 0.0008;
    light.shadowNormalBias = 0.2;
    light.shadowSaturation = 0.72;
    light.shadowDistance = 20;
    light.shadowFixedArea = true;
    light.shadowNear = 0.5;
    light.shadowFar = 28;
    light.shadowOrthoSize = 7;
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
    this._home?.layoutChrome();
    this._settings?.layoutChrome();
    this._playHud?.layoutChrome();
  };

  private _buildUi(): void {
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

    const homeN = new Node('HomePanel');
    canvasN.addChild(homeN);
    this._home = homeN.addComponent(HomePanel);
    this._home.setup({
      onPlay: () => this._enterPlay(),
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
    this._playHud.setup({ onHome: () => this._showHome() });
    this._playHud.hide();
  }

  private _showHome(): void {
    this._home?.show();
    this._settings?.hide();
    this._playHud?.hide();
    this._battle?.setPlaying(false);
  }

  private _showSettings(): void {
    this._home?.hide();
    this._settings?.show();
    this._playHud?.hide();
    this._battle?.setPlaying(false);
  }

  private _enterPlay(): void {
    this._home?.hide();
    this._settings?.hide();
    this._playHud?.show();
    this._battle?.setPlaying(true);
  }
}
