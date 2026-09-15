import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import { protocol } from 'electron';
import { discoverLcuConnection, type LcuConnection } from './discovery';

interface AssetData { body: Buffer; contentType: string }
type Discover = () => Promise<LcuConnection | null>;
type Load = (connection: LcuConnection, path: string) => Promise<AssetData | null>;

export function lcuAssetPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'lol-asset:') return null;
    if (url.hostname === 'champion-icons') {
      const match = /^\/(\d+)\.png$/.exec(url.pathname);
      return match ? `/lol-game-data/assets/v1/champion-icons/${match[1]}.png` : null;
    }
    if (url.hostname === 'profile-icons') {
      const match = /^\/(\d+)\.jpg$/.exec(url.pathname);
      return match ? `/lol-game-data/assets/v1/profile-icons/${match[1]}.jpg` : null;
    }
    if (url.hostname === 'spell-icons') {
      const match = /^\/([a-z0-9_]+\.png)$/.exec(url.pathname);
      return match ? `/lol-game-data/assets/DATA/Spells/Icons2D/${match[1]}` : null;
    }
    if (url.hostname === 'game-data') {
      const path = decodeURIComponent(url.pathname.slice(1));
      return path.startsWith('/lol-game-data/assets/')
        && !path.includes('..')
        && /^\/[A-Za-z0-9_./-]+$/.test(path)
        ? path
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

function contentTypeFor(path: string): string {
  return path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg'
    : 'image/png';
}

function responseFor(asset: AssetData, cache: 'memory' | 'disk' | 'lcu'): Response {
  return new Response(Uint8Array.from(asset.body), {
    status: 200,
    headers: {
      'Content-Type': asset.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-LOL-Viewer-Cache': cache
    }
  });
}

export function fixtureAssetResponse(rawUrl: string): Response {
  const path = lcuAssetPath(rawUrl);
  if (!path) return new Response(null, { status: 404 });
  const seed = [...path].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 360, 0);
  const id = /(?:champion-icons|profile-icons)\/(\d+)/.exec(path)?.[1]
    ?? /Items\/Icons2D\/(\d+)/i.exec(path)?.[1]
    ?? '';
  const kind = path.includes('/champion-icons/') ? 'champion'
    : path.includes('/profile-icons/') ? 'profile'
      : path.includes('/Spells/') ? 'spell' : 'item';
  const symbol = kind === 'spell'
    ? '<path d="M38 8 19 34h13l-3 22 19-28H35l3-20Z" fill="#fff5b8"/>'
    : kind === 'item'
      ? '<path d="m32 8 20 16-8 28H20L12 24 32 8Z" fill="none" stroke="#fff4c2" stroke-width="5"/><path d="m20 25 24 18M44 25 20 43" stroke="#fff4c2" stroke-width="3"/>'
      : '<path d="M17 50c2-13 7-20 15-20s13 7 15 20" fill="#ccecff"/><circle cx="32" cy="22" r="11" fill="#e9f7ff"/><path d="m17 19 7-13 8 8 8-8 7 13" fill="none" stroke="#ffe08a" stroke-width="4"/>';
  const label = id ? `<text x="53" y="58" text-anchor="end" fill="white" font-family="Arial,sans-serif" font-size="12" font-weight="700">${id}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${seed} 62% 40%)"/><stop offset="1" stop-color="hsl(${(seed + 52) % 360} 74% 18%)"/></linearGradient></defs><rect width="64" height="64" rx="9" fill="url(#g)"/>${symbol}${label}</svg>`;
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}

async function loadAsset(connection: LcuConnection, path: string): Promise<AssetData | null> {
  return new Promise((resolve) => {
    const authorization = Buffer.from(`riot:${connection.password}`).toString('base64');
    const request = httpsRequest({
      protocol: 'https:', hostname: '127.0.0.1', port: connection.port,
      method: 'GET', path, rejectUnauthorized: false,
      headers: { Authorization: `Basic ${authorization}` }
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes <= 1024 * 1024) chunks.push(buffer);
      });
      response.on('end', () => {
        if (response.statusCode !== 200 || bytes > 1024 * 1024) {
          resolve(null);
          return;
        }
        resolve({
          body: Buffer.concat(chunks),
          contentType: response.headers['content-type'] ?? contentTypeFor(path)
        });
      });
      response.on('error', () => resolve(null));
    });
    request.on('error', () => resolve(null));
    request.setTimeout(5_000, () => request.destroy());
    request.end();
  });
}

export function createLcuAssetHandler(options: {
  cacheDirectory: string;
  discover?: Discover;
  load?: Load;
}): (rawUrl: string) => Promise<Response> {
  const discover = options.discover ?? discoverLcuConnection;
  const load = options.load ?? loadAsset;
  const memory = new Map<string, AssetData>();
  const inFlight = new Map<string, Promise<AssetData | null>>();
  let connectionPromise: Promise<LcuConnection | null> | undefined;
  let cacheDirectoryPromise: Promise<void> | undefined;
  let activeLoads = 0;
  const waitingLoads: Array<() => void> = [];

  const limitedLoad = async (connection: LcuConnection, path: string): Promise<AssetData | null> => {
    if (activeLoads >= 6) await new Promise<void>((resolve) => waitingLoads.push(resolve));
    activeLoads += 1;
    try {
      return await load(connection, path);
    } finally {
      activeLoads -= 1;
      waitingLoads.shift()?.();
    }
  };

  const getConnection = async (): Promise<LcuConnection | null> => {
    if (!connectionPromise) connectionPromise = Promise.resolve(discover()).catch(() => null);
    const current = connectionPromise;
    const connection = await current;
    if (!connection && connectionPromise === current) connectionPromise = undefined;
    return connection;
  };

  const cacheFile = (path: string): string =>
    join(options.cacheDirectory, `${createHash('sha256').update(path).digest('hex')}.bin`);

  const remember = (path: string, asset: AssetData): void => {
    if (memory.size >= 512) memory.delete(memory.keys().next().value as string);
    memory.set(path, asset);
  };

  const readDisk = async (path: string): Promise<AssetData | null> => {
    try {
      return { body: await fs.readFile(cacheFile(path)), contentType: contentTypeFor(path) };
    } catch {
      return null;
    }
  };

  const writeDisk = async (path: string, asset: AssetData): Promise<void> => {
    try {
      cacheDirectoryPromise ??= fs.mkdir(options.cacheDirectory, { recursive: true }).then(() => undefined);
      await cacheDirectoryPromise;
      await fs.writeFile(cacheFile(path), asset.body);
    } catch {
      // Disk caching is an optimization; image delivery must still succeed.
    }
  };

  const resolveAsset = async (path: string): Promise<AssetData | null> => {
    const disk = await readDisk(path);
    if (disk) {
      remember(path, disk);
      return disk;
    }
    const connection = await getConnection();
    if (!connection) return null;
    const asset = await limitedLoad(connection, path);
    if (!asset) {
      connectionPromise = undefined;
      return null;
    }
    remember(path, asset);
    await writeDisk(path, asset);
    return asset;
  };

  return async (rawUrl: string): Promise<Response> => {
    const path = lcuAssetPath(rawUrl);
    if (!path) return new Response(null, { status: 404 });
    const cached = memory.get(path);
    if (cached) return responseFor(cached, 'memory');

    let pending = inFlight.get(path);
    if (!pending) {
      pending = resolveAsset(path);
      inFlight.set(path, pending);
    }
    try {
      const asset = await pending;
      if (!asset) return new Response(null, { status: 503 });
      return responseFor(asset, memory.has(path) ? 'lcu' : 'disk');
    } finally {
      if (inFlight.get(path) === pending) inFlight.delete(path);
    }
  };
}

export function registerLcuAssetProtocol(cacheDirectory: string, fixtureMode = false): void {
  if (fixtureMode) {
    protocol.handle('lol-asset', (request) => Promise.resolve(fixtureAssetResponse(request.url)));
    return;
  }
  const handle = createLcuAssetHandler({ cacheDirectory });
  protocol.handle('lol-asset', (request) => handle(request.url));
}
