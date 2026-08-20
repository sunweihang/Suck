(() => {
  const TOKEN_RGB = {
    o: [214, 123, 19], y: [224, 197, 43], c: [17, 183, 214], g: [61, 149, 30],
    p: [231, 58, 148], v: [113, 52, 226], r: [207, 36, 48], s: [33, 95, 200],
    k: [236, 99, 136], m: [2, 161, 144], a: [238, 143, 199], d: [195, 175, 113],
  };
  const TOKEN_NAME = {
    o: '橙', y: '黄', c: '青', g: '绿', p: '粉', v: '紫',
    r: '红', s: '蓝', k: '珊瑚', m: '薄荷', a: '品红', d: '金',
  };
  const ALL = Object.keys(TOKEN_RGB);
  const BENCH_COLS = 4;
  const BENCH_ROWS = 6;
  const BENCH_SEATS = BENCH_COLS * BENCH_ROWS;
  const TOOLS = [
    ['paint', '画笔'],
    ['erase', '橡皮'],
    ['fill', '填充'],
    ['lock', '钉子'],
    ['chest', '宝箱'],
    ['rescue', '拯救'],
    ['iron', '铁板行'],
    ['gap', '缺口列'],
  ];

  const $ = (id) => document.getElementById(id);
  const state = {
    id: 1,
    raw: null,
    cells: [],
    tool: 'paint',
    token: 'o',
    layer: 0,
    dirty: false,
    painting: false,
    levels: [],
    shapes: [],
  };
  const view = {
    iso: true,
    cw: 16,
    ch: 14,
    dzx: 6,
    dzy: 5,
    ox: 36,
    oy: 24,
    cx: 360,
    cy: 320,
    cols: 0,
    rows: 0,
    maxZ: 1,
    yaw: 0,
    pitch: 25 * Math.PI / 180,
    zoom: 1,
    panX: 0,
    panY: 0,
    scale: 18,
  };
  const cam = { orbit: false, pan: false, lx: 0, ly: 0 };
  const preview = { on: false, spin: true, raf: 0, drag: false, lx: 0, ly: 0, saved: null };
  let hist = [];
  let histN = -1;
  let strokeOpen = false;
  let baseline = '';

  function rgb(token) {
    const c = TOKEN_RGB[token] || [180, 180, 180];
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function toLin(c) {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }

  function toSrgb(x) {
    const y = x <= 0.0031308 ? 12.92 * x : 1.055 * (Math.max(0, x) ** (1 / 2.4)) - 0.055;
    return Math.max(0, Math.min(255, Math.round(y * 255)));
  }

  function shade(token, mul) {
    const c = TOKEN_RGB[token] || [180, 180, 180];
    return `rgb(${toSrgb(toLin(c[0]) * mul)},${toSrgb(toLin(c[1]) * mul)},${toSrgb(toLin(c[2]) * mul)})`;
  }

  function decodeCell(raw) {
    if (!raw) return null;
    if (raw[0] === '@' && raw[1]) return { tokens: [], rescue: raw[1].toLowerCase() };
    if (raw[0] === '$') return { tokens: [], chest: true };
    const tokens = [];
    const locked = [];
    let anyLock = false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '*' || raw[i] === '!' || raw[i] === '^') {
        i += 1;
        if (i >= raw.length) break;
      }
      const ch = raw[i];
      const up = ch >= 'A' && ch <= 'Z';
      tokens.push((up ? ch.toLowerCase() : ch));
      locked.push(up);
      if (up) anyLock = true;
    }
    const cell = { tokens };
    if (anyLock) cell.locked = locked;
    return cell;
  }

  function encodeCell(cell) {
    if (!cell) return null;
    if (cell.rescue) return `@${cell.rescue}`;
    if (cell.chest) return '$';
    return (cell.tokens || []).map((t, z) => {
      const ch = cell.locked?.[z] ? t.toUpperCase() : t;
      return ch;
    }).join('');
  }

  function decodeRaw(raw) {
    const cells = (raw.cells || []).map((c) => (typeof c === 'string' || c == null ? decodeCell(c) : JSON.parse(JSON.stringify(c))));
    while (cells.length < raw.cols * raw.rows) cells.push(null);
    return cells.slice(0, raw.cols * raw.rows);
  }

  function encodeRaw() {
    const raw = { ...state.raw };
    raw.id = state.id;
    raw.cells = state.cells.map(encodeCell);
    raw.palette = Array.isArray(raw.palette) ? raw.palette.join('') : String(raw.palette || '');
    raw.ironRows = parseNums($('iron').value);
    raw.ironGaps = parseNums($('gaps').value);
    raw.ironRow = raw.ironRows.length ? raw.ironRows[raw.ironRows.length - 1] : -1;
    raw.units = collectUnits();
    return raw;
  }

  function parseNums(text) {
    return String(text || '')
      .split(/[,，\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => n | 0);
  }

  function palette() {
    const p = state.raw?.palette;
    return typeof p === 'string' ? [...p] : [...(p || ['o'])];
  }

  function setDirty(on) {
    state.dirty = on;
    $('dirty').classList.toggle('hidden', !on);
  }

  function snap() {
    return JSON.stringify({
      cells: state.cells,
      units: state.raw.units,
      palette: state.raw.palette,
      cols: state.raw.cols,
      rows: state.raw.rows,
      iron: $('iron').value,
      gaps: $('gaps').value,
    });
  }

  function resetHist() {
    hist = [snap()];
    histN = 0;
  }

  function markBaseline() {
    baseline = snap();
  }

  function pushHist() {
    if (!state.raw) return;
    const s = snap();
    if (s === hist[histN]) return;
    hist = hist.slice(0, histN + 1);
    hist.push(s);
    if (hist.length > 80) {
      hist.shift();
    }
    histN = hist.length - 1;
  }

  function applySnap(s) {
    const d = JSON.parse(s);
    state.cells = d.cells;
    state.raw.units = d.units;
    state.raw.palette = d.palette;
    state.raw.cols = d.cols;
    state.raw.rows = d.rows;
    $('iron').value = d.iron;
    $('gaps').value = d.gaps;
    $('cols').value = d.cols;
    $('rows').value = d.rows;
    renderPalette();
    renderUnits();
    setDirty(true);
    draw();
  }

  function undo() {
    if (histN <= 0) return;
    histN -= 1;
    applySnap(hist[histN]);
  }

  function redo() {
    if (histN >= hist.length - 1) return;
    histN += 1;
    applySnap(hist[histN]);
  }

  function revertAll() {
    if (!state.raw || !baseline) return;
    if (snap() === baseline) return;
    if (!confirm('撤销本关全部未保存修改，回到上次保存或打开时的状态？')) return;
    applySnap(baseline);
    setDirty(false);
    resetHist();
    $('solve').textContent = '已撤销全部修改';
    $('solve').className = 'solve';
  }

  function beginStroke() {
    if (strokeOpen) return;
    pushHist();
    strokeOpen = true;
  }

  function idx(x, y) {
    return y * state.raw.cols + x;
  }

  function cellAt(x, y) {
    return state.cells[idx(x, y)] || null;
  }

  function ensureFlags(cell, key, len) {
    if (!cell[key]) cell[key] = Array.from({ length: len }, () => false);
    while (cell[key].length < len) cell[key].push(false);
  }

  function paintCell(x, y) {
    beginStroke();
    const { cols, rows } = state.raw;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const i = idx(x, y);
    const z = state.layer;
    if (state.tool === 'iron') {
      toggleNum('iron', y);
      return;
    }
    if (state.tool === 'gap') {
      toggleNum('gaps', x);
      return;
    }
    if (state.tool === 'erase') {
      const cell = state.cells[i];
      if (!cell) return;
      if (cell.rescue || cell.chest) {
        state.cells[i] = null;
      } else if (cell.tokens?.length) {
        if (z < cell.tokens.length) {
          cell.tokens.splice(z, 1);
          ['locked'].forEach((k) => cell[k]?.splice(z, 1));
        }
        if (!cell.tokens.length) state.cells[i] = null;
      }
      setDirty(true);
      return;
    }
    if (state.tool === 'chest') {
      state.cells[i] = { tokens: [], chest: true };
      setDirty(true);
      return;
    }
    if (state.tool === 'rescue') {
      state.cells[i] = { tokens: [], rescue: state.token };
      setDirty(true);
      return;
    }
    if (state.tool === 'fill') {
      flood(x, y);
      return;
    }
    let cell = state.cells[i];
    if (!cell || cell.rescue || cell.chest) cell = { tokens: [] };
    while (cell.tokens.length <= z) cell.tokens.push(state.token);
    cell.tokens[z] = state.token;
    if (state.tool === 'lock') {
      ensureFlags(cell, 'locked', cell.tokens.length);
      cell.locked[z] = true;
    }
    state.cells[i] = cell;
    setDirty(true);
  }

  function flood(x, y) {
    const start = cellAt(x, y);
    const from = start?.tokens?.[state.layer] || null;
    const seen = new Set();
    const q = [[x, y]];
    while (q.length) {
      const [cx, cy] = q.pop();
      const key = `${cx},${cy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cell = cellAt(cx, cy);
      const tok = cell?.tokens?.[state.layer] || null;
      if (tok !== from) continue;
      const prev = state.tool;
      state.tool = 'paint';
      paintCell(cx, cy);
      state.tool = prev;
      q.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
    }
  }

  function toggleNum(id, n) {
    beginStroke();
    const set = new Set(parseNums($(id).value));
    if (set.has(n)) set.delete(n);
    else set.add(n);
    $(id).value = [...set].sort((a, b) => a - b).join(',');
    setDirty(true);
    draw();
  }

  function maxDepth() {
    let n = 1;
    for (const cell of state.cells) {
      if (cell?.tokens?.length) n = Math.max(n, cell.tokens.length);
    }
    return n;
  }

  function syncViewButtons() {
    const iso = $('view-iso') ? $('view-iso').checked : true;
    if ($('btn-flat')) $('btn-flat').classList.toggle('active', !iso);
    if ($('btn-cam')) $('btn-cam').classList.toggle('active', iso);
  }

  function setFlatView() {
    if ($('view-iso')) $('view-iso').checked = false;
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
    syncViewButtons();
    draw();
  }

  function resetCam() {
    if ($('view-iso')) $('view-iso').checked = true;
    view.yaw = 0;
    view.pitch = 25 * Math.PI / 180;
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
    syncViewButtons();
    draw();
  }

  function drawCanvas() {
    return preview.on && $('preview-grid') ? $('preview-grid') : $('grid');
  }

  function openPreview() {
    if (!state.raw) return;
    preview.saved = {
      yaw: view.yaw,
      pitch: view.pitch,
      zoom: view.zoom,
      panX: view.panX,
      panY: view.panY,
      iso: $('view-iso') ? $('view-iso').checked : true,
    };
    preview.on = true;
    preview.spin = false;
    if ($('view-iso')) $('view-iso').checked = true;
    view.yaw = 0;
    view.pitch = 25 * Math.PI / 180;
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
    if ($('preview')) $('preview').classList.remove('hidden');
    syncViewButtons();
    requestAnimationFrame(() => draw());
  }

  function closePreview() {
    if (!preview.on) return;
    preview.on = false;
    preview.drag = false;
    preview.raf = 0;
    if ($('preview')) $('preview').classList.add('hidden');
    if (preview.saved) {
      view.yaw = preview.saved.yaw;
      view.pitch = preview.saved.pitch;
      view.zoom = preview.saved.zoom;
      view.panX = preview.saved.panX;
      view.panY = preview.saved.panY;
      if ($('view-iso')) $('view-iso').checked = preview.saved.iso;
    }
    syncViewButtons();
    draw();
  }

  function bindPreview() {
    const canvas = $('preview-grid');
    const box = $('preview');
    if (!canvas || !box) return;
    if ($('btn-preview')) $('btn-preview').onclick = openPreview;
    if ($('btn-img-preview')) $('btn-img-preview').onclick = openPreview;
    if ($('btn-preview-close')) $('btn-preview-close').onclick = closePreview;
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('pointerdown', (ev) => {
      preview.drag = true;
      preview.lx = ev.clientX;
      preview.ly = ev.clientY;
      canvas.classList.add('orbiting');
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!preview.drag) return;
      view.yaw += (ev.clientX - preview.lx) * 0.01;
      view.pitch = Math.max(0.05, Math.min(1.35, view.pitch + (ev.clientY - preview.ly) * 0.008));
      preview.lx = ev.clientX;
      preview.ly = ev.clientY;
      draw();
    });
    const endDrag = () => {
      preview.drag = false;
      canvas.classList.remove('orbiting');
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 0.9 : 1.11;
      view.zoom = Math.max(0.25, Math.min(4, view.zoom * factor));
      draw();
    }, { passive: false });
  }

  function camXY(wx, wy, wz) {
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cp = Math.cos(view.pitch);
    const sp = Math.sin(view.pitch);
    const x1 = wx * cy + wz * sy;
    const z1 = -wx * sy + wz * cy;
    return {
      x: x1,
      y: wy * cp - z1 * sp,
      d: wy * sp + z1 * cp,
    };
  }

  function project(wx, wy, wz) {
    const p = camXY(wx, wy, wz);
    return {
      x: view.cx + view.panX + p.x * view.scale,
      y: view.cy + view.panY - p.y * view.scale,
      d: p.d,
    };
  }

  function camZ(nx, ny, nz) {
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cp = Math.cos(view.pitch);
    const sp = Math.sin(view.pitch);
    const z1 = -nx * sy + nz * cy;
    return ny * sp + z1 * cp;
  }

  function corner(x, y, z, dx, dy, dz) {
    return project(
      x - (view.cols - 1) / 2 + dx,
      y - (view.rows - 1) / 2 + dy,
      -(z + dz),
    );
  }

  function occupied(x, y, z) {
    const cell = cellAt(x, y);
    if (!cell) return false;
    if (cell.chest || cell.rescue) return z === 0;
    return !!(cell.tokens && cell.tokens[z]);
  }

  function isoXY(x, y, z) {
    if (!view.iso) {
      return { x: view.ox + x * view.cw, y: (view.rows - 1 - y) * view.ch };
    }
    return corner(x, y, z, 0, 0, 0);
  }

  function stageSize(canvas) {
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    return {
      w: Math.max(320, Math.round(rect.width || wrap.clientWidth || 320)),
      h: Math.max(240, Math.round(rect.height || wrap.clientHeight || 240)),
    };
  }

  function fitCanvas(canvas, w, h) {
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function volumeCamBounds() {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    const xs = [-0.45, view.cols - 1 + 1];
    const ys = [-0.4, view.rows - 1 + 1];
    const zs = [0, view.maxZ];
    const ox = (view.cols - 1) / 2;
    const oy = (view.rows - 1) / 2;
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          const p = camXY(x - ox, y - oy, -z);
          b.minX = Math.min(b.minX, p.x);
          b.maxX = Math.max(b.maxX, p.x);
          b.minY = Math.min(b.minY, p.y);
          b.maxY = Math.max(b.maxY, p.y);
        }
      }
    }
    return b;
  }

  function layoutView() {
    const canvas = drawCanvas();
    const raw = state.raw;
    const cols = raw.cols;
    const rows = raw.rows;
    const { w: maxW, h: maxH } = stageSize(canvas);
    const iso = preview.on || ($('view-iso') ? $('view-iso').checked : true);
    const depthN = Math.max(1, maxDepth());
    view.cols = cols;
    view.rows = rows;
    view.maxZ = depthN;
    if (!iso) {
      const padL = 28;
      const padB = 24;
      const cell = Math.max(10, Math.min(28, Math.floor((maxW - padL) / cols), Math.floor((maxH - padB) / rows)));
      view.iso = false;
      view.cw = cell;
      view.ch = cell;
      view.ox = padL;
      view.oy = 0;
      fitCanvas(canvas, maxW, maxH);
      return;
    }
    view.iso = true;
    fitCanvas(canvas, maxW, maxH);
    const b = volumeCamBounds();
    const spanX = Math.max(1e-3, b.maxX - b.minX);
    const spanY = Math.max(1e-3, b.maxY - b.minY);
    const padX = Math.max(28, maxW * 0.05);
    const padY = Math.max(28, maxH * 0.07);
    const fit = Math.min((maxW - padX * 2) / spanX, (maxH - padY * 2) / spanY);
    view.scale = Math.max(8, fit * view.zoom);
    view.cx = maxW * 0.5 - ((b.minX + b.maxX) / 2) * view.scale;
    view.cy = maxH * 0.5 + ((b.minY + b.maxY) / 2) * view.scale;
  }

  const FACES = [
    { n: [0, 0, 1], mul: 1, nb: [0, 0, -1], pts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
    { n: [0, 0, -1], mul: 0.55, nb: [0, 0, 1], pts: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },
    { n: [0, 1, 0], mul: 1.12, nb: [0, 1, 0], pts: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
    { n: [0, -1, 0], mul: 0.42, nb: [0, -1, 0], pts: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]] },
    { n: [1, 0, 0], mul: 0.68, nb: [1, 0, 0], pts: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
    { n: [-1, 0, 0], mul: 0.62, nb: [-1, 0, 0], pts: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  ];
  const ROUGH = 0.34;
  const METAL = 0.04;
  const EMIT = 0.04;
  const INV_PI = 1 / Math.PI;
  const LIT_RGB = [toLin(255), toLin(232), toLin(204)];
  const SKY_RGB = [toLin(254), toLin(250), toLin(220)];
  const GND_RGB = [toLin(176), toLin(226), toLin(236)];
  const LIT_W = 3.45;
  const AMB_W = 0.18;
  const CUBE_PAD = 0.08;
  const FACE_INSET = 0.16;
  const LIGHT = (function gameLightDir() {
    const hr = Math.PI / 360;
    const x = -58 * hr;
    const y = 46 * hr;
    const sx = Math.sin(x);
    const cx = Math.cos(x);
    const sy = Math.sin(y);
    const cy = Math.cos(y);
    const q = {
      x: sx * cy,
      y: cx * sy,
      z: -sx * sy,
      w: cx * cy,
    };
    const vx = 0;
    const vy = 0;
    const vz = -1;
    const tx = 2 * (q.y * vz - q.z * vy);
    const ty = 2 * (q.z * vx - q.x * vz);
    const tz = 2 * (q.x * vy - q.y * vx);
    const dir = [
      vx + q.w * tx + (q.y * tz - q.z * ty),
      vy + q.w * ty + (q.z * tx - q.x * tz),
      vz + q.w * tz + (q.x * ty - q.y * tx),
    ];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return [-dir[0] / len, -dir[1] / len, -dir[2] / len];
  }());

  function viewDir() {
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cp = Math.cos(view.pitch);
    const sp = Math.sin(view.pitch);
    return [sy * cp, sp, cy * cp];
  }

  function ggxMobile(rough, noh, h, n) {
    const nxh0 = n[1] * h[2] - n[2] * h[1];
    const nxh1 = n[2] * h[0] - n[0] * h[2];
    const nxh2 = n[0] * h[1] - n[1] * h[0];
    const oneMinus = nxh0 * nxh0 + nxh1 * nxh1 + nxh2 * nxh2;
    const a = rough * rough;
    const p = a / Math.max(1e-5, oneMinus + (noh * a) ** 2);
    return p * p;
  }

  function brdfApprox(spec, rough, nov) {
    const rx = rough * -1 + 1;
    const ry = rough * -0.0275 + 0.0425;
    const rz = rough * -0.572 + 1.04;
    const rw = rough * 0.022 - 0.04;
    const a004 = Math.min(rx * rx, 2 ** (-9.28 * nov)) * rx + ry;
    let abx = -1.04 * a004 + rz;
    let aby = 1.04 * a004 + rw;
    aby *= Math.max(0, Math.min(1, 50 * spec[1]));
    return [
      Math.max(0, spec[0] * abx + aby),
      Math.max(0, spec[1] * abx + aby),
      Math.max(0, spec[2] * abx + aby),
    ];
  }

  function litFace(token, n, highlight) {
    const raw = TOKEN_RGB[token] || [180, 180, 180];
    const src = [
      raw[0] * 0.92 + 210 * 0.08,
      raw[1] * 0.88 + 150 * 0.08,
      raw[2] * 0.82 + 70 * 0.08,
    ];
    const albedo = [toLin(src[0]), toLin(src[1]), toLin(src[2])];
    const V = viewDir();
    const L = LIGHT;
    const nl = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    const ndv = n[0] * V[0] + n[1] * V[1] + n[2] * V[2];
    const nv = Math.max(1e-4, Math.abs(ndv));
    const diffuse = [albedo[0] * (1 - METAL), albedo[1] * (1 - METAL), albedo[2] * (1 - METAL)];
    const spec0 = [
      0.04 * (1 - METAL) + albedo[0] * METAL,
      0.04 * (1 - METAL) + albedo[1] * METAL,
      0.04 * (1 - METAL) + albedo[2] * METAL,
    ];
    const specular = brdfApprox(spec0, ROUGH, nv);
    const hx = L[0] + V[0];
    const hy = L[1] + V[1];
    const hz = L[2] + V[2];
    const hl = Math.hypot(hx, hy, hz) || 1;
    const H = [hx / hl, hy / hl, hz / hl];
    const nh = Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]);
    const specTerm = (ROUGH * 0.25 + 0.25) * ggxMobile(ROUGH, nh, H, n);
    const fAmb = Math.max(1e-4, 0.5 - n[1] * 0.5);
    const ry = 2 * ndv * n[1] - V[1];
    const fEnv = Math.max(1e-4, 0.5 - ry * 0.5);
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const light = nl * LIT_RGB[i] * LIT_W;
      const amb = (SKY_RGB[i] * (1 - fAmb) + GND_RGB[i] * fAmb) * AMB_W;
      const env = (SKY_RGB[i] * (1 - fEnv) + GND_RGB[i] * fEnv) * AMB_W;
      out[i] = light * (diffuse[i] * INV_PI + specular[i] * specTerm) + amb * diffuse[i] + env * specular[i] + albedo[i] * EMIT;
      if (highlight) out[i] *= 1.04;
    }
    return `rgb(${toSrgb(out[0])},${toSrgb(out[1])},${toSrgb(out[2])})`;
  }

  function fillPoly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  function pad(v) {
    return CUBE_PAD + v * (1 - CUBE_PAD * 2);
  }

  function cubePt(x, y, z, dx, dy, dz) {
    return corner(x, y, z, pad(dx), pad(dy), pad(dz));
  }

  function norm3(a, b, c) {
    const l = Math.hypot(a, b, c) || 1;
    return [a / l, b / l, c / l];
  }

  function faceGradient(ctx, token, n, x, y, z, corners, highlight) {
    let minD = 1e9;
    let maxD = -1e9;
    let a = corners[0];
    let b = corners[0];
    const cx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) * 0.25;
    const cy = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) * 0.25;
    const cz = (corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) * 0.25;
    for (const p of corners) {
      const d = (p[0] - cx) * LIGHT[0] + (p[1] - cy) * LIGHT[1] + (p[2] - cz) * LIGHT[2];
      if (d < minD) {
        minD = d;
        a = p;
      }
      if (d > maxD) {
        maxD = d;
        b = p;
      }
    }
    const pa = cubePt(x, y, z, a[0], a[1], a[2]);
    const pb = cubePt(x, y, z, b[0], b[1], b[2]);
    const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
    g.addColorStop(0, litFace(token, norm3(n[0] - LIGHT[0] * 0.32, n[1] - LIGHT[1] * 0.32, n[2] - LIGHT[2] * 0.32), highlight));
    g.addColorStop(1, litFace(token, norm3(n[0] + LIGHT[0] * 0.4, n[1] + LIGHT[1] * 0.4, n[2] + LIGHT[2] * 0.4), highlight));
    return g;
  }

  function drawCube(ctx, x, y, z, token, _alpha, highlight) {
    const visible = [];
    for (const face of FACES) {
      if (occupied(x + face.nb[0], y + face.nb[1], z + face.nb[2])) continue;
      if (camZ(face.n[0], face.n[1], face.n[2]) <= 0.02) continue;
      visible.push(face);
    }
    if (!visible.length) return;
    ctx.fillStyle = litFace(token, [0.12, -0.62, 0.22], highlight);
    for (const face of visible) {
      fillPoly(ctx, face.pts.map((p) => cubePt(x, y, z, p[0], p[1], p[2])));
    }
    for (const face of visible) {
      const mid = [
        (face.pts[0][0] + face.pts[2][0]) * 0.5,
        (face.pts[0][1] + face.pts[2][1]) * 0.5,
        (face.pts[0][2] + face.pts[2][2]) * 0.5,
      ];
      const inner = face.pts.map((p) => [
        p[0] + (mid[0] - p[0]) * FACE_INSET,
        p[1] + (mid[1] - p[1]) * FACE_INSET,
        p[2] + (mid[2] - p[2]) * FACE_INSET,
      ]);
      const outerPts = face.pts.map((p) => cubePt(x, y, z, p[0], p[1], p[2]));
      const innerPts = inner.map((p) => cubePt(x, y, z, p[0], p[1], p[2]));
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) & 3;
        const a = face.pts[i];
        const b = face.pts[j];
        const edge = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const bevelN = norm3(
          face.n[0] * 0.72 + edge[1] * face.n[2] - edge[2] * face.n[1],
          face.n[1] * 0.72 + edge[2] * face.n[0] - edge[0] * face.n[2],
          face.n[2] * 0.72 + edge[0] * face.n[1] - edge[1] * face.n[0],
        );
        const tilt = norm3(face.n[0] + LIGHT[0] * 0.15, face.n[1] + LIGHT[1] * 0.15, face.n[2] + LIGHT[2] * 0.15);
        ctx.fillStyle = litFace(token, norm3(bevelN[0] + tilt[0], bevelN[1] + tilt[1], bevelN[2] + tilt[2]), highlight);
        fillPoly(ctx, [outerPts[i], outerPts[j], innerPts[j], innerPts[i]]);
      }
      ctx.fillStyle = faceGradient(ctx, token, face.n, x, y, z, inner, highlight);
      fillPoly(ctx, innerPts);
    }
  }

  function drawMarks(ctx, x, y, z, cell) {
    const a = corner(x, y, z, 0.2, 0.2, 0);
    const b = corner(x, y, z, 0.8, 0.8, 0);
    if (cell.locked?.[z]) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }
  }

  function draw() {
    const canvas = drawCanvas();
    const raw = state.raw;
    if (!raw) return;
    layoutView();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = view.iso ? (preview.on ? '#fefcde' : '#1a1524') : '#111318';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const irons = new Set(parseNums($('iron').value));
    const gaps = new Set(parseNums($('gaps').value));
    const showAll = $('show-all').checked;
    const zView = state.layer;
    const cols = raw.cols;
    const rows = raw.rows;

    if (!view.iso) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = view.ox + x * view.cw;
          const py = (rows - 1 - y) * view.ch;
          const cellData = cellAt(x, y);
          ctx.fillStyle = '#1a1d24';
          ctx.fillRect(px, py, view.cw - 1, view.ch - 1);
          if (!cellData) continue;
          if (cellData.chest || cellData.rescue) {
            ctx.fillStyle = cellData.chest ? '#c9a227' : rgb(cellData.rescue);
            ctx.fillRect(px + 2, py + 2, view.cw - 5, view.ch - 5);
            continue;
          }
          const tokens = cellData.tokens || [];
          const tok = tokens[zView] || (showAll ? tokens[tokens.length - 1] : null);
          if (tok) {
            ctx.fillStyle = rgb(tok);
            ctx.fillRect(px + 1, py + 1, view.cw - 3, view.ch - 3);
          }
        }
      }
    } else {
      const jobs = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cell = cellAt(x, y);
          if (!cell) {
            jobs.push({ x, y, z: 0, d: corner(x, y, 0, 0.46, 0.46, 0).d, empty: true });
            continue;
          }
          if (cell.chest || cell.rescue) {
            jobs.push({ x, y, z: 0, d: corner(x, y, 0, 0.46, 0.46, 0).d, cell, special: true });
            continue;
          }
          const tokens = cell.tokens || [];
          for (let z = 0; z < tokens.length; z++) {
            if (!showAll && z !== zView) continue;
            jobs.push({ x, y, z, d: corner(x, y, z, 0.46, 0.46, 0.46).d, cell, token: tokens[z] });
          }
        }
      }
      jobs.sort((a, b) => a.d - b.d);
      for (const job of jobs) {
        if (job.empty) continue;
        if (job.special) {
          const tok = job.cell.chest ? 'd' : job.cell.rescue;
          drawCube(ctx, job.x, job.y, 0, tok, 1, zView === 0);
          const p = corner(job.x, job.y, 0, 0.35, 0.2, 0);
          ctx.fillStyle = '#111';
          ctx.font = '12px sans-serif';
          ctx.fillText(job.cell.chest ? '$' : '@', p.x, p.y);
          continue;
        }
        const highlight = !preview.on && job.z === zView;
        drawCube(ctx, job.x, job.y, job.z, job.token, 1, highlight);
        if (highlight) drawMarks(ctx, job.x, job.y, job.z, job.cell);
      }
      for (const y of irons) {
        const a = corner(0, y, 0, 0, 0.5, 0);
        const b = corner(cols, y, 0, 0, 0.5, 0);
        ctx.strokeStyle = 'rgba(180, 190, 205, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    if (!view.iso) {
      ctx.font = '11px sans-serif';
      for (let y = 0; y < rows; y++) {
        ctx.fillStyle = irons.has(y) ? '#e6b84d' : '#8b93a1';
        ctx.fillText(String(y), 6, (rows - 1 - y) * view.ch + view.ch - 3);
      }
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = gaps.has(x) ? '#e6b84d' : '#8b93a1';
        ctx.fillText(String(x), view.ox + x * view.cw + 2, canvas.height - 6);
      }
    }
    updateStats();
  }

  function updateStats() {
    let depth = 0;
    for (const cell of state.cells) {
      if (!cell) continue;
      depth = Math.max(depth, cell.tokens?.length || 0);
    }
    $('layer').max = String(Math.max(7, depth));
  }

  function pointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x;
      const yi = pts[i].y;
      const xj = pts[j].x;
      const yj = pts[j].y;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function hitCell(sx, sy) {
    const cols = view.cols;
    const rows = view.rows;
    if (!view.iso) {
      const gx = Math.floor((sx - view.ox) / view.cw);
      const gy = rows - 1 - Math.floor(sy / view.ch);
      return { gx, gy, x: sx, y: sy };
    }
    let best = null;
    let bestD = -1e9;
    const zView = state.layer;
    const showAll = $('show-all').checked;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = cellAt(x, y);
        const zs = [];
        if (!cell || cell.chest || cell.rescue) zs.push(0);
        else if (showAll) {
          const tokens = cell.tokens || [];
          if (!tokens.length) zs.push(0);
          else for (let z = 0; z < tokens.length; z++) zs.push(z);
        } else zs.push(zView);
        for (const z of zs) {
          for (const face of FACES) {
            if (camZ(face.n[0], face.n[1], face.n[2]) <= 0.02) continue;
            const pts = face.pts.map(([dx, dy, dz]) => corner(x, y, z, dx, dy, dz));
            if (!pointInPoly(sx, sy, pts)) continue;
            const d = pts.reduce((sum, p) => sum + p.d, 0) / pts.length;
            if (d > bestD) {
              bestD = d;
              best = { gx: x, gy: y, x: sx, y: sy };
            }
          }
        }
      }
    }
    if (best) return best;
    for (let y = 0; y < rows; y++) {
      const p = corner(0, y, 0, -0.35, 0.15, 0);
      if (Math.hypot(sx - p.x, sy - p.y) < 16) return { gx: -1, gy: y, x: sx, y: sy, gutter: 'iron' };
    }
    for (let x = 0; x < cols; x++) {
      const p = corner(x, 0, 0, 0.15, -0.25, 0);
      if (Math.hypot(sx - p.x, sy - p.y) < 16) return { gx: x, gy: -1, x: sx, y: sy, gutter: 'gap' };
    }
    return { gx: -1, gy: -1, x: sx, y: sy };
  }

  function canvasPos(ev) {
    const canvas = $('grid');
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    return hitCell(x, y);
  }

  function bindCanvas() {
    const canvas = $('grid');
    const drag = { mode: null, x: 0, y: 0 };
    let spaceHeld = false;

    function setCursor() {
      canvas.classList.toggle('orbit', spaceHeld || drag.mode === 'orbit' || drag.mode === 'pan');
      canvas.classList.toggle('orbiting', drag.mode === 'orbit' || drag.mode === 'pan');
    }

    function dragMode(ev) {
      if (!view.iso) return 'paint';
      if (ev.button === 2 || (ev.button === 0 && ev.altKey)) return 'orbit';
      if (ev.button === 1 || (ev.button === 0 && spaceHeld)) return 'pan';
      return 'paint';
    }

    function endDrag() {
      drag.mode = null;
      state.painting = false;
      strokeOpen = false;
      setCursor();
    }

    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('pointerdown', (ev) => {
      drag.mode = dragMode(ev);
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      if (drag.mode === 'orbit' || drag.mode === 'pan') {
        ev.preventDefault();
        setCursor();
        return;
      }
      const hit = canvasPos(ev);
      if (hit.gutter === 'iron' && hit.gy >= 0) {
        toggleNum('iron', hit.gy);
        return;
      }
      if (hit.gutter === 'gap' && hit.gx >= 0) {
        toggleNum('gaps', hit.gx);
        return;
      }
      if (hit.gx < 0 || hit.gy < 0) return;
      state.painting = true;
      paintCell(hit.gx, hit.gy);
      draw();
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (drag.mode === 'orbit') {
        view.yaw += (ev.clientX - drag.x) * 0.01;
        view.pitch = Math.max(0.05, Math.min(1.35, view.pitch + (ev.clientY - drag.y) * 0.008));
        drag.x = ev.clientX;
        drag.y = ev.clientY;
        draw();
        return;
      }
      if (drag.mode === 'pan') {
        view.panX += ev.clientX - drag.x;
        view.panY += ev.clientY - drag.y;
        drag.x = ev.clientX;
        drag.y = ev.clientY;
        draw();
        return;
      }
      const hit = canvasPos(ev);
      if (!state.painting) return;
      if (hit.gx < 0 || hit.gy < 0) return;
      paintCell(hit.gx, hit.gy);
      draw();
    });
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (ev) => {
      if (!view.iso) return;
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 0.9 : 1.11;
      view.zoom = Math.max(0.25, Math.min(4, view.zoom * factor));
      draw();
    }, { passive: false });
    window.addEventListener('keydown', (ev) => {
      if (ev.code !== 'Space' || ev.repeat) return;
      if (isTyping(ev)) return;
      spaceHeld = true;
      ev.preventDefault();
      setCursor();
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.code !== 'Space') return;
      spaceHeld = false;
      setCursor();
    });
  }

  function renderTools() {
    const box = $('tools');
    box.innerHTML = '';
    for (const [id, name] of TOOLS) {
      const el = document.createElement('div');
      el.className = `tool${state.tool === id ? ' active' : ''}`;
      el.textContent = name;
      el.onclick = () => { state.tool = id; renderTools(); };
      box.appendChild(el);
    }
  }

  function renderPalette() {
    const box = $('palette');
    box.innerHTML = '';
    const pal = palette();
    for (const t of pal) {
      const el = document.createElement('div');
      el.className = `swatch${state.token === t ? ' active' : ''}`;
      el.style.background = rgb(t);
      el.title = TOKEN_NAME[t] || t;
      el.onclick = () => { state.token = t; renderPalette(); };
      box.appendChild(el);
    }
  }

  function renderUnits() {
    const box = $('units');
    box.innerHTML = '';
    const units = state.raw.units || [];
    units.forEach((u, i) => {
      if (i === BENCH_SEATS) {
        const split = document.createElement('div');
        split.className = 'unit-split';
        split.textContent = '候补 · 上场后按列补位';
        box.appendChild(split);
      }
      const card = document.createElement('div');
      const rank = Math.floor(i / BENCH_COLS);
      card.className = `unit${i < BENCH_COLS ? ' front' : ''}${i >= BENCH_SEATS ? ' reserve' : ''}`;
      card.title = i >= BENCH_SEATS ? `候补 ${i + 1}` : `第 ${rank + 1} 排 · 第 ${(i % BENCH_COLS) + 1} 列`;
      card.innerHTML = `<div class="unit-top">
          <div class="dot" style="background:${rgb(u[0])}">${i + 1}</div>
          <button data-i="${i}" data-k="x" type="button">×</button>
        </div>
        <select data-i="${i}" data-k="c">${ALL.map((t) => `<option value="${t}" ${t === u[0] ? 'selected' : ''}>${TOKEN_NAME[t] || t}</option>`).join('')}</select>
        <input data-i="${i}" data-k="n" type="number" min="1" max="120" value="${u[1]}" />`;
      box.appendChild(card);
    });
    box.onchange = (ev) => {
      const el = ev.target;
      const i = Number(el.dataset.i);
      pushHist();
      if (el.dataset.k === 'c') state.raw.units[i][0] = el.value;
      if (el.dataset.k === 'n') state.raw.units[i][1] = Number(el.value) || 1;
      setDirty(true);
    };
    box.onclick = (ev) => {
      const el = ev.target;
      if (el.dataset.k !== 'x') return;
      pushHist();
      state.raw.units.splice(Number(el.dataset.i), 1);
      renderUnits();
      setDirty(true);
    };
  }

  function collectUnits() {
    return (state.raw.units || []).map((u) => (u[2] ? [u[0], Number(u[1]) || 1, u[2]] : [u[0], Number(u[1]) || 1]));
  }

  function renderLevels() {
    const q = $('search').value.trim().toLowerCase();
    const box = $('levels');
    box.innerHTML = '';
    for (const lv of state.levels) {
      const label = `${lv.id} ${lv.title} ${lv.shape}`;
      if (q && !label.toLowerCase().includes(q)) continue;
      const el = document.createElement('div');
      el.className = `lv${lv.id === state.id ? ' on' : ''}`;
      el.innerHTML = `<span class="id">${lv.id}</span><span>${lv.title} · ${lv.shape}</span>${lv.hand ? '<span class="hand">手改</span>' : ''}`;
      el.onclick = () => loadLevel(lv.id);
      box.appendChild(el);
    }
  }

  function applyRaw(raw, title, shape) {
    state.raw = raw;
    state.cells = decodeRaw(raw);
    state.token = palette()[0] || 'o';
    $('cols').value = raw.cols;
    $('rows').value = raw.rows;
    $('iron').value = (raw.ironRows || []).join(',');
    $('gaps').value = (raw.ironGaps || []).join(',');
    $('title').textContent = `第 ${raw.id} 关 · ${title || ''} · ${shape || ''}`;
    $('layer').value = '0';
    state.layer = 0;
    $('layer-lab').textContent = '0';
    renderPalette();
    renderUnits();
    renderLevels();
    draw();
  }

  function isTyping(ev) {
    const el = ev.target;
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function toggleHelp(on) {
    const box = $('help');
    if (!box) return;
    const show = on == null ? box.classList.contains('hidden') : on;
    box.classList.toggle('hidden', !show);
  }

  function setTool(id) {
    state.tool = id;
    renderTools();
  }

  function setLayer(z) {
    const max = Number($('layer').max) || 7;
    state.layer = Math.max(0, Math.min(max, z | 0));
    $('layer').value = String(state.layer);
    $('layer-lab').textContent = String(state.layer);
    draw();
  }

  function addLayer() {
    if (!state.raw) return;
    const srcZ = state.layer;
    const hits = state.cells.filter((cell) => cell?.tokens?.length && srcZ < cell.tokens.length);
    if (!hits.length) return;
    pushHist();
    for (const cell of hits) {
      const insertAt = srcZ + 1;
      const srcTok = cell.tokens[srcZ];
      if (cell.locked) ensureFlags(cell, 'locked', cell.tokens.length);
      cell.tokens.splice(insertAt, 0, srcTok);
      if (cell.locked) cell.locked.splice(insertAt, 0, !!cell.locked[srcZ]);
    }
    if ($('view-iso')) $('view-iso').checked = true;
    if ($('show-all')) $('show-all').checked = true;
    syncViewButtons();
    setDirty(true);
    setLayer(srcZ + 1);
  }

  function removeLayer() {
    if (!state.raw) return;
    const z = state.layer;
    const hits = [];
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i];
      if (cell?.tokens?.length && z < cell.tokens.length) hits.push(i);
    }
    if (!hits.length) return;
    pushHist();
    for (const i of hits) {
      const cell = state.cells[i];
      cell.tokens.splice(z, 1);
      ['locked'].forEach((k) => cell[k]?.splice(z, 1));
      if (!cell.tokens.length && !cell.chest && !cell.rescue) state.cells[i] = null;
    }
    setDirty(true);
    setLayer(z > 0 ? z - 1 : 0);
  }

  async function api(url, opts) {
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function loadLevel(id) {
    if (state.dirty && !confirm('本关未保存，切换将丢失改动。继续？')) return;
    const data = await api(`/api/level/${id}`);
    state.id = id;
    history.replaceState(null, '', `?id=${id}`);
    setDirty(false);
    applyRaw(data.level, data.title, data.shape);
    resetHist();
    markBaseline();
    $('solve').textContent = '';
    $('solve').className = 'solve';
  }

  async function saveLevel() {
    const raw = encodeRaw();
    const data = await api(`/api/level/${state.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: raw }),
    });
    setDirty(false);
    markBaseline();
    resetHist();
    state.raw.hand = true;
    const item = state.levels.find((l) => l.id === state.id);
    if (item) item.hand = true;
    renderLevels();
    $('solve').textContent = `已保存 砖${data.summary.bricks} 单位${data.summary.units}`;
    $('solve').className = 'solve ok';
  }

  function setSim(text, ok) {
    const el = $('sim');
    if (el) {
      el.textContent = text;
      el.className = ok == null ? 'hint sim' : ok ? 'hint sim ok' : 'hint sim fail';
    }
    $('solve').textContent = text;
    $('solve').className = ok == null ? 'solve' : ok ? 'solve ok' : 'solve fail';
  }

  function simReason(reason, remain) {
    const left = remain != null ? ` 剩${remain}砖` : '';
    if (reason === 'order-slots' || reason === 'stuck-slots' || reason === 'no-empty-can-eat' || reason === 'forced-dead') {
      return `4坑卡死${left}`;
    }
    if (reason === 'order-not-front') return `前排对不上顺序${left}`;
    if (reason === 'no-units') return `单位用尽${left}`;
    if (reason === 'order-max' || reason === 'max-steps') return `步数耗尽${left}`;
    return `${reason || '不过'}${left}`;
  }

  async function solveLevel() {
    setSim('验关中…');
    const data = await api(`/api/level/${state.id}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: encodeRaw() }),
    });
    const ok = data.order.ok || data.greedy.ok;
    const how = data.order.ok ? `顺序可过 ${data.order.steps}步` : data.greedy.ok ? `需策略（贪心 ${data.greedy.steps}步）` : `不过 剩${data.greedy.remain ?? data.order.remain}`;
    setSim(how, ok);
  }

  async function simulateStrict() {
    setSim('模拟中… 4坑·无道具');
    const data = await api(`/api/level/${state.id}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: encodeRaw(), allowUnlock: false }),
    });
    const ok = data.order.ok || data.greedy.ok;
    const how = data.order.ok
      ? `可过 · 按队列顺序 ${data.order.steps}步（4坑·无道具）`
      : data.greedy.ok
        ? `可过 · 需调整上场顺序 ${data.greedy.steps}步（4坑·无道具）`
        : `不过 · ${simReason(data.greedy.reason || data.order.reason, data.greedy.remain ?? data.order.remain)}`;
    setSim(how, ok);
  }

  async function recalc() {
    pushHist();
    const data = await api(`/api/level/${state.id}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: encodeRaw() }),
    });
    state.raw.units = data.units;
    renderUnits();
    setDirty(true);
    setSim(`已分配 ${data.units.length} 只到 4 列席位`);
  }

  async function stamp() {
    pushHist();
    const data = await api(`/api/level/${state.id}/stamp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: encodeRaw(), shapeId: $('shape').value, flip: $('flip').checked }),
    });
    applyRaw({ ...state.raw, cells: data.level.cells }, $('title').textContent, $('shape').selectedOptions[0]?.textContent);
    setDirty(true);
  }

  async function generate() {
    if (!confirm('用生成器重做本关当前造型？不会立刻写盘，可再保存。')) return;
    pushHist();
    const data = await api(`/api/level/${state.id}/generate`, { method: 'POST' });
    applyRaw(data.level, ioTitle(), '');
    setDirty(true);
  }

  function ioTitle() {
    return $('title').textContent;
  }

  const imgState = { rgba: null, width: 0, height: 0 };
  let thumbUrl = '';

  function dropThumbUrl() {
    if (!thumbUrl) return;
    URL.revokeObjectURL(thumbUrl);
    thumbUrl = '';
  }

  function rgbaToB64(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let bin = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  async function fileToRgba(file, maxSide = 320) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(2, Math.round(bmp.width * scale));
    const h = Math.max(2, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const img = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, rgba: img.data };
  }

  function imageOpts() {
    return {
      cols: Number($('img-cols')?.value) || 24,
      rows: Number($('img-rows')?.value) || 24,
      depth: Number($('img-depth')?.value) || 6,
      maxColors: Number($('img-colors')?.value) || 4,
      threshold: Number($('img-threshold')?.value) || 208,
      pad: Number($('img-pad')?.value) || 1,
      mode: $('img-solid')?.checked ? 'solid' : 'round',
    };
  }

  async function generateFromImage(asNew) {
    const opts = imageOpts();
    if (opts.cols < 20) {
      opts.cols = 24;
      if ($('img-cols')) $('img-cols').value = '24';
    }
    if (opts.rows < 20) {
      opts.rows = 24;
      if ($('img-rows')) $('img-rows').value = '24';
    }
    setSim('正在从图片生成方块…');
    const data = await api('/api/from-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...opts,
        sculpt: 'grapes',
        ignoreImage: true,
        width: imgState.width || 32,
        height: imgState.height || 32,
        rgba: imgState.rgba ? rgbaToB64(imgState.rgba) : '',
        id: asNew ? 0 : state.id,
      }),
    });
    const level = data.level;
    if ($('img-cols')) $('img-cols').value = data.stats.cols;
    if ($('img-rows')) $('img-rows').value = data.stats.rows;
    if ($('img-depth')) $('img-depth').value = data.stats.depth;
    if (asNew) {
      const saved = await api('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      state.levels = saved.levels;
      state.id = saved.id;
      history.replaceState(null, '', `?id=${saved.id}`);
      setDirty(false);
      applyRaw(saved.level, '图片生成', 'voxel');
      if ($('view-iso')) $('view-iso').checked = true;
      resetHist();
      markBaseline();
      setSim(`已新建第 ${saved.id} 关 · ${data.stats.voxels} 块 · ${data.stats.colors} 色`, true);
      openPreview();
      return;
    }
    pushHist();
    level.id = state.id;
    applyRaw(level, '图片生成', 'voxel');
    if ($('view-iso')) $('view-iso').checked = true;
    setDirty(true);
    setSim(`已生成到本关 · ${data.stats.voxels} 块 · ${data.stats.colors} 色。预览为游戏内效果`, true);
    openPreview();
  }

  function bindImage() {
    const file = $('img-file');
    const thumb = $('img-thumb');
    const name = $('img-name');
    if (!file) return;
    $('btn-img-pick').onclick = () => file.click();
    $('btn-img-clear').onclick = () => {
      imgState.rgba = null;
      imgState.width = 0;
      imgState.height = 0;
      file.value = '';
      dropThumbUrl();
      thumb.classList.add('hidden');
      thumb.removeAttribute('src');
      name.textContent = '选一张正面图，白底最好。';
    };
    file.onchange = async () => {
      const picked = file.files?.[0];
      if (!picked) return;
      try {
        const decoded = await fileToRgba(picked);
        imgState.rgba = decoded.rgba;
        imgState.width = decoded.width;
        imgState.height = decoded.height;
        if ($('img-cols') && $('img-rows')) {
          const cols = Math.max(24, Number($('img-cols').value) || 24);
          const rows = Math.max(20, Math.min(32, Math.round(cols * decoded.height / decoded.width)));
          $('img-cols').value = String(cols);
          $('img-rows').value = String(rows);
        }
        dropThumbUrl();
        thumbUrl = URL.createObjectURL(picked);
        thumb.src = thumbUrl;
        thumb.classList.remove('hidden');
        name.textContent = `${picked.name} · ${decoded.width}×${decoded.height}`;
      } catch (err) {
        showErr(err);
      }
    };
    const syncLab = (id, lab) => {
      if ($(id) && $(lab)) $(lab).textContent = $(id).value;
    };
    if ($('img-threshold')) {
      $('img-threshold').oninput = () => syncLab('img-threshold', 'img-threshold-lab');
    }
    if ($('img-pad')) {
      $('img-pad').oninput = () => syncLab('img-pad', 'img-pad-lab');
    }
    $('btn-img-gen').onclick = () => generateFromImage(false).catch(showErr);
    $('btn-img-new').onclick = () => generateFromImage(true).catch(showErr);
  }

  function resizeGrid() {
    pushHist();
    const cols = Math.max(8, Math.min(36, Number($('cols').value) || state.raw.cols));
    const rows = Math.max(8, Math.min(32, Number($('rows').value) || state.raw.rows));
    const next = Array.from({ length: cols * rows }, () => null);
    for (let y = 0; y < Math.min(rows, state.raw.rows); y++) {
      for (let x = 0; x < Math.min(cols, state.raw.cols); x++) {
        next[y * cols + x] = state.cells[y * state.raw.cols + x] || null;
      }
    }
    state.raw.cols = cols;
    state.raw.rows = rows;
    state.cells = next;
    setDirty(true);
    draw();
  }

  function bind() {
    renderTools();
    $('search').oninput = renderLevels;
    $('layer').oninput = () => {
      state.layer = Number($('layer').value) || 0;
      $('layer-lab').textContent = String(state.layer);
      draw();
    };
    if ($('btn-add-layer')) $('btn-add-layer').onclick = addLayer;
    if ($('btn-del-layer')) $('btn-del-layer').onclick = removeLayer;
    $('show-all').onchange = draw;
    if ($('view-iso')) {
      $('view-iso').onchange = () => {
        syncViewButtons();
        draw();
      };
    }
    $('btn-save').onclick = () => saveLevel().catch(showErr);
    $('btn-solve').onclick = () => solveLevel().catch(showErr);
    $('btn-units').onclick = () => recalc().catch(showErr);
    if ($('btn-auto-units')) $('btn-auto-units').onclick = () => recalc().catch(showErr);
    if ($('btn-sim')) $('btn-sim').onclick = () => simulateStrict().catch(showErr);
    $('btn-stamp').onclick = () => stamp().catch(showErr);
    $('btn-gen').onclick = () => generate().catch(showErr);
    $('btn-resize').onclick = resizeGrid;
    $('btn-clear').onclick = () => {
      pushHist();
      state.cells = state.cells.map(() => null);
      setDirty(true);
      draw();
    };
    $('btn-add-color').onclick = () => {
      const pal = palette();
      const next = ALL.find((t) => !pal.includes(t));
      if (!next) return;
      pushHist();
      pal.push(next);
      state.raw.palette = pal.join('');
      state.token = next;
      renderPalette();
      setDirty(true);
    };
    $('btn-del-color').onclick = () => {
      const pal = palette();
      if (pal.length <= 1) return;
      pushHist();
      pal.pop();
      state.raw.palette = pal.join('');
      state.token = pal[0];
      renderPalette();
      setDirty(true);
    };
    $('btn-add-unit').onclick = () => {
      pushHist();
      state.raw.units = state.raw.units || [];
      state.raw.units.push([state.token, 60]);
      renderUnits();
      setDirty(true);
    };
    $('iron').onchange = () => { pushHist(); setDirty(true); draw(); };
    $('gaps').onchange = () => { pushHist(); setDirty(true); draw(); };
    $('btn-prev').onclick = () => loadLevel(Math.max(1, state.id - 1));
    $('btn-next').onclick = () => loadLevel(Math.min(state.levels.length || 1, state.id + 1));
    bindImage();
    if ($('btn-undo')) $('btn-undo').onclick = undo;
    if ($('btn-redo')) $('btn-redo').onclick = redo;
    if ($('btn-revert')) $('btn-revert').onclick = revertAll;
    if ($('btn-flat')) $('btn-flat').onclick = setFlatView;
    if ($('btn-cam')) $('btn-cam').onclick = resetCam;
    bindPreview();
    syncViewButtons();
    if ($('btn-help')) $('btn-help').onclick = () => toggleHelp();
    if ($('btn-help-close')) $('btn-help-close').onclick = () => toggleHelp(false);
    if ($('help')) {
      $('help').onclick = (ev) => {
        if (ev.target === $('help')) toggleHelp(false);
      };
    }
    const requestDraw = () => {
      if (requestDraw.pending) return;
      requestDraw.pending = true;
      requestAnimationFrame(() => {
        requestDraw.pending = false;
        draw();
      });
    };
    window.addEventListener('resize', requestDraw);
    document.addEventListener('fullscreenchange', requestDraw);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', requestDraw);
    const wrap = $('grid') && $('grid').parentElement;
    if (wrap && typeof ResizeObserver === 'function') {
      new ResizeObserver(requestDraw).observe(wrap);
    }
    window.addEventListener('keydown', (ev) => {
      const key = ev.key;
      const cmd = ev.ctrlKey || ev.metaKey;
      if (cmd && (key === 's' || key === 'S')) {
        ev.preventDefault();
        saveLevel().catch(showErr);
        return;
      }
      if (cmd && (key === 'z' || key === 'Z')) {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      if (cmd && (key === 'y' || key === 'Y')) {
        ev.preventDefault();
        redo();
        return;
      }
      if (cmd && key === 'Enter') {
        ev.preventDefault();
        solveLevel().catch(showErr);
        return;
      }
      if (isTyping(ev)) return;
      if (key === '?' || (ev.shiftKey && ev.code === 'Slash')) {
        ev.preventDefault();
        toggleHelp();
        return;
      }
      if (key === 'Escape') {
        if (preview.on) {
          closePreview();
          return;
        }
        toggleHelp(false);
        return;
      }
      if (key === 'v' || key === 'V') {
        ev.preventDefault();
        if (preview.on) closePreview();
        else openPreview();
        return;
      }
      const tools = {
        b: 'paint', e: 'erase', g: 'fill', n: 'lock',
        c: 'chest', q: 'rescue', i: 'iron', p: 'gap',
      };
      const tool = tools[key.toLowerCase()];
      if (tool) {
        ev.preventDefault();
        setTool(tool);
        return;
      }
      if (key >= '1' && key <= '9') {
        const pal = palette();
        const tok = pal[Number(key) - 1];
        if (tok) {
          state.token = tok;
          renderPalette();
        }
        return;
      }
      if (key === '[' || key === '{') {
        ev.preventDefault();
        setLayer(state.layer - 1);
        return;
      }
      if (key === ']' || key === '}') {
        ev.preventDefault();
        setLayer(state.layer + 1);
        return;
      }
      if (key === 'f' || key === 'F') {
        ev.preventDefault();
        setFlatView();
        return;
      }
      if (key === 'r' || key === 'R') {
        ev.preventDefault();
        resetCam();
        return;
      }
      if (key === 'ArrowLeft') {
        ev.preventDefault();
        view.yaw -= 0.12;
        draw();
        return;
      }
      if (key === 'ArrowRight') {
        ev.preventDefault();
        view.yaw += 0.12;
        draw();
        return;
      }
      if (key === 'ArrowUp') {
        ev.preventDefault();
        view.pitch = Math.max(0.05, view.pitch - 0.08);
        draw();
        return;
      }
      if (key === 'ArrowDown') {
        ev.preventDefault();
        view.pitch = Math.min(1.35, view.pitch + 0.08);
        draw();
        return;
      }
      if (key === '=' || key === '+') {
        ev.preventDefault();
        view.zoom = Math.min(4, view.zoom * 1.11);
        draw();
        return;
      }
      if (key === '-' || key === '_') {
        ev.preventDefault();
        view.zoom = Math.max(0.25, view.zoom * 0.9);
        draw();
        return;
      }
    });
    bindCanvas();
  }

  function showErr(err) {
    $('solve').textContent = String(err.message || err);
    $('solve').className = 'solve fail';
  }

  async function boot() {
    bind();
    const [levels, shapes] = await Promise.all([
      api('/api/levels'),
      api('/api/shapes'),
    ]);
    state.levels = levels.levels;
    state.shapes = shapes.shapes;
    const sel = $('shape');
    sel.innerHTML = state.shapes.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
    const want = Number(new URLSearchParams(location.search).get('id')) || 1;
    await loadLevel(want);
  }

  boot().catch(showErr);
})();
