import { _decorator, Color, Component, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { applyArtSpriteSoon } from './UiArt';

const { ccclass } = _decorator;

export type RankEntry = {
  rank: number;
  level: number;
  name: string;
  isSelf?: boolean;
  avatarFrame?: SpriteFrame | null;
  plate?: Color;
};

const NAME_INK = new Color(90, 130, 190, 255);
const SCORE_INK = new Color(44, 58, 80, 255);
const DEFAULT_PLATE = new Color(198, 226, 96, 255);
const PLATES = [
  new Color(244, 176, 188, 255),
  new Color(154, 220, 228, 255),
  new Color(196, 176, 226, 255),
  new Color(210, 228, 118, 255),
  new Color(198, 226, 96, 255),
];

const ROW_W = 760;
const SELF_H = 119;
const ROW_H = 114;
const MEDAL_W = 76;
const MEDAL_H = 103;
const NUM = 66;
const AVATAR = 88;

export function plateForRank(rank: number, isSelf = false): Color {
  if (isSelf) return DEFAULT_PLATE.clone();
  if (rank >= 1 && rank <= 4) return PLATES[rank - 1].clone();
  return PLATES[(Math.max(1, rank) - 1) % PLATES.length].clone();
}

@ccclass('RankingItem')
export class RankingItem extends Component {
  bind(entry: RankEntry): void {
    const medal = entry.rank >= 1 && entry.rank <= 3;
    this._show('Bg', !!entry.isSelf);
    this._show('RankMedal', medal);
    this._show('RankNum', !medal);
    this.node.getComponent(UITransform)?.setContentSize(ROW_W, entry.isSelf ? SELF_H : ROW_H);

    const name = this._lab('Info/Name');
    if (name) {
      name.string = entry.name;
      name.color = NAME_INK;
      name.isBold = true;
      name.enableOutline = false;
    }
    const level = this._lab('Info/Level') ?? this._lab('Info/Score');
    if (level) {
      level.string = `Level ${Math.max(1, Math.floor(entry.level))}`;
      level.color = SCORE_INK;
      level.isBold = true;
      level.enableOutline = false;
    }
    const rankLab = this._lab('RankNum/Label');
    if (rankLab) {
      rankLab.string = String(entry.rank);
      rankLab.fontSize = entry.rank >= 100 ? 22 : 28;
      rankLab.lineHeight = rankLab.fontSize + 6;
    }

    const plate = this.node.getChildByPath('AvatarBox/Plate')?.getComponent(Sprite);
    if (plate) plate.color = entry.plate ?? plateForRank(entry.rank, !!entry.isSelf);
    if (entry.avatarFrame) this.setAvatar(entry.avatarFrame);
    this.applyArt(entry.rank);
  }

  /** WeChat avatar sprite. Leave unset until login is wired. */
  setAvatar(sf: SpriteFrame | null): void {
    const avatar = this.node.getChildByPath('AvatarBox/Clip/Avatar')?.getComponent(Sprite);
    if (!avatar || !sf) return;
    avatar.spriteFrame = sf;
    avatar.getComponent(UITransform)?.setContentSize(AVATAR, AVATAR);
  }

  applyArt(rank = 0): void {
    applyArtSpriteSoon(this._n('Bg'), 'rankItemBg', ROW_W, SELF_H);
    applyArtSpriteSoon(this.node.getChildByPath('RankNum/Skin'), 'rankNumBg', NUM, NUM);
    applyArtSpriteSoon(this.node.getChildByPath('AvatarBox/Plate'), 'rankAvatarPlate', AVATAR, AVATAR);
    const medalKey = rank === 1 ? 'rankGold' : rank === 2 ? 'rankSilver' : rank === 3 ? 'rankBronze' : null;
    if (medalKey) applyArtSpriteSoon(this._n('RankMedal'), medalKey, MEDAL_W, MEDAL_H);
    const avatar = this.node.getChildByPath('AvatarBox/Clip/Avatar');
    const sp = avatar?.getComponent(Sprite);
    if (!sp?.spriteFrame) applyArtSpriteSoon(avatar, 'rankAvatar', AVATAR, AVATAR);
  }

  private _n(name: string): Node | null {
    return this.node.getChildByName(name);
  }

  private _show(name: string, on: boolean): void {
    const n = this._n(name);
    if (n) n.active = on;
  }

  private _lab(path: string): Label | null {
    return this.node.getChildByPath(path)?.getComponent(Label) ?? null;
  }
}
