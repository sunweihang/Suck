import type { IncomingMessage, ServerResponse } from 'node:http';
import { Err, type ApiErr, type ApiOk } from './types.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

export function send<T>(res: ServerResponse, status: number, body: ApiOk<T> | ApiErr): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    ...CORS,
  });
  res.end(json);
}

export function ok<T>(res: ServerResponse, data: T, status = 200): void {
  send(res, status, { errcode: 0, errmsg: 'ok', data });
}

export function fail(res: ServerResponse, errcode: number, errmsg: string, http = 400): void {
  send(res, http, { errcode, errmsg });
}

export function preflight(res: ServerResponse): void {
  res.writeHead(204, { ...CORS });
  res.end();
}

export function readToken(req: IncomingMessage): string {
  const raw = String(req.headers.authorization || '');
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || '').trim();
}

export async function readJson(req: IncomingMessage, limit = 32 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += buf.length;
    if (n > limit) throw new Error('body too large');
    chunks.push(buf);
  }
  if (!n) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function pathOf(req: IncomingMessage): string {
  const host = req.headers.host || 'localhost';
  try {
    return new URL(req.url || '/', `http://${host}`).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
}

export function methodOf(req: IncomingMessage): string {
  return (req.method || 'GET').toUpperCase();
}

export function badJson(res: ServerResponse): void {
  fail(res, Err.BAD_REQUEST, 'JSON 无效');
}
