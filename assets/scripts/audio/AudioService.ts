import { AudioClip, AudioSource, Node, resources } from 'cc';

const BGM_PATH = 'audio/bgm/bgm';
const ABSORB_PATH = 'audio/sfx/absorb';
const CLICK_PATH = 'audio/sfx/ui-click';
const BOOM_PATH = 'audio/sfx/boom';
const REMOVE_PATH = 'audio/sfx/remove';

const DEFAULT_BGM = 0.4;
/** TripleTown Merge.mp3 is quieter than most UI clips. */
const ABSORB_GAIN = 2.2;
/** TripleTown UIclick.mp3 — play at settings sound scale. */
const CLICK_GAIN = 1;
/** TripleTown Boom.mp3 — bomb / first-merge explosion. */
const BOOM_GAIN = 1.8;
/** TripleTown Remove.mp3 — shovel / piece leaves the board. */
const REMOVE_GAIN = 1.2;
/** Suck fires many bricks per second — keep a short gap so voices do not stack. */
const ABSORB_GAP_SEC = 0.09;

/**
 * Looping BGM (Unravel) + absorb / UI-click one-shots (TripleTown).
 * Never call play() again while BGM is already running — WeChat / WebAudio
 * will stack a second audible layer.
 */
export class AudioService {
  private _bgm: AudioSource;
  private _sfx: AudioSource;
  private _bgmClip: AudioClip | null = null;
  private _absorbClip: AudioClip | null = null;
  private _clickClip: AudioClip | null = null;
  private _boomClip: AudioClip | null = null;
  private _removeClip: AudioClip | null = null;
  private _bgmDesired = false;
  private _bgmRunning = false;
  private _absorbAt = -99;
  private _disposed = false;

  constructor(host: Node) {
    let bgmNode = host.getChildByName('Bgm');
    if (bgmNode?.isValid) bgmNode.destroy();
    bgmNode = new Node('Bgm');
    host.addChild(bgmNode);
    this._bgm = bgmNode.addComponent(AudioSource);
    this._bgm.playOnAwake = false;
    this._bgm.loop = true;
    this._bgm.volume = DEFAULT_BGM;

    const sfxNode = new Node('Sfx');
    host.addChild(sfxNode);
    this._sfx = sfxNode.addComponent(AudioSource);
    this._sfx.playOnAwake = false;
    this._sfx.volume = 1;

    this._preload();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._bgmDesired = false;
    this._stopBgmNow();
  }

  /** First user gesture should call this so web autoplay can unlock. */
  startBgm(): void {
    if (this._disposed) return;
    this._bgmDesired = true;
    if (this._bgmClip) {
      this._playBgm(this._bgmClip);
      return;
    }
    resources.load(BGM_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] BGM load failed:', err);
        return;
      }
      this._bgmClip = clip;
      if (this._bgmDesired) this._playBgm(clip);
    });
  }

  playAbsorb(): void {
    if (this._disposed) return;
    const now = Date.now() * 0.001;
    if (now - this._absorbAt < ABSORB_GAP_SEC) return;
    this._absorbAt = now;
    if (this._absorbClip) {
      this._oneShot(this._absorbClip, ABSORB_GAIN);
      return;
    }
    resources.load(ABSORB_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._sfx.node?.isValid) return;
      this._absorbClip = clip;
      this._oneShot(clip, ABSORB_GAIN);
    });
  }

  /** TripleTown Boom.mp3 — bomb explosion. */
  playBoom(): void {
    if (this._disposed) return;
    if (this._boomClip) {
      this._oneShot(this._boomClip, BOOM_GAIN);
      return;
    }
    resources.load(BOOM_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._sfx.node?.isValid) return;
      this._boomClip = clip;
      this._oneShot(clip, BOOM_GAIN);
    });
  }

  /** TripleTown Remove.mp3 — octopus vanishes after power runs out. */
  playRemove(): void {
    if (this._disposed) return;
    if (this._removeClip) {
      this._oneShot(this._removeClip, REMOVE_GAIN);
      return;
    }
    resources.load(REMOVE_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._sfx.node?.isValid) return;
      this._removeClip = clip;
      this._oneShot(clip, REMOVE_GAIN);
    });
  }

  playUiClick(): void {
    if (this._disposed) return;
    if (this._clickClip) {
      this._oneShot(this._clickClip, CLICK_GAIN);
      return;
    }
    resources.load(CLICK_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._sfx.node?.isValid) return;
      this._clickClip = clip;
      this._oneShot(clip, CLICK_GAIN);
    });
  }

  private _preload(): void {
    resources.load(BGM_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] BGM load failed:', err);
        return;
      }
      this._bgmClip = clip;
      if (this._bgmDesired) this._playBgm(clip);
    });
    resources.load(ABSORB_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] absorb SFX load failed:', err);
        return;
      }
      this._absorbClip = clip;
    });
    resources.load(CLICK_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] UI click SFX load failed:', err);
        return;
      }
      this._clickClip = clip;
    });
    resources.load(BOOM_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] boom SFX load failed:', err);
        return;
      }
      this._boomClip = clip;
    });
    resources.load(REMOVE_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] remove SFX load failed:', err);
        return;
      }
      this._removeClip = clip;
    });
  }

  private _playBgm(clip: AudioClip): void {
    if (this._disposed) return;
    if (this._bgmRunning) {
      this._bgm.loop = true;
      this._bgm.volume = DEFAULT_BGM;
      return;
    }
    this._bgm.clip = clip;
    this._bgm.loop = true;
    this._bgm.volume = DEFAULT_BGM;
    this._bgm.play();
    this._bgmRunning = true;
  }

  private _stopBgmNow(): void {
    this._bgmRunning = false;
    try {
      this._bgm.stop();
    } catch {
      /* ignore */
    }
  }

  private _oneShot(clip: AudioClip, gain: number): void {
    if (!this._sfx.node?.isValid) return;
    this._sfx.playOneShot(clip, gain);
  }
}

let _gameAudio: AudioService | null = null;

export function setGameAudio(audio: AudioService | null): void {
  if (_gameAudio && _gameAudio !== audio) _gameAudio.dispose();
  _gameAudio = audio;
}

export function gameAudio(): AudioService | null {
  return _gameAudio;
}
