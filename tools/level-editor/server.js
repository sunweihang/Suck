'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const io = require('../level-io');
const { shapeForLevel, THEMES } = require('../level-shapes');
const { generateFresh, encodeLevel, recalcUnits } = require('../bake-levels');
const { solveInOrder, solveLevel } = require('../solve-levels');
const imageVoxel = require('../image-voxel');

const PORT = Number(process.env.LEVEL_EDITOR_PORT) || 3780;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 12 * 1024 * 1024) {
        reject(new Error('请求过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseId(url) {
  const m = String(url).match(/\/level\/(\d+)/);
  const cap = Math.max(1, io.levelCount());
  return m ? Math.max(1, Math.min(cap, Number(m[1]) || 1)) : 1;
}

function nextLevelId() {
  const pack = io.loadCatalogPack();
  let max = 0;
  for (const lv of pack.levels || []) max = Math.max(max, lv.id | 0);
  return Math.max(io.levelCount(), max) + 1;
}

function persistLevel(raw) {
  const packed = imageVoxel.cellsToPacked(raw, io.decodeCell);
  if (packed.length) raw.voxels = packed;
  io.saveOverride(raw.id, raw);
  io.patchCatalogLevel(raw);
}

function listLevels() {
  const pack = io.loadCatalogPack();
  const out = [];
  for (let id = 1; id <= io.LEVEL_COUNT; id++) {
    const hand = io.loadOverride(id);
    const raw = hand || (pack.levels || []).find((lv) => lv.id === id) || (pack.levels || [])[id - 1];
    const shape = shapeForLevel(id);
    const sum = raw ? io.summarizeRaw(raw) : { id, cols: 0, rows: 0, bricks: 0, units: 0, palette: '', hand: false };
    out.push({
      id,
      title: io.levelTitle(id),
      shape: shape.name,
      hand: !!hand,
      cols: sum.cols,
      rows: sum.rows,
      bricks: sum.bricks,
      units: sum.units,
      palette: sum.palette,
    });
  }
  return out;
}

function listShapes() {
  const out = [];
  for (const theme of THEMES) {
    for (const shape of theme) {
      out.push({ id: shape.id, name: shape.name });
    }
  }
  return out;
}

function stampOnto(raw, shapeId, flip) {
  const { cols, rows, palette } = raw;
  const shape = listShapes().find((s) => s.id === shapeId) || shapeForLevel(raw.id);
  const all = THEMES.flat();
  const found = all.find((s) => s.id === (shape.id || shapeId)) || all[0];
  const c = { cols, rows, g: new Array(cols * rows).fill('.') };
  found.paint(c, !!flip);
  const pal = typeof palette === 'string' ? [...palette] : [...(palette || ['o'])];
  const accent = { L: pal[1] || pal[0], T: pal[2] || pal[0], E: pal[3] || pal[0], H: pal[1] || pal[0], N: pal[2] || pal[0], R: pal[3] || pal[0], W: pal[4] || pal[1] || pal[0] };
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = c.g[y * cols + x];
      if (!ch || ch === '.') {
        cells.push(null);
        continue;
      }
      const token = ch === '#' ? pal[0] : (accent[ch] || pal[0]);
      cells.push(token);
    }
  }
  raw.cells = cells;
  return raw;
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (url === '/api/levels' && req.method === 'GET') {
    send(res, 200, { levels: listLevels() });
    return;
  }
  if (url === '/api/shapes' && req.method === 'GET') {
    send(res, 200, { shapes: listShapes() });
    return;
  }
  if (url.startsWith('/api/level/') && req.method === 'GET') {
    const id = parseId(url);
    const raw = imageVoxel.expandLevelForEditor(io.loadCatalogLevel(id));
    raw.id = id;
    raw.hand = io.hasOverride(id);
    send(res, 200, { level: raw, summary: io.summarizeRaw(raw), title: io.levelTitle(id), shape: shapeForLevel(id).name });
    return;
  }
  if (url.startsWith('/api/level/') && req.method === 'PUT') {
    const id = parseId(url);
    const body = await readBody(req);
    const raw = { ...(body.level || body), id, hand: true };
    if (!Array.isArray(raw.cells) || !raw.cols || !raw.rows) {
      send(res, 400, { error: '缺少 cols/rows/cells' });
      return;
    }
    persistLevel(raw);
    send(res, 200, { ok: true, summary: io.summarizeRaw(raw) });
    return;
  }
  if (url === '/api/from-image' && req.method === 'POST') {
    const body = await readBody(req);
    const made = imageVoxel.generateFromRgba(body.rgba, body.width, body.height, {
      cols: body.cols,
      rows: body.rows,
      depth: body.depth,
      threshold: body.threshold,
      maxColors: body.maxColors,
      pad: body.pad,
      mode: body.mode,
      sculpt: body.sculpt,
      ignoreImage: body.ignoreImage,
      id: body.id || 0,
    });
    send(res, 200, { level: made.level, stats: made.stats });
    return;
  }
  if (url === '/api/levels' && req.method === 'POST') {
    const body = await readBody(req);
    const id = nextLevelId();
    const raw = { ...(body.level || body), id, hand: true };
    if (!Array.isArray(raw.cells) || !raw.cols || !raw.rows) {
      send(res, 400, { error: '缺少 cols/rows/cells' });
      return;
    }
    persistLevel(raw);
    send(res, 200, { id, level: raw, summary: io.summarizeRaw(raw), levels: listLevels() });
    return;
  }
  if (url.startsWith('/api/level/') && url.endsWith('/solve') && req.method === 'POST') {
    const id = parseId(url);
    const body = await readBody(req);
    const raw = body.level || io.loadCatalogLevel(id);
    const level = io.decodeLevel({ ...raw, id });
    const allowUnlock = body.allowUnlock !== false;
    const opts = { allowUnlock };
    const ordered = solveInOrder(level, opts);
    const greedy = ordered.ok ? { ok: true, steps: ordered.steps } : solveLevel(level, opts);
    send(res, 200, {
      allowUnlock,
      order: { ok: !!ordered.ok, steps: ordered.steps, reason: ordered.reason, remain: ordered.remain },
      greedy: { ok: !!greedy.ok, steps: greedy.steps, reason: greedy.reason, remain: greedy.remain },
    });
    return;
  }
  if (url.startsWith('/api/level/') && url.endsWith('/units') && req.method === 'POST') {
    const id = parseId(url);
    const body = await readBody(req);
    const raw = body.level || io.loadCatalogLevel(id);
    const level = io.decodeLevel({ ...raw, id });
    const units = recalcUnits(level);
    send(res, 200, { units });
    return;
  }
  if (url.startsWith('/api/level/') && url.endsWith('/stamp') && req.method === 'POST') {
    const id = parseId(url);
    const body = await readBody(req);
    const raw = body.level || io.loadCatalogLevel(id);
    stampOnto(raw, body.shapeId, body.flip);
    send(res, 200, { level: raw });
    return;
  }
  if (url.startsWith('/api/level/') && url.endsWith('/generate') && req.method === 'POST') {
    const id = parseId(url);
    const level = generateFresh(id);
    const raw = encodeLevel(level);
    send(res, 200, { level: raw, summary: io.summarizeRaw(raw) });
    return;
  }

  send(res, 404, { error: 'not found' });
}

function serveStatic(req, res, url) {
  let rel = url.split('?')[0];
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    send(res, 403, 'forbidden', 'text/plain');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, 'not found', 'text/plain');
    return;
  }
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  try {
    if (url.startsWith('/api/')) {
      await handleApi(req, res, url.split('?')[0]);
      return;
    }
    serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err) });
  }
});

function openBrowser(target) {
  if (process.env.LEVEL_EDITOR_NO_OPEN) return;
  const plat = process.platform;
  if (plat === 'win32') spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
  else if (plat === 'darwin') spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
}

if (require.main === module) {
  const id = Number(process.argv[2]) || 0;
  server.listen(PORT, '127.0.0.1', () => {
    const url = id > 0 ? `http://127.0.0.1:${PORT}/?id=${id}` : `http://127.0.0.1:${PORT}/`;
    console.log(`关卡编辑器 ${url}`);
    openBrowser(url);
  });
}

module.exports = { server, PORT };
