import { AssetManager, assetManager, Prefab } from 'cc';

let _job: Promise<void> | null = null;

function loadOne(name: string): Promise<AssetManager.Bundle> {
  return new Promise((resolve, reject) => {
    const existing = assetManager.getBundle(name);
    if (existing) {
      resolve(existing);
      return;
    }
    assetManager.loadBundle(name, (err, bundle) => {
      if (err || !bundle) {
        reject(err ?? new Error(`bundle ${name} missing`));
        return;
      }
      resolve(bundle);
    });
  });
}

function loadDir(bundle: AssetManager.Bundle, dir = ''): Promise<void> {
  return new Promise((resolve) => {
    bundle.loadDir(dir, (err) => {
      if (err) console.warn('[Suck] pack dir', bundle.name, dir || '/', err);
      resolve();
    });
  });
}

export type PackProgress = (progress: number, tip: string) => void;

export function openResourcesBundle(): Promise<AssetManager.Bundle> {
  return loadOne('resources');
}

/** Load WeChat subpackages, then pull every prefab + mesh in `prefabs`. */
export function loadGameBundles(onProgress?: PackProgress): Promise<void> {
  if (_job) return _job;
  _job = (async () => {
    const report = (p: number, tip: string) => onProgress?.(p, tip);
    report(0.2);
    await loadOne('resources');
    await loadOne('prefabs');
    const prefabs = assetManager.getBundle('prefabs');
    if (prefabs) {
      const dirs = ['models', 'materials', 'blocks', 'units', 'board', 'fx', 'ui'];
      for (let i = 0; i < dirs.length; i++) {
        report(0.32 + (i / dirs.length) * 0.28);
        await loadDir(prefabs, dirs[i]);
      }
    }
    const resources = assetManager.getBundle('resources');
    if (resources) {
      report(0.64);
      // Levels are sharded and pulled on demand in LevelCatalog. loadDir('')
      // would JSON.parse all 43 shards (~10MB) and undo that split.
      await Promise.all(['ui', 'audio', 'toys', 'meshes', 'fx'].map((dir) => loadDir(resources, dir)));
    }
    report(0.7);
  })().catch((err) => {
    _job = null;
    throw err;
  });
  return _job;
}

export function prefabBundle(): AssetManager.Bundle | null {
  return assetManager.getBundle('prefabs');
}

export function loadPrefabFromPack(path: string): Promise<Prefab | null> {
  const bundle = prefabBundle();
  if (!bundle || !path) return Promise.resolve(null);
  try {
    const cached = bundle.get(path, Prefab);
    if (cached) return Promise.resolve(cached);
  } catch {
    /* not in cache yet */
  }
  return new Promise((resolve) => {
    bundle.load(path, Prefab, (err, asset) => {
      if (!err && asset) {
        resolve(asset);
        return;
      }
      bundle.load(path, (err2, asset2) => {
        resolve(!err2 && asset2 ? (asset2 as Prefab) : null);
      });
    });
  });
}
