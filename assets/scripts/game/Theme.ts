import { Color } from 'cc';
import { DESIGN_H, DESIGN_W } from './PortraitFit';

export { DESIGN_H, DESIGN_W };

export const Theme = {
  ink: new Color(18, 36, 48, 255),
  veil: new Color(12, 28, 40, 120),
  title: new Color(255, 248, 230, 255),
  subtitle: new Color(40, 70, 88, 230),
  playFill: new Color(245, 165, 74, 255),
  playText: new Color(42, 28, 16, 255),
  playStroke: new Color(255, 230, 170, 255),
  settingsFill: new Color(36, 58, 72, 230),
  settingsText: new Color(230, 244, 248, 255),
  panel: new Color(20, 40, 54, 235),
  dim: new Color(70, 100, 116, 220),
  ground: new Color(142, 200, 224, 255),
  orange: new Color(255, 132, 28, 255),
  yellow: new Color(255, 220, 40, 255),
  cyan: new Color(24, 228, 236, 255),
  lime: new Color(96, 224, 48, 255),
  pink: new Color(255, 84, 164, 255),
  violet: new Color(164, 92, 255, 255),
  sky: new Color(158, 210, 230, 255),
  power: new Color(255, 255, 255, 255),
} as const;
