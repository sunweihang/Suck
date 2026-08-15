import { _decorator, Component, MeshRenderer } from 'cc';
import { bindOctopusMeshes, bindToyMesh, preloadToyMeshes } from './ToyMeshBank';

const { ccclass, property } = _decorator;

@ccclass('BakedMesh')
export class BakedMesh extends Component {
  @property
  kind = 0;

  onLoad(): void {
    if (this._bind()) return;
    void preloadToyMeshes().then(() => {
      if (this.isValid) this._bind();
    });
  }

  private _bind(): boolean {
    if (this.kind === 1) return bindOctopusMeshes(this.node);
    return bindToyMesh(this.getComponent(MeshRenderer), 'block', false);
  }
}
