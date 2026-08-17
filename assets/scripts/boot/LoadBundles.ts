import { AssetManager, assetManager } from 'cc';

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

/** resources + prefabs are WeChat subpackages; must be loaded before UUID / resources.load. */
export function loadGameBundles(): Promise<void> {
  return Promise.all([loadOne('resources'), loadOne('prefabs')]).then(() => undefined);
}
