import {
  Color,
  Director,
  Layers,
  Node,
  ParticleSystem2D,
  Sprite,
  SpriteFrame,
  Tween,
  UIOpacity,
  UITransform,
  Vec2,
  Vec3,
  director,
  game,
  gfx,
  resources,
  tween,
} from 'cc';

const NAME = 'Confetti';
const CHEST_Y = 70;
const GOLD = new Color(255, 214, 72, 255);
const WHITE = new Color(255, 255, 255, 255);
const GOLD_HI = new Color(255, 239, 59, 255);
const PIECES = [
  'confetti-0', 'confetti-1', 'confetti-2', 'confetti-3', 'confetti-4',
  'confetti-5', 'confetti-6', 'confetti-7', 'confetti-8',
  'ribbon-0', 'ribbon-1', 'ribbon-2', 'ribbon-3', 'ribbon-4',
  'ribbon-5', 'ribbon-6', 'ribbon-7', 'ribbon-8',
];

const ART = [
  'glow-burst',
  'glow-soft',
  'glow-rays',
  'star-yellow',
  'flare',
  'sparkle',
  ...PIECES,
];

const _frames = new Map<string, SpriteFrame>();
let _boot: Promise<void> | null = null;
let _live = 0;
const _rateJobs: { ps: ParticleSystem2D; rate: number; wait: number }[] = [];
let _rateTick = false;

function frameOk(sf: SpriteFrame | null | undefined): sf is SpriteFrame {
  return !!(sf && sf.texture);
}

function loadOne(name: string): Promise<void> {
  return new Promise((resolve) => {
    resources.load(`fx/confetti/${name}/spriteFrame`, SpriteFrame, (err, sf) => {
      if (!err && frameOk(sf)) {
        const tex = sf.texture as { upload?: () => void } | null;
        tex?.upload?.();
        _frames.set(name, sf);
      }
      resolve();
    });
  });
}

function loadArt(): Promise<void> {
  if (_boot) return _boot;
  _boot = Promise.all(ART.map(loadOne)).then(() => {
    if (!_frames.size) console.warn('[Suck] win fx art missing');
  });
  return _boot;
}

export function preloadWinConfetti(host?: Node): Promise<void> {
  return loadArt().then(() => {
    if (host?.isValid) buildArt(host);
  });
}

function rootOf(host: Node): Node {
  let root = host.getChildByName(NAME);
  if (!root) {
    root = new Node(NAME);
    host.addChild(root);
    root.layer = Layers.Enum.UI_2D;
    root.addComponent(UITransform).setContentSize(2, 2);
    root.addComponent(UIOpacity);
  }
  root.active = true;
  const dim = host.getChildByName('Dim');
  root.setSiblingIndex(dim ? 1 : 0);
  return root;
}

export function clearWinConfetti(host: Node | null): void {
  _live += 1;
  _rateJobs.length = 0;
  const root = host?.getChildByName(NAME);
  if (!root?.isValid) return;
  Tween.stopAllByTarget(root);
  for (const n of root.children) {
    Tween.stopAllByTarget(n);
    n.getComponent(ParticleSystem2D)?.stopSystem();
  }
}

function paintGlow(root: Node, name: string, key: string, size: number, opacity: number, spinSec: number): void {
  const sf = _frames.get(key);
  let n = root.getChildByName(name);
  if (!frameOk(sf)) {
    if (n) n.active = false;
    return;
  }
  if (!n) {
    n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    root.addChild(n);
    n.addComponent(UITransform);
    n.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
    n.addComponent(UIOpacity);
  }
  n.active = true;
  n.setSiblingIndex(0);
  n.setPosition(0, CHEST_Y, 0);
  n.getComponent(UITransform)?.setContentSize(size, size);
  const sp = n.getComponent(Sprite);
  if (sp) {
    sp.spriteFrame = sf;
    sp.color = new Color(GOLD.r, GOLD.g, GOLD.b, 255);
  }
  const op = n.getComponent(UIOpacity);
  if (op) op.opacity = opacity;
  Tween.stopAllByTarget(n);
  n.angle = 0;
  n.setScale(1, 1, 1);
  if (spinSec > 0) tween(n).repeatForever(tween().by(spinSec, { angle: 360 })).start();
  else {
    tween(n)
      .repeatForever(
        tween()
          .to(1.2, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
          .to(1.2, { scale: new Vec3(0.96, 0.96, 1) }, { easing: 'sineInOut' }),
      )
      .start();
  }
}

type PsSpec = {
  name: string;
  art: string;
  y?: number;
  burst?: number;
  loop?: boolean;
  rate?: number;
  life: number;
  lifeVar?: number;
  speed: number;
  speedVar: number;
  size: number;
  sizeVar: number;
  gravity: number;
  angle: number;
  angleVar: number;
  posX?: number;
  posY?: number;
  color: Color;
  dirRot?: boolean;
  spin?: number;
  endA?: number;
};

function ensurePs(root: Node, spec: PsSpec): ParticleSystem2D | null {
  const sf = _frames.get(spec.art);
  if (!frameOk(sf) || typeof ParticleSystem2D !== 'function') return null;
  let n = root.getChildByName(spec.name);
  if (!n) {
    n = new Node(spec.name);
    n.layer = Layers.Enum.UI_2D;
    root.addChild(n);
    n.addComponent(UITransform).setContentSize(4, 4);
    n.addComponent(ParticleSystem2D);
  }
  n.active = true;
  n.setPosition(0, spec.y ?? CHEST_Y, 0);
  const ps = n.getComponent(ParticleSystem2D);
  if (!ps) return null;
  if (ps.custom && ps.spriteFrame === sf) return ps;
  const burst = spec.burst ?? 0;
  const loopRate = spec.loop ? Math.max(1, spec.rate ?? 2) : 0;
  ps.custom = true;
  ps.playOnLoad = false;
  ps.autoRemoveOnFinish = false;
  ps.spriteFrame = sf;
  ps.emitterMode = ParticleSystem2D.EmitterMode.GRAVITY;
  ps.positionType = ParticleSystem2D.PositionType.RELATIVE;
  ps.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
  ps.dstBlendFactor = gfx.BlendFactor.ONE;
  ps.duration = spec.loop ? ParticleSystem2D.DURATION_INFINITY : 0.12;
  ps.emissionRate = spec.loop ? loopRate : Math.max(burst / 0.12, burst || 1);
  ps.totalParticles = spec.loop
    ? Math.max(burst, 8) + Math.ceil(loopRate * (spec.life + (spec.lifeVar ?? 0)) + 8)
    : Math.max(burst, 8);
  ps.life = spec.life;
  ps.lifeVar = spec.lifeVar ?? 0;
  ps.speed = spec.speed;
  ps.speedVar = spec.speedVar;
  ps.startSize = spec.size;
  ps.startSizeVar = spec.sizeVar;
  ps.endSize = spec.size * 0.55;
  ps.endSizeVar = spec.sizeVar * 0.4;
  ps.angle = spec.angle;
  ps.angleVar = spec.angleVar;
  ps.gravity = new Vec2(0, spec.gravity);
  ps.posVar = new Vec2(spec.posX ?? 0, spec.posY ?? 0);
  ps.rotationIsDir = !!spec.dirRot;
  ps.startSpin = 0;
  ps.startSpinVar = spec.dirRot ? 0 : spec.spin ?? 180;
  ps.endSpin = spec.dirRot ? 0 : 220;
  ps.endSpinVar = spec.dirRot ? 0 : spec.spin ?? 180;
  ps.startColor = spec.color;
  ps.startColorVar = new Color(0, 0, 0, 0);
  const fade = spec.endA ?? 0;
  ps.endColor = new Color(spec.color.r, spec.color.g, spec.color.b, fade);
  ps.endColorVar = new Color(0, 0, 0, 0);
  return ps;
}

function queueLoopRate(ps: ParticleSystem2D, rate: number): void {
  _rateJobs.push({ ps, rate, wait: 0.12 });
  if (_rateTick) return;
  _rateTick = true;
  director.on(Director.EVENT_AFTER_UPDATE, onRateTick);
}

function onRateTick(): void {
  const dt = Math.min(0.05, game.deltaTime || 1 / 60);
  for (let i = _rateJobs.length - 1; i >= 0; i--) {
    const job = _rateJobs[i];
    job.wait -= dt;
    if (job.wait > 0) continue;
    if (job.ps.isValid) job.ps.emissionRate = job.rate;
    _rateJobs.splice(i, 1);
  }
  if (_rateJobs.length) return;
  director.off(Director.EVENT_AFTER_UPDATE, onRateTick);
  _rateTick = false;
}

function playBurst(ps: ParticleSystem2D | null, burst: number, loopRate = 0): void {
  if (!ps?.isValid) return;
  ps.node.active = true;
  if (loopRate > 0) {
    ps.duration = ParticleSystem2D.DURATION_INFINITY;
    ps.emissionRate = Math.max(burst / 0.12, burst);
    ps.resetSystem();
    queueLoopRate(ps, loopRate);
    return;
  }
  ps.resetSystem();
}

type Shot = { ps: ParticleSystem2D | null; burst: number; loop: number };

function makeShots(root: Node): Shot[] {
  const shots: Shot[] = [
    { ps: ensurePs(root, {
      name: 'Flash',
      art: 'glow-soft',
      burst: 2,
      life: 0.55,
      speed: 0,
      speedVar: 0,
      size: 220,
      sizeVar: 20,
      gravity: 0,
      angle: 90,
      angleVar: 0,
      color: new Color(255, 248, 85, 220),
      spin: 0,
      endA: 0,
    }), burst: 2, loop: 0 },
  ];
  for (let i = 0; i < PIECES.length; i++) {
    const art = PIECES[i];
    if (!_frames.has(art)) continue;
    shots.push({
      ps: ensurePs(root, {
        name: `Chunk_${i}`,
        art,
        burst: 8,
        loop: true,
        rate: 2,
        life: 2.2,
        lifeVar: 0.3,
        speed: 640,
        speedVar: 220,
        size: 52,
        sizeVar: 14,
        gravity: -460,
        angle: 90,
        angleVar: 170,
        color: WHITE,
        spin: 200,
      }),
      burst: 8,
      loop: 2,
    });
  }
  shots.push(
    {
      ps: ensurePs(root, {
        name: 'Streak',
        art: 'flare',
        burst: 14,
        loop: true,
        rate: 3,
        life: 0.95,
        lifeVar: 0.15,
        speed: 880,
        speedVar: 220,
        size: 90,
        sizeVar: 24,
        gravity: -280,
        angle: 90,
        angleVar: 160,
        color: GOLD_HI,
        dirRot: true,
      }),
      burst: 14,
      loop: 3,
    },
    {
      ps: ensurePs(root, {
        name: 'Star',
        art: 'star-yellow',
        burst: 14,
        loop: true,
        rate: 3,
        life: 1.05,
        lifeVar: 0.15,
        speed: 860,
        speedVar: 220,
        size: 28,
        sizeVar: 8,
        gravity: -280,
        angle: 90,
        angleVar: 160,
        color: GOLD_HI,
      }),
      burst: 14,
      loop: 3,
    },
    {
      ps: ensurePs(root, {
        name: 'Rain',
        art: _frames.has('sparkle') ? 'sparkle' : 'flare',
        y: 520,
        loop: true,
        rate: 16,
        life: 1.6,
        lifeVar: 0.4,
        speed: 260,
        speedVar: 80,
        size: 22,
        sizeVar: 8,
        gravity: -80,
        angle: 270,
        angleVar: 8,
        posX: 520,
        posY: 40,
        color: GOLD_HI,
        dirRot: true,
      }),
      burst: 0,
      loop: 16,
    },
  );
  return shots;
}

function paintGlows(root: Node): void {
  paintGlow(root, 'GlowSoft', 'glow-soft', 900, 160, 0);
  paintGlow(root, 'GlowBurst', 'glow-burst', 1200, 230, 18);
  paintGlow(root, 'GlowRays', 'glow-rays', 1400, 140, 28);
}

function buildArt(host: Node): void {
  const root = rootOf(host);
  paintGlows(root);
  const shots = makeShots(root);
  for (const shot of shots) {
    if (!shot.ps) continue;
    shot.ps.resetSystem();
    shot.ps.stopSystem();
  }
}

function fireShot(shot: Shot): void {
  if (!shot.ps) return;
  if (shot.burst <= 0 && shot.loop > 0) {
    shot.ps.node.active = true;
    shot.ps.resetSystem();
    return;
  }
  playBurst(shot.ps, shot.burst, shot.loop);
}

function playNow(root: Node): void {
  paintGlows(root);
  for (const shot of makeShots(root)) fireShot(shot);
}

export function playWinConfetti(host: Node): void {
  if (!host?.isValid) return;
  const run = (): void => {
    if (!host.isValid) return;
    _live += 1;
    playNow(rootOf(host));
  };
  if (_frames.size) {
    run();
    return;
  }
  void loadArt().then(run);
}

export function afterDraws(n: number): Promise<void> {
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
