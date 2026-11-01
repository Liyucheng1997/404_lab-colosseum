// 柱式构件原型（局部立面坐标：x 向右，y 向上，z 向外；原点 = 墙面上柱中心线底部）
// 贴墙半柱只建前半圆（背面埋在墙里）。每个函数返回 [{mat, geo}]（用于 InstancedMesh）。
import * as THREE from 'three';
import { lathe, box, boxB, cyl, merge, norm, xform, mulberry } from '../core/geom.js';

const HALF = [-Math.PI / 2, Math.PI];   // 车削角度：前半圆
const half = (pts, seg = 14) => lathe(pts, seg, HALF[0], HALF[1]);

/** 带收分的柱身（y0→y1，r0 底径，r1 顶径），可选凹槽（flutes）效果：多段车削 */
function shaft(r0, r1, y0, y1, seg = 16) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // 卷杀：下 1/3 等径，上部渐收
    const k = t < 0.33 ? 0 : (t - 0.33) / 0.67;
    pts.push([r0 + (r1 - r0) * (k * k * 0.6 + k * 0.4), y0 + (y1 - y0) * t]);
  }
  return half(pts, seg);
}

/** 阿提卡式柱础：方座 + 两道圆环 */
function atticBase(r, y0, h) {
  const g = [];
  g.push(boxB(r * 2.5, h * 0.35, r * 1.25, 0, y0, r * 0.625));
  g.push(half([[r * 1.22, y0 + h * 0.35], [r * 1.25, y0 + h * 0.48], [r * 1.18, y0 + h * 0.6], [r * 1.05, y0 + h * 0.66], [r * 1.08, y0 + h * 0.78], [r * 1.12, y0 + h * 0.86], [r * 1.02, y0 + h * 0.96], [r, y0 + h]]));
  return g;
}

/** 底层：托斯卡纳半柱 */
export function tuscanColumn() {
  const r0 = 0.47, r1 = 0.41;
  const g = [];
  g.push(boxB(1.15, 0.22, 0.58, 0, 0, 0.29));
  g.push(half([[0.56, 0.22], [0.58, 0.32], [0.54, 0.42], [r0, 0.46]]));
  g.push(shaft(r0, r1, 0.46, 7.82));
  // 颈 + 钟形圆盘 + 方板
  g.push(half([[r1, 7.82], [r1 + 0.04, 7.86], [r1 + 0.04, 7.92], [r1, 7.95], [r1 + 0.02, 7.98], [r1 + 0.16, 8.2], [r1 + 0.2, 8.28]]));
  g.push(boxB(1.18, 0.32, 0.59, 0, 8.28, 0.295));
  return [{ mat: 'trav_smooth', geo: merge(g) }];
}

/** 二层：爱奥尼半柱（含柱础，不含基座）：底在 0，总高 8.2 */
export function ionicColumn() {
  const r0 = 0.42, r1 = 0.36;
  const g = [...atticBase(r0, 0, 0.35)];
  g.push(shaft(r0, r1, 0.35, 7.65));
  const y = 7.65;
  // 卵箭饰圆盘
  g.push(half([[r1, y], [r1 + 0.03, y + 0.03], [r1 + 0.03, y + 0.07], [r1 + 0.12, y + 0.15], [r1 + 0.14, y + 0.24], [r1 + 0.1, y + 0.3]]));
  // 涡卷：前视为两个圆盘，中间垫枕
  const vr = 0.19, vy = y + 0.2;
  for (const sx of [-1, 1]) {
    const x = sx * (r1 + 0.16);
    g.push(xform(norm(new THREE.CylinderGeometry(vr, vr, 0.5, 18)), { rx: Math.PI / 2, x, y: vy, z: 0.18 }));
    // 螺旋：三道逐渐变小的圆环
    for (let i = 0; i < 3; i++) {
      const rr = vr * (0.85 - i * 0.25);
      g.push(xform(norm(new THREE.TorusGeometry(rr, 0.022, 4, 16)), { x: x + sx * i * 0.02, y: vy - i * 0.02, z: 0.43 }));
    }
    g.push(xform(norm(new THREE.SphereGeometry(0.04, 8, 6)), { x: x + sx * 0.05, y: vy - 0.05, z: 0.44 }));
  }
  g.push(xform(norm(new THREE.CylinderGeometry(0.15, 0.15, (r1 + 0.16) * 2, 12, 1, false)), { rz: Math.PI / 2, y: vy + 0.03, z: 0.12 }));
  g.push(boxB(1.18, 0.12, 0.62, 0, y + 0.36, 0.31));
  g.push(boxB(1.24, 0.07, 0.66, 0, y + 0.48, 0.33));
  return [{ mat: 'trav_smooth', geo: merge(g) }];
}

/** 一片茛苕叶：底部贴在钟形柱头上，向上外卷（局部：叶面朝 +z） */
function leaf(w, h, lean = 0.25, curl = 0.12) {
  const pos = [], nor = [], uv = [];
  const rows = 5, cols = 4;
  const P = (i, j, t) => {
    const v = i / rows, u = j / cols - 0.5;
    const width = w * (1 - Math.pow(v, 1.6) * 0.75) * (1 - 0.15 * Math.abs(Math.sin(v * 9)));
    const x = u * width;
    let y = v * h, z = Math.pow(v, 1.4) * lean * h + Math.abs(u) * -0.08 * w * 2;
    if (v > 0.75) { const c = (v - 0.75) / 0.25; z += c * curl; y -= c * c * curl * 0.6; }
    return [x, y, z + t];
  };
  const tri = (a, b, c, flip) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...c);
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)).normalize();
    if (flip) n.negate();
    for (const p of flip ? [a, c, b] : [a, b, c]) { pos.push(...p); nor.push(n.x, n.y, n.z); uv.push(p[0], p[1]); }
  };
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    for (const [t, flip] of [[0.02, false], [-0.0, true]]) {
      const a = P(i, j, t), b = P(i, j + 1, t), c = P(i + 1, j + 1, t), d = P(i + 1, j, t);
      tri(a, b, c, flip); tri(a, c, d, flip);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** 科林斯柱头（半个）：钟形 + 两排叶 + 角涡卷 + 凹面方板。底在 y0，高 h，柱顶半径 r */
export function corinthianCapital(r, y0, h, { full = false } = {}) {
  const g = [];
  const L = full ? (pts, seg) => lathe(pts, seg || 20) : half;
  g.push(L([[r, y0], [r + 0.03, y0 + 0.03], [r + 0.03, y0 + 0.07], [r, y0 + 0.09], [r * 1.02, y0 + h * 0.5], [r * 1.12, y0 + h * 0.82], [r * 1.18, y0 + h * 0.86]], 16));
  const rowDefs = [[8, 0.0, 0.42, 0.0, 0.3], [8, Math.PI / 8, 0.68, 0.18, 0.28]];
  for (const [n, off, hh, yo, wk] of rowDefs) {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      if (!full && Math.cos(a) < -0.2) continue;
      const lf = leaf(r * wk * 2.2, h * hh, 0.28, 0.06);
      xform(lf, { ry: a, x: Math.sin(a) * r * 0.98, y: y0 + 0.1 + h * yo, z: Math.cos(a) * r * 0.98 });
      g.push(lf);
    }
  }
  // 角涡卷（四角，前半只要前两个）+ 中央小涡卷
  const corners = full ? [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4] : [Math.PI / 4, -Math.PI / 4];
  for (const a of corners) {
    const R = r * 1.3;
    const c = xform(norm(new THREE.TorusGeometry(0.09, 0.03, 5, 10, Math.PI * 1.5)), { ry: a + Math.PI / 2, x: Math.sin(a) * R, y: y0 + h * 0.8, z: Math.cos(a) * R });
    g.push(c);
  }
  // 凹面方板
  const aw = r * 2.7;
  g.push(boxB(aw, h * 0.13, full ? aw : aw / 2, 0, y0 + h * 0.87, full ? 0 : aw / 4));
  g.push(xform(norm(new THREE.SphereGeometry(0.07, 8, 6)), { y: y0 + h * 0.93, z: full ? aw / 2 : aw / 2 }));
  return merge(g);
}

/** 三层：科林斯半柱（含柱础），底在 0，总高 8.0 */
export function corinthianColumn() {
  const r0 = 0.4, r1 = 0.34;
  const g = [...atticBase(r0, 0, 0.35)];
  g.push(shaft(r0, r1, 0.35, 6.85));
  g.push(corinthianCapital(r1, 6.85, 1.15));
  return [{ mat: 'trav_smooth', geo: merge(g) }];
}

/** 顶层：科林斯壁柱（扁平），底在 0（基座顶），高 10.6 */
export function atticPilaster() {
  const g = [];
  const w = 0.84, d = 0.14;
  g.push(boxB(w + 0.16, 0.18, d + 0.08, 0, 0, (d + 0.08) / 2));
  g.push(boxB(w + 0.08, 0.1, d + 0.04, 0, 0.18, (d + 0.04) / 2));
  g.push(boxB(w, 9.62, d, 0, 0.28, d / 2));
  // 扁平科林斯柱头：两层叶片浮雕 + 方板
  const y = 9.9;
  g.push(boxB(w + 0.04, 0.5, d + 0.02, 0, y, (d + 0.02) / 2));
  for (let i = -1; i <= 1; i++) {
    const lf = leaf(0.28, 0.36, 0.25, 0.04);
    xform(lf, { x: i * 0.28, y: y, z: d + 0.02 });
    g.push(lf);
    const lf2 = leaf(0.24, 0.3, 0.3, 0.05);
    xform(lf2, { x: i * 0.28 + 0.14 * (i === 1 ? -1 : 1) * 0, y: y + 0.22, z: d + 0.04 });
    if (i !== 0) g.push(lf2);
  }
  g.push(boxB(w + 0.3, 0.14, d + 0.18, 0, y + 0.56, (d + 0.18) / 2));
  return [{ mat: 'trav_smooth', geo: merge(g) }];
}

/** 柱下基座（二三层的连续基座在柱下凸出的部分）：宽 w，高 h */
export function pedestal(w = 1.2, h = 1.7, d = 0.6) {
  const g = [];
  g.push(boxB(w + 0.1, 0.22, d + 0.05, 0, 0, (d + 0.05) / 2));
  g.push(boxB(w, h - 0.42, d, 0, 0.22, d / 2));
  g.push(boxB(w + 0.12, 0.12, d + 0.07, 0, h - 0.2, (d + 0.07) / 2));
  g.push(boxB(w + 0.2, 0.08, d + 0.11, 0, h - 0.08, (d + 0.11) / 2));
  return [{ mat: 'trav_smooth', geo: merge(g) }];
}

/** 拱门里的大理石雕像（披衣立像，高约 2.6 m，含底座）；variant 改变姿势 */
export function statue(variant = 0) {
  const r = mulberry(variant * 31 + 5);
  const g = [];
  g.push(boxB(0.95, 0.32, 0.8, 0, 0, 0));
  g.push(boxB(0.85, 0.06, 0.7, 0, 0.32, 0));
  // 长袍：带褶皱的车削体
  const folds = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    folds.push([0.34 - t * 0.1 + Math.sin(t * 3) * 0.02, 0.38 + t * 1.25]);
  }
  const robe = lathe(folds, 18);
  const p = robe.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(x, z);
    const k = 1 + 0.07 * Math.sin(a * 9 + y * 2) * (1.6 - y) ;
    p.setXYZ(i, x * k, y, z * k);
  }
  robe.computeVertexNormals();
  g.push(robe);
  // 上身 + 披肩
  g.push(xform(lathe([[0.24, 0], [0.27, 0.15], [0.26, 0.4], [0.2, 0.5], [0.08, 0.56]], 14), { y: 1.62 }));
  g.push(xform(norm(new THREE.SphereGeometry(0.13, 12, 10)), { y: 2.33 }));
  g.push(cyl(0.05, 0.06, 0.12, 8, 0, 2.18, 0));
  // 手臂
  const up = r() > 0.5;
  g.push(xform(cyl(0.055, 0.06, 0.62, 8), { rz: up ? -2.4 : -0.25, x: 0.27, y: 2.08 }));
  g.push(xform(cyl(0.055, 0.06, 0.55, 8), { rz: 0.35, rx: -0.5, x: -0.28, y: 2.05 }));
  if (r() > 0.4) g.push(xform(cyl(0.025, 0.025, 1.9, 6), { x: up ? 0.75 : 0.38, y: 0.4, z: 0.1 }));
  return [{ mat: 'marble', geo: merge(g) }];
}

/** 顶层青铜圆盾 */
export function clipeus() {
  const g = lathe([[0.001, 0.13], [0.16, 0.12], [0.22, 0.07], [0.6, 0.05], [0.66, 0.08], [0.72, 0.05], [0.9, 0.035], [0.96, 0.06], [0.98, 0.0]], 28);
  xform(g, { rx: Math.PI / 2 });
  return [{ mat: 'gilded', geo: g }];
}

/** 托座（承桅杆） */
export function corbel() {
  const g = [];
  g.push(boxB(0.56, 0.32, 0.72, 0, 0.42, 0.36));
  g.push(boxB(0.5, 0.22, 0.52, 0, 0.2, 0.26));
  g.push(boxB(0.44, 0.2, 0.3, 0, 0.0, 0.15));
  return [{ mat: 'trav_smooth', geo: merge(g) }];
}

/** 独立圆柱（柱廊/门廊/包厢）：底在 0，高 h，底径 r，柱头 'corinthian' | 'tuscan' | 'ionic' */
export function freeColumn(h, r, kind = 'corinthian', matKey = 'marble_col', capMat = 'marble') {
  const shaftG = lathe([[r * 1.25, 0], [r * 1.25, 0.1], [r * 1.12, 0.16], [r, 0.22], [r, h * 0.35], [r * 0.86, h - h * 0.13]], 16);
  const cap = kind === 'corinthian' ? corinthianCapital(r * 0.86, h - h * 0.13, h * 0.13, { full: true })
    : merge([lathe([[r * 0.86, h - 0.3], [r * 1.05, h - 0.12], [r * 1.1, h - 0.1]], 14), boxB(r * 2.4, 0.12, r * 2.4, 0, h - 0.12, 0)]);
  return [{ mat: matKey, geo: shaftG }, { mat: capMat, geo: cap }];
}
