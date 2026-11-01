// Canvas 程序化纹理（全部可平铺）。每个纹理返回 { map, bump? }，单位尺寸见 TEX_SIZE（米/张）
import * as THREE from 'three';
import { mulberry } from './geom.js';

export const TEX_SIZE = {
  travertine: 4.8, travertine_smooth: 3, marble: 2.4, brick: 2.4, tuff: 4.8, stucco: 4, sand: 10, wood: 2.4,
  seat: 3.6, paving: 6, basalt: 4, ground: 70, roof: 3, tile_floor: 3, canvas: 1, cippus: 1, colored_marble: 2,
};

// ---------- 可平铺值噪声 ----------
function makeNoise(seed, period) {
  const r = mulberry(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((y % period) + period) % period * period + (((x % period) + period) % period)];
  // 输入为归一化坐标（u, v ∈ [0,1) 一个周期），整数倍缩放仍可平铺
  return (nu, nv) => {
    const x = nu * period, y = nv * period;
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(noises, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * noises[o](x, y); n += a; a *= 0.5; }
  return s / n;
}
function noiseSet(seed, base) { return [0, 1, 2, 3, 4].map((o) => makeNoise(seed + o * 77, base << o)); }

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** 逐像素着色：fn(u, v) → [r, g, b, bump] （u,v ∈ [0,1)） */
function pixels(size, fn) {
  const c = canvas(size), b = canvas(size);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  const img = g.createImageData(size, size), ib = gb.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, bb, h] = fn(x / size, y / size, x, y);
    const i = (y * size + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
    const hv = Math.max(0, Math.min(255, h * 255));
    ib.data[i] = ib.data[i + 1] = ib.data[i + 2] = hv; ib.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); gb.putImageData(ib, 0, 0);
  return { map: toTex(c), bump: toTex(b, { srgb: false }) };
}

// 砌块排布：返回 (u,v) 处距最近接缝的距离（以像素计）与块编号
function ashlar(px, py, size, courses, blocksPerCourse, jitterSeed = 1) {
  const ch = size / courses;
  const row = Math.floor(py / ch);
  const r = mulberry(row * 131 + jitterSeed);
  const n = blocksPerCourse;
  // 每行错缝
  const off = (row % 2) * 0.5 + r() * 0.2;
  const bw = size / n;
  const xx = (px / bw + off) % n;
  const col = Math.floor(xx);
  const dx = Math.min(xx - col, col + 1 - xx) * bw;
  const dy = Math.min(py - row * ch, (row + 1) * ch - py);
  return { d: Math.min(dx, dy), id: row * 97 + col, dy, dx };
}

const cache = new Map();
function cached(name, fn) { if (!cache.has(name)) cache.set(name, fn()); return cache.get(name); }

export const TEXTURES = {
  travertine: () => cached('travertine', () => {
    const N = noiseSet(11, 8), P = noiseSet(23, 256), S = noiseSet(5, 4);
    return pixels(1024, (u, v, x, y) => {
      const a = ashlar(x, y, 1024, 8, 3, 3);
      const br = mulberry(a.id + 7)();
      const n = fbm(N, u, v, 4);
      // 石灰华：水平纹理条带 + 细孔
      const streak = S[0](u, v * 6) * 0.5 + S[1](u, v * 6) * 0.5;
      const pore = P[0](u, v * 2);
      const hole = pore > 0.9 ? (pore - 0.9) * 3 : 0;
      let k = 0.86 + n * 0.12 + streak * 0.06 + br * 0.05 - hole * 0.35;
      const joint = a.d < 1.6 ? 0.78 : a.d < 3 ? 0.92 : 1;
      k *= joint;
      const r = 222 * k, g = 210 * k, b = 182 * k;
      const h = (a.d < 1.6 ? 0.25 : 0.62) + n * 0.25 - hole * 0.5;
      return [r, g, b, h];
    });
  }),
  travertine_smooth: () => cached('travertine_smooth', () => {
    const N = noiseSet(12, 8), P = noiseSet(29, 256), S = noiseSet(6, 4);
    return pixels(512, (u, v) => {
      const n = fbm(N, u, v, 4);
      const streak = S[0](u, v * 5);
      const pore = P[0](u, v);
      const hole = pore > 0.9 ? (pore - 0.9) * 3 : 0;
      const k = 0.88 + n * 0.1 + streak * 0.05 - hole * 0.3;
      return [224 * k, 213 * k, 186 * k, 0.6 + n * 0.3 - hole * 0.5];
    });
  }),
  marble: () => cached('marble', () => {
    const N = noiseSet(41, 4);
    return pixels(512, (u, v) => {
      const n = fbm(N, u, v, 5);
      const vein = Math.abs(Math.sin((u * 3 + v * 2 + n * 4) * Math.PI));
      const k = 0.93 + n * 0.06 - Math.pow(1 - vein, 24) * 0.12;
      return [244 * k, 241 * k, 234 * k, 0.5 + n * 0.1];
    });
  }),
  colored_marble: () => cached('colored_marble', () => {
    // 帕沃纳泽托（紫纹白）/ 黄色古大理石
    const N = noiseSet(43, 4);
    return pixels(512, (u, v) => {
      const n = fbm(N, u, v, 5);
      const vein = Math.abs(Math.sin((u * 2 + v * 3 + n * 5) * Math.PI));
      const p = Math.pow(1 - vein, 8);
      return [232 - p * 90, 214 - p * 120, 190 - p * 90, 0.5];
    });
  }),
  brick: () => cached('brick', () => {
    const N = noiseSet(51, 8);
    return pixels(1024, (u, v, x, y) => {
      const a = ashlar(x, y, 1024, 54, 6, 9);
      const br = mulberry(a.id + 3)();
      const n = fbm(N, u, v, 3);
      const mortar = a.dy < 2.4 || a.dx < 2;
      if (mortar) return [178 + n * 20, 168 + n * 20, 150 + n * 18, 0.3];
      const k = 0.78 + br * 0.3 + n * 0.12;
      return [176 * k, 92 * k, 60 * k, 0.65 + n * 0.2];
    });
  }),
  tuff: () => cached('tuff', () => {
    const N = noiseSet(61, 8);
    return pixels(512, (u, v, x, y) => {
      const a = ashlar(x, y, 512, 8, 3, 5);
      const n = fbm(N, u, v, 4);
      const br = mulberry(a.id + 1)();
      const k = (0.8 + n * 0.25 + br * 0.08) * (a.d < 1.5 ? 0.75 : 1);
      return [150 * k, 140 * k, 118 * k, a.d < 1.5 ? 0.2 : 0.6 + n * 0.3];
    });
  }),
  stucco: () => cached('stucco', () => {
    const N = noiseSet(71, 4);
    return pixels(512, (u, v) => {
      const n = fbm(N, u, v, 5);
      const k = 0.9 + n * 0.1;
      return [236 * k, 226 * k, 206 * k, 0.5 + n * 0.2];
    });
  }),
  sand: () => cached('sand', () => {
    const N = noiseSet(81, 8), G = noiseSet(83, 256);
    return pixels(1024, (u, v) => {
      const n = fbm(N, u, v, 4);
      const grain = G[0](u, v);
      // 耙痕
      const rake = 0.5 + 0.5 * Math.sin((v * 90 + n * 6) * Math.PI);
      const k = 0.82 + n * 0.16 + grain * 0.08 + rake * 0.03;
      return [222 * k, 196 * k, 150 * k, 0.4 + grain * 0.3 + rake * 0.15 + n * 0.15];
    });
  }),
  wood: () => cached('wood', () => {
    const N = noiseSet(91, 4);
    return pixels(512, (u, v, x, y) => {
      const plank = Math.floor(v * 10);
      const pr = mulberry(plank * 17)();
      const n = fbm(N, u, (v * 8) % 1, 4);
      const ring = 0.5 + 0.5 * Math.sin((v * 10 - plank) * 30 + n * 12 + u * 4);
      const edge = Math.min(v * 10 - plank, plank + 1 - v * 10) < 0.04;
      const k = (0.7 + pr * 0.25 + ring * 0.1) * (edge ? 0.55 : 1);
      return [150 * k, 108 * k, 70 * k, edge ? 0.1 : 0.5 + ring * 0.2];
    });
  }),
  seat: () => cached('seat', () => {
    const N = noiseSet(101, 8), P = noiseSet(103, 64);
    return pixels(512, (u, v, x, y) => {
      const a = ashlar(x, y, 512, 1, 3, 7);
      const n = fbm(N, u, v, 4);
      const pore = P[0](u, v);
      const k = (0.88 + n * 0.1 - (pore > 0.85 ? 0.1 : 0)) * (a.dx < 1.5 ? 0.82 : 1);
      return [226 * k, 216 * k, 192 * k, a.dx < 1.5 ? 0.25 : 0.6];
    });
  }),
  paving: () => cached('paving', () => {
    const N = noiseSet(111, 8);
    return pixels(1024, (u, v, x, y) => {
      const a = ashlar(x, y, 1024, 6, 4, 13);
      const br = mulberry(a.id + 21)();
      const n = fbm(N, u, v, 4);
      const k = (0.8 + n * 0.14 + br * 0.08) * (a.d < 2 ? 0.7 : 1);
      return [210 * k, 200 * k, 176 * k, a.d < 2 ? 0.15 : 0.55 + n * 0.2];
    });
  }),
  basalt: () => cached('basalt', () => {
    // 多边形玄武岩铺路（沃罗诺伊）
    const r = mulberry(5);
    const pts = [];
    for (let i = 0; i < 60; i++) pts.push([r(), r(), r()]);
    const N = noiseSet(121, 8);
    return pixels(512, (u, v) => {
      let d1 = 9, d2 = 9, id = 0;
      for (let k = 0; k < pts.length; k++) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = pts[k][0] + ox - u, dy = pts[k][1] + oy - v;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const n = fbm(N, u, v, 3);
      const k = (0.55 + pts[id][2] * 0.15 + n * 0.15) * (edge < 0.012 ? 0.5 : 1);
      return [92 * k, 90 * k, 88 * k, edge < 0.012 ? 0.1 : 0.6];
    });
  }),
  ground: () => cached('ground', () => {
    const N = noiseSet(131, 8), G = noiseSet(133, 128);
    return pixels(1024, (u, v) => {
      const n = fbm(N, u, v, 5);
      const g = G[0](u, v) * 0.6 + G[1](u, v) * 0.4;
      const k = 0.82 + n * 0.12 + g * 0.1;
      const grass = Math.max(0, Math.min(1, (g - 0.5) * 3));
      return [215 * k - grass * 30, 205 * k - grass * 6, 180 * k - grass * 34, 0.4 + g * 0.3];
    });
  }),
  roof: () => cached('roof', () => {
    // 罗马瓦：平板瓦 + 半圆盖瓦
    const N = noiseSet(141, 8);
    return pixels(512, (u, v, x, y) => {
      const col = (u * 8) % 1, row = (v * 6) % 1;
      const ridge = Math.abs(col - 0.5) < 0.12;
      const n = fbm(N, u, v, 3);
      const shade = ridge ? 1.05 - Math.abs(col - 0.5) * 2 : 0.82 - row * 0.12;
      const br = mulberry(Math.floor(u * 8) * 31 + Math.floor(v * 6))();
      const k = shade * (0.85 + br * 0.15 + n * 0.1);
      return [184 * k, 92 * k, 58 * k, ridge ? 0.9 - Math.abs(col - 0.5) * 3 : 0.3 + row * 0.2];
    });
  }),
  tile_floor: () => cached('tile_floor', () => {
    // 走廊地面：人字形砖
    const N = noiseSet(151, 8);
    return pixels(512, (u, v, x, y) => {
      const a = ashlar(x, y, 512, 16, 8, 2);
      const n = fbm(N, u, v, 3);
      const k = (0.75 + n * 0.2) * (a.d < 1.5 ? 0.7 : 1);
      return [170 * k, 120 * k, 88 * k, 0.5];
    });
  }),
  canvas: () => cached('canvas', () => {
    // 天篷帆布：亚麻本色 + 赭红条纹（u 沿圆周）
    const N = noiseSet(161, 64);
    return pixels(512, (u, v) => {
      const n = N[0](u, v);
      const weave = 0.96 + 0.04 * Math.sin(u * 512 * Math.PI) * Math.sin(v * 512 * Math.PI);
      const stripe = u % 0.5 < 0.06 || (u % 0.5 > 0.1 && u % 0.5 < 0.12);
      const base = stripe ? [168, 62, 40] : [236, 222, 190];
      const k = weave * (0.92 + n * 0.08);
      return [base[0] * k, base[1] * k, base[2] * k, 0.5];
    });
  }),
  cippus: () => cached('cippus', () => TEXTURES.travertine_smooth()),
};

/** 罗马数字门牌图集：I–LXXVI，8 列 × 10 行 */
export function numeralAtlas() {
  return cached('numerals', () => {
    const W = 2048, cols = 8, rows = 10, cw = W / cols, chh = 1024 / rows;
    const c = canvas(W, 1024);
    const g = c.getContext('2d');
    const base = TEXTURES.travertine_smooth().map.image;
    for (let i = 0; i < cols * rows; i++) {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * chh;
      g.drawImage(base, 0, 0, 256, 64, x, y, cw, chh);
      const n = i + 1;
      if (n > 76) continue;
      g.fillStyle = 'rgba(70, 56, 38, .85)';
      g.font = `bold ${chh * 0.62}px "Times New Roman", serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(roman(n), x + cw / 2, y + chh * 0.55);
    }
    const t = toTex(c, { repeat: false });
    return t;
  });
}
export function roman(n) {
  const m = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of m) while (n >= v) { s += r; n -= v; }
  return s;
}

/** 水面法线贴图 */
export function waterNormal() {
  return cached('waterN', () => {
    const N = noiseSet(171, 8);
    const size = 256;
    const c = canvas(size), g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const h = (x, y) => fbm(N, x / size, y / size, 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 6, dy = (h(x, y + 1) - h(x, y - 1)) * 6;
      const i = (y * size + x) * 4;
      img.data[i] = 128 + dx * 127; img.data[i + 1] = 128 + dy * 127; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTex(c, { srgb: false });
  });
}

/** 动物皮毛：斑纹 kind = 'spots' | 'stripes' | 'plain' | 'giraffe' */
export function furTexture(kind, base, dark) {
  return cached('fur:' + kind + base + dark, () => {
    const N = noiseSet(kind.length * 13 + 7, 8);
    const r = mulberry(kind.length + 3);
    const spots = [];
    for (let i = 0; i < 90; i++) spots.push([r(), r(), 0.012 + r() * 0.018]);
    const b = new THREE.Color(base), d = new THREE.Color(dark);
    return pixels(256, (u, v) => {
      const n = fbm(N, u, v, 4);
      let t = 0;
      if (kind === 'stripes') t = Math.sin((u * 18 + n * 3) * Math.PI) > 0.55 ? 1 : 0;
      else if (kind === 'spots' || kind === 'giraffe') {
        for (const [x, y, rr] of spots) {
          let dx = Math.abs(u - x), dy = Math.abs(v - y);
          dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
          const d = Math.hypot(dx, dy) / (kind === 'giraffe' ? rr * 2.2 : rr);
          if (kind === 'giraffe' ? d < 1 : d < 1 && d > 0.45) { t = 1; break; }
        }
        if (kind === 'giraffe') t = 1 - t;
      }
      const k = 0.85 + n * 0.3;
      const c = b.clone().lerp(d, t);
      return [c.r * 255 * k, c.g * 255 * k, c.b * 255 * k, 0.5];
    }).map;
  });
}
