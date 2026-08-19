import { AudioClip, AudioSource, Director, Node, director, game, resources, sys } from 'cc';

const BGM_PATH = 'audio/bgm/bgm';
const ABSORB_PATH = 'audio/sfx/absorb';
const CLICK_PATH = 'audio/sfx/ui-click';
const BOOM_PATH = 'audio/sfx/boom';
const REMOVE_PATH = 'audio/sfx/remove';
const GOLD_PATH = 'audio/sfx/gold';
const GET_NEW_PATH = 'audio/sfx/get-new';
const WIN_PATH = 'audio/sfx/win';
const STORAGE_KEY = 'suck.audio.v1';

const DEFAULT_BGM = 0.4;
const DEFAULT_SFX = 0.85;
/** TripleTown Merge.mp3 is quieter than most UI clips. */
const ABSORB_GAIN = 2.2;
/** TripleTown UIclick.mp3 — play at settings sound scale. */
const CLICK_GAIN = 1;
/** TripleTown Boom.mp3 — bomb / first-merge explosion. */
const BOOM_GAIN = 1.8;
/** TripleTown Remove.mp3 — shovel / piece leaves the board. */
const REMOVE_GAIN = 1.2;
/** TripleTown Gold.mp3 — coin fly landing. */
const GOLD_GAIN = 1;
/** Shoot a Cube Puzzle! SFX_Booster_Received — item / skill obtained. */
const GET_NEW_GAIN = 1;
/** Shoot a Cube Puzzle! Win_3 — victory panel stinger. */
const WIN_GAIN = 1;
/**
 * absorb.mp3: ~25ms lead-in, audible to ~110ms, silence after ~120ms.
 * Pulse after the audible body; only cut once the tail is already quiet.
 */
const ABSORB_PULSE_SEC = 0.112;
const ABSORB_SAFE_CUT_SEC = 0.12;
const ABSORB_QUEUE_CAP = 8;

/**
 * Looping BGM (Unravel) + absorb / UI-click one-shots (TripleTown).
 * Never call play() again while BGM is already running — WeChat / WebAudio
 * will stack a second audible layer.
 */
export class AudioService {
  private _bgm: AudioSource;
  private _sfx: AudioSource;
  private _absorbSfx: AudioSource;
  private _absorbQueued = 0;
  private _absorbWait = 0;
  private _absorbTicking = false;
  private _bgmClip: AudioClip | null = null;
  private _absorbClip: AudioClip | null = null;
  private _clickClip: AudioClip | null = null;
  private _boomClip: AudioClip | null = null;
  private _removeClip: AudioClip | null = null;
  private _goldClip: AudioClip | null = null;
  private _getNewClip: AudioClip | null = null;
  private _winClip: AudioClip | null = null;
  private _bgmGain = DEFAULT_BGM;
  private _sfxGain = DEFAULT_SFX;
  private _bgmDesired = false;
  private _bgmRunning = false;
  private _bgmHeldForAd = false;
  private _absorbAt = -99;
  private _disposed = false;

  constructor(host: Node) {
    const saved = AudioService._loadStored();
    this._bgmGain = saved.bgm;
    this._sfxGain = saved.sfx;

    let bgmNode = host.getChildByName('Bgm');
    if (bgmNode?.isValid) bgmNode.destroy();
    bgmNode = new Node('Bgm');
    host.addChild(bgmNode);
    this._bgm = bgmNode.addComponent(AudioSource);
    this._bgm.playOnAwake = false;
    this._bgm.loop = true;
    this._bgm.volume = this._bgmGain;

    const sfxNode = new Node('Sfx');
    host.addChild(sfxNode);
    this._sfx = sfxNode.addComponent(AudioSource);
    this._sfx.playOnAwake = false;
    this._sfx.volume = 1;

    const absorbNode = new Node('AbsorbSfx');
    host.addChild(absorbNode);
    this._absorbSfx = absorbNode.addComponent(AudioSource);
    this._absorbSfx.playOnAwake = false;
    this._absorbSfx.loop = false;
    this._absorbSfx.volume = 1;

    this._preload();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._bgmDesired = false;
    this._stopBgmNow();
    this._absorbQueued = 0;
    this._clearAbsorbPulse();
    try {
      this._absorbSfx.stop();
    } catch {
      /* ignore */
    }
  }

  getBgmVolume(): number {
    return this._bgmGain;
  }

  getSfxVolume(): number {
    return this._sfxGain;
  }

  setBgmVolume(v: number): void {
    this._bgmGain = AudioService._clamp01(v);
    this._bgm.volume = this._bgmGain;
    this._persist();
  }

  setSfxVolume(v: number): void {
    this._sfxGain = AudioService._clamp01(v);
    this._persist();
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
    this._absorbQueued = Math.min(ABSORB_QUEUE_CAP, this._absorbQueued + 1);
    this._pulseAbsorb();
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

  /** Shoot a Cube Puzzle! SFX_Booster_Received — item icon pops and flies to the dock. */
  playGetNew(): void {
    if (this._disposed) return;
    if (this._getNewClip) {
      this._oneShot(this._getNewClip, GET_NEW_GAIN);
      return;
    }
    resources.load(GET_NEW_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._sfx.node?.isValid) return;
      this._getNewClip = clip;
      this._oneShot(clip, GET_NEW_GAIN);
    });
  }

  /** Shoot a Cube Puzzle! Win_3 — victory panel opens. */
  playWin(): void {
    if (this._disposed) return;
    if (this._winClip) {
      this._oneShot(this._winClip, WIN_GAIN);
      return;
    }
    resources.load(WIN_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._sfx.node?.isValid) return;
      this._winClip = clip;
      this._oneShot(clip, WIN_GAIN);
    });
  }

  /** Decode + mix the win stinger at zero gain so first real play is free. */
  warmWin(): void {
    if (this._disposed || !this._winClip || !this._sfx.node?.isValid) return;
    this._sfx.playOneShot(this._winClip, 0);
  }

  /** Wait until Win_3 is in memory, then silently decode it. */
  ensureWin(): Promise<void> {
    if (this._disposed) return Promise.resolve();
    if (this._winClip) {
      this.warmWin();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      resources.load(WIN_PATH, AudioClip, (err, clip) => {
        if (!this._disposed && !err && clip) this._winClip = clip;
        this.warmWin();
        resolve();
      });
    });
  }

  /** TripleTown Gold.mp3 — coin flyer lands on the HUD. */
  playGold(): void {
    if (this._disposed) return;
    if (this._goldClip) {
      this._oneShot(this._goldClip, GOLD_GAIN);
      return;
    }
    resources.load(GOLD_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._sfx.node?.isValid) return;
      this._goldClip = clip;
      this._oneShot(clip, GOLD_GAIN);
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

  /** Stop BGM while rewarded video owns the audio session. */
  pauseForAd(): void {
    if (this._disposed) return;
    this._bgmHeldForAd = true;
    this._pauseBgmKeepCursor();
  }

  /** Restart BGM after ad close / fail. */
  resumeAfterAd(): void {
    if (this._disposed) return;
    this._bgmHeldForAd = false;
    this._resumeBgmIfIdle();
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
    resources.load(GOLD_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] gold SFX load failed:', err);
        return;
      }
      this._goldClip = clip;
    });
    resources.load(GET_NEW_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] get-new SFX load failed:', err);
        return;
      }
      this._getNewClip = clip;
    });
    resources.load(WIN_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip) {
        if (err || !clip) console.warn('[Audio] win SFX load failed:', err);
        return;
      }
      this._winClip = clip;
    });
  }

  private _pauseBgmKeepCursor(): void {
    try {
      this._bgm.pause();
    } catch {
      this._stopBgmNow();
    }
  }

  private _resumeBgmIfIdle(): void {
    if (this._disposed || !this._bgmDesired || this._bgmHeldForAd) return;
    if (this._bgmClip) {
      try {
        this._bgm.play();
        this._bgmRunning = true;
        return;
      } catch {
        this._bgmRunning = false;
        this._playBgm(this._bgmClip);
        return;
      }
    }
    this.startBgm();
  }

  private _playBgm(clip: AudioClip): void {
    if (this._disposed) return;
    if (this._bgmRunning) {
      this._bgm.loop = true;
      this._bgm.volume = this._bgmGain;
      return;
    }
    this._bgm.clip = clip;
    this._bgm.loop = true;
    this._bgm.volume = this._bgmGain;
    if (this._bgmHeldForAd) return;
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

  private _pulseAbsorb(): void {
    if (this._disposed || this._absorbQueued <= 0) return;
    const now = Date.now() * 0.001;
    const src = this._absorbSfx;
    if (src.playing && now - this._absorbAt < ABSORB_SAFE_CUT_SEC) {
      this._scheduleAbsorbPulse(this._absorbAt + ABSORB_SAFE_CUT_SEC - now);
      return;
    }
    const wait = this._absorbAt + ABSORB_PULSE_SEC - now;
    if (wait > 0.001) {
      this._scheduleAbsorbPulse(wait);
      return;
    }
    this._absorbQueued = 0;
    this._absorbAt = now;
    this._clearAbsorbPulse();
    if (this._absorbClip) {
      this._playAbsorbHit(this._absorbClip);
      return;
    }
    resources.load(ABSORB_PATH, AudioClip, (err, clip) => {
      if (this._disposed || err || !clip || !this._absorbSfx.node?.isValid) return;
      this._absorbClip = clip;
      this._playAbsorbHit(clip);
    });
  }

  private _playAbsorbHit(clip: AudioClip): void {
    const src = this._absorbSfx;
    if (!src.node?.isValid) return;
    if (src.playing) {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    }
    src.clip = clip;
    src.volume = Math.min(1, this._sfxGain * ABSORB_GAIN);
    src.play();
  }

  private _onAbsorbTick = (): void => {
    this._absorbWait -= game.deltaTime;
    if (this._absorbWait > 0) return;
    this._clearAbsorbPulse();
    this._pulseAbsorb();
  };

  private _scheduleAbsorbPulse(waitSec: number): void {
    this._absorbWait = Math.max(this._absorbWait, waitSec);
    if (this._absorbTicking) return;
    this._absorbTicking = true;
    director.on(Director.EVENT_AFTER_UPDATE, this._onAbsorbTick);
  }

  private _clearAbsorbPulse(): void {
    this._absorbWait = 0;
    if (!this._absorbTicking) return;
    director.off(Director.EVENT_AFTER_UPDATE, this._onAbsorbTick);
    this._absorbTicking = false;
  }

  private _oneShot(clip: AudioClip, gain: number): void {
    if (!this._sfx.node?.isValid) return;
    this._sfx.playOneShot(clip, this._sfxGain * gain);
  }

  private _persist(): void {
    try {
      sys.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bgm: this._bgmGain, sfx: this._sfxGain }),
      );
    } catch {
      /* ignore quota / private mode */
    }
  }

  private static _loadStored(): { bgm: number; sfx: number } {
    try {
      const raw = sys.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { bgm: DEFAULT_BGM, sfx: DEFAULT_SFX };
      const parsed = JSON.parse(raw) as { bgm?: number; sfx?: number };
      return {
        bgm: AudioService._clamp01(parsed.bgm ?? DEFAULT_BGM),
        sfx: AudioService._clamp01(parsed.sfx ?? DEFAULT_SFX),
      };
    } catch {
      return { bgm: DEFAULT_BGM, sfx: DEFAULT_SFX };
    }
  }

  private static _clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
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
