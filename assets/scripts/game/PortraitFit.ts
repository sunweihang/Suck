import {
  Camera,
  Color,
  Node,
  Rect,
  ResolutionPolicy,
  Size,
  director,
  game,
  screen,
  view,
} from 'cc';

/** Design canvas — mobile portrait. */
export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

/** Fullscreen art. Wider phones crop top/bottom; never letterbox the play field. */
export const BG_W = 1080;
export const BG_H = 2200;

/** Size the 1080×2200 backdrop so width fills, leftover height is cropped. */
export function coverBackgroundSize(visW: number, visH: number): { w: number; h: number } {
  const scale = Math.max(visW / BG_W, visH / BG_H);
  return { w: Math.ceil(BG_W * scale), h: Math.ceil(BG_H * scale) };
}

/** Desktop side bars outside the 1080 portrait frame — plain black. */
export const LETTERBOX_CLEAR = new Color(0, 0, 0, 255);

const _rect = new Rect();
const _size = new Size();

let _appliedPolicy = -1;
let _appliedWinW = -1;
let _appliedWinH = -1;

/** Longest framebuffer edge. iPhone 16 native is ~2556; this keeps fill near 1080p. */
export const RENDER_MAX_LONG_EDGE = 1080;

const RENDER_SCALE_NODE = 'RenderScale';
const POST_PROCESS = 'cc.PostProcess';

/**
 * Downsample the custom-pipeline offscreen pass so the long edge is ≤ 1080,
 * then blit back to the swapchain. Cameras stay on the default (non-HDR)
 * path — `usePostProcess` stays false — so PBR does not wash out.
 */
export function capRenderResolution(host: Node): void {
  const scene = host.scene;
  if (!scene) return;
  const win = screen.windowSize;
  const longEdge = Math.max(win.width, win.height);
  const scale =
    longEdge > 1 ? Math.min(1, RENDER_MAX_LONG_EDGE / longEdge) : 1;

  let node = scene.getChildByName(RENDER_SCALE_NODE);
  if (!node) {
    node = new Node(RENDER_SCALE_NODE);
    scene.addChild(node);
  }
  const pp = (node.getComponent(POST_PROCESS) ?? node.addComponent(POST_PROCESS)) as {
    global: boolean;
    enableShadingScaleInEditor: boolean;
    shadingScale: number;
  };
  pp.global = true;
  pp.enableShadingScaleInEditor = true;
  if (Math.abs(pp.shadingScale - scale) > 1e-4) pp.shadingScale = scale;

  const pipeline = director.root?.pipeline;
  if (pipeline && Math.abs(pipeline.shadingScale - scale) > 1e-4) {
    pipeline.shadingScale = scale;
  }
}

/**
 * Portrait policy:
 * - Tall/narrow phones (aspect ≤ 9:16): FIXED_WIDTH — fill width, grow height.
 * - Wide desktop windows: SHOW_ALL — keep a 9:16 frame with side letterbox.
 */
export function applyDesignResolution(): void {
  const win = screen.windowSize;
  const ww = win.width;
  const wh = win.height;
  const winAspect = ww / Math.max(wh, 1);
  const designAspect = DESIGN_W / DESIGN_H;
  const policy =
    winAspect <= designAspect + 1e-3
      ? ResolutionPolicy.FIXED_WIDTH
      : ResolutionPolicy.SHOW_ALL;
  if (_appliedPolicy === policy && _appliedWinW === ww && _appliedWinH === wh) {
    return;
  }
  _appliedPolicy = policy;
  _appliedWinW = ww;
  _appliedWinH = wh;
  view.setDesignResolutionSize(DESIGN_W, DESIGN_H, policy);
}

/** Visible design-space size after the active resolution policy. */
export function portraitVisibleSize(out: Size = _size): Size {
  const v = view.getVisibleSize();
  out.set(Math.max(v.width, DESIGN_W), Math.max(v.height, DESIGN_H));
  return out;
}

/**
 * Browser client coords → UI bottom-left (same space as `event.getUILocation()`).
 * Maps through the letterboxed viewport so desktop SHOW_ALL / editor preview
 * don't shift taps into the black bars.
 */
export function clientToUiLocation(
  clientX: number,
  clientY: number,
  allowOutside = false,
): { x: number; y: number } | null {
  const canvas = game.canvas as HTMLCanvasElement | null;
  if (!canvas) return null;
  const box = canvas.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;

  const lx = clientX - box.left;
  const ly = clientY - box.top;
  if (!allowOutside && (lx < 0 || ly < 0 || lx > box.width || ly > box.height)) {
    return null;
  }

  const win = screen.windowSize;
  const ww = Math.max(win.width, 1);
  const wh = Math.max(win.height, 1);
  const frameX = (lx / box.width) * ww;
  const frameY = wh - (ly / box.height) * wh;
  const vp = view.getViewportRect();
  const vpW = Math.max(1, vp.width);
  const vpH = Math.max(1, vp.height);
  const rx = (frameX - vp.x) / vpW;
  const ry = (frameY - vp.y) / vpH;
  if (!allowOutside && (rx < -0.02 || ry < -0.02 || rx > 1.02 || ry > 1.02)) {
    return null;
  }
  const vis = portraitVisibleSize();
  return {
    x: Math.min(1, Math.max(0, rx)) * vis.width,
    y: Math.min(1, Math.max(0, ry)) * vis.height,
  };
}

/**
 * Normalized Camera.rect matching the content viewport.
 * FIXED_WIDTH on phones → full window; SHOW_ALL on desktop → letterboxed frame.
 */
export function portraitCameraRect(out: Rect = _rect): Rect {
  const vp = view.getViewportRect();
  const win = screen.windowSize;
  const ww = Math.max(win.width, 1);
  const wh = Math.max(win.height, 1);
  out.set(vp.x / ww, vp.y / wh, vp.width / ww, vp.height / wh);
  return out;
}

/** Apply portrait viewport rect to a camera. */
export function applyPortraitCameraRect(cam: Camera): void {
  const r = portraitCameraRect();
  if (r.width < 0.05 || r.height < 0.05) {
    cam.rect = new Rect(0, 0, 1, 1);
    return;
  }
  cam.rect = new Rect(r.x, r.y, r.width, r.height);
}

/** True when SHOW_ALL leaves side/top bars. Phones on FIXED_WIDTH stay full-bleed. */
export function needsLetterbox(): boolean {
  const r = portraitCameraRect();
  return r.x > 0.002 || r.y > 0.002 || r.width < 0.996 || r.height < 0.996;
}
