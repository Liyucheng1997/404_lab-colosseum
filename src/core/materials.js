// 材质注册表。UV 约定：石材类几何的 uv 以“米”为单位（bend()/boxUV() 生成），纹理按 TEX_SIZE 自动缩放。
import * as THREE from 'three';
import { TEXTURES, TEX_SIZE, numeralAtlas, waterNormal } from './textures.js';

const DEF = {
  travertine: { tex: 'travertine', color: 0xe6d8bc, roughness: 0.88, bump: 0.02 },
  trav_smooth: { tex: 'travertine_smooth', color: 0xebdfc6, roughness: 0.8, bump: 0.012 },
  marble: { tex: 'marble', color: 0xeeeae2, roughness: 0.45, bump: 0.005 },
  marble_col: { tex: 'colored_marble', color: 0xffffff, roughness: 0.4 },
  brick: { tex: 'brick', color: 0xd8c8b8, roughness: 0.92, bump: 0.03 },
  tuff: { tex: 'tuff', color: 0xb8ac94, roughness: 0.95, bump: 0.03 },
  stucco: { tex: 'stucco', color: 0xffffff, roughness: 0.9 },
  seat: { tex: 'seat', color: 0xdccfb4, roughness: 0.85, bump: 0.015 },
  wood_seat: { tex: 'wood', color: 0xd8c0a0, roughness: 0.85, bump: 0.02 },
  wood: { tex: 'wood', color: 0xffffff, roughness: 0.8 },
  wood_dark: { tex: 'wood', color: 0x7a6a5a, roughness: 0.85 },
  sand: { tex: 'sand', color: 0xe6c79a, roughness: 0.98, bump: 0.03 },
  paving: { tex: 'paving', color: 0xd6cbb2, roughness: 0.85, bump: 0.02 },
  basalt: { tex: 'basalt', color: 0xffffff, roughness: 0.7, bump: 0.03 },
  ground: { tex: 'ground', color: 0xffffff, roughness: 1 },
  roof: { tex: 'roof', color: 0xffffff, roughness: 0.8, bump: 0.05 },
  tile_floor: { tex: 'tile_floor', color: 0xd0c0a8, roughness: 0.9 },
  canvas: { tex: 'canvas', color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide, uvRaw: true },
  bronze: { color: 0x8a6a3a, roughness: 0.4, metalness: 0.6 },
  gilded: { color: 0xa87a30, roughness: 0.38, metalness: 0.65 },
  iron: { color: 0x55524e, roughness: 0.55, metalness: 0.75 },
  dark: { color: 0x17120e, roughness: 1 },
  shadow: { color: 0x2a221b, roughness: 1 },
  purple: { color: 0x5b1847, roughness: 0.75 },
  red_cloth: { color: 0x8e2b1e, roughness: 0.8, side: THREE.DoubleSide },
  rope: { color: 0x8d7a58, roughness: 0.9 },
  foliage: { color: 0x4e6a36, roughness: 0.9 },
  foliage_dark: { color: 0x2f4426, roughness: 0.9 },
  trunk: { color: 0x6a5038, roughness: 0.95 },
  plaster_red: { color: 0xa34b32, roughness: 0.9 },
  plaster_ochre: { color: 0xd2ab6a, roughness: 0.9 },
  plaster_white: { tex: 'stucco', color: 0xf2ece0, roughness: 0.9 },
  vcolor: { color: 0xffffff, roughness: 0.85, vertexColors: true },
  numerals: { color: 0xffffff, roughness: 0.85, special: 'numerals' },
  water: { color: 0x3d6f78, roughness: 0.06, metalness: 0.05, special: 'water', transparent: true, opacity: 0.9 },
  net: { color: 0x3b3328, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide },
};

const MATS = new Map();
let envMap = null;
export function setEnvMap(t) { envMap = t; for (const m of MATS.values()) { m.envMap = t; m.needsUpdate = true; } }

export function mat(key) {
  if (MATS.has(key)) return MATS.get(key);
  const d = DEF[key];
  if (!d) throw new Error('unknown material ' + key);
  const p = { color: d.color, roughness: d.roughness ?? 0.85, metalness: d.metalness ?? 0, side: d.side ?? THREE.FrontSide, vertexColors: !!d.vertexColors };
  if (d.transparent) { p.transparent = true; p.opacity = d.opacity; p.depthWrite = key !== 'net'; }
  if (d.tex) {
    const t = TEXTURES[d.tex]();
    const sz = d.uvRaw ? 1 : TEX_SIZE[d.tex] || 4;
    t.map.repeat.set(1 / sz, 1 / sz);
    p.map = t.map;
    if (d.bump && t.bump) { t.bump.repeat.set(1 / sz, 1 / sz); p.bumpMap = t.bump; p.bumpScale = d.bump * 30; }
  }
  if (d.special === 'numerals') { p.map = numeralAtlas(); }
  if (d.special === 'water') { const n = waterNormal(); n.repeat.set(1 / 6, 1 / 6); p.normalMap = n; p.normalScale = new THREE.Vector2(0.6, 0.6); }
  const m = new THREE.MeshStandardMaterial(p);
  m.name = key;
  if (envMap) m.envMap = envMap;
  MATS.set(key, m);
  return m;
}
export function defineMaterial(key, d) { DEF[key] = d; }
export function allMaterials() { return MATS; }
