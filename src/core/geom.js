// 几何工具：所有输出都是“非索引 + position/normal/uv”的 BufferGeometry，便于合并
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 规范化：转非索引，只保留 position/normal/uv（缺 uv 时补零） */
export function norm(g) {
  let x = g.index ? g.toNonIndexed() : g;
  if (!x.attributes.normal) x.computeVertexNormals();
  if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
  for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) x.deleteAttribute(k);
  x.morphAttributes = {};
  return x;
}

export function merge(list) {
  const gs = list.filter(Boolean).map(norm);
  if (!gs.length) return null;
  const hasColor = gs.some((g) => g.attributes.color);
  for (const g of gs) {
    if (hasColor && !g.attributes.color) paint(g, 0xffffff);
  }
  return mergeGeometries(gs, false);
}

/** 顶点色 */
export function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export function box(w, h, d, x = 0, y = 0, z = 0) {
  return norm(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}
/** 底面在 y0 的盒子 */
export function boxB(w, h, d, x = 0, y0 = 0, z = 0) { return box(w, h, d, x, y0 + h / 2, z); }

export function cyl(rTop, rBot, h, seg = 16, x = 0, y0 = 0, z = 0, open = false, t0 = 0, tl = Math.PI * 2) {
  return norm(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open, t0, tl).translate(x, y0 + h / 2, z));
}

/** 车削：pts = [[r, y], ...]，绕 Y 轴；t0/tl 控制角度范围（three 的 Lathe：角度 0 指向 +Z 方向的 sin） */
export function lathe(pts, seg = 16, t0 = 0, tl = Math.PI * 2) {
  return norm(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg, t0, tl));
}

/**
 * 沿 X 方向拉伸一条截面线（截面在 z-y 平面，pts = [[z, y], ...]，按顺序；法线按“左手侧”朝外：
 * 从 pts[i] 指向 pts[i+1] 时，法线 = (dy, -dz) 方向取朝 +z 外侧的那一边）。
 * 每段截面平直着色（棱角清晰）；沿 X 分 seg 段（便于后续弯曲）。
 */
export function sweepX(pts, x0, x1, seg = 4, flipNormal = false) {
  const pos = [], nor = [], uv = [];
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (let i = 0; i < pts.length - 1; i++) {
    const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
    let nz = yb - ya, ny = -(zb - za);
    const l = Math.hypot(nz, ny) || 1;
    nz /= l; ny /= l;
    if (flipNormal) { nz = -nz; ny = -ny; }
    for (let s = 0; s < seg; s++) {
      const xa = x0 + ((x1 - x0) * s) / seg, xb = x0 + ((x1 - x0) * (s + 1)) / seg;
      const quad = [[xa, ya, za, L[i]], [xb, ya, za, L[i]], [xb, yb, zb, L[i + 1]], [xa, yb, zb, L[i + 1]]];
      const tri = flipNormal ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const k of tri) {
        const q = quad[k];
        pos.push(q[0], q[1], q[2]);
        nor.push(0, ny, nz);
        uv.push(q[0], q[3]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** 拉伸二维形状（可带孔）：沿 +z 方向从 z0 到 z0+depth */
export function extrude(shape, depth, z0 = 0, curveSegments = 12, bevel = false) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments });
  g.translate(0, 0, z0);
  return norm(g);
}

/** 矩形面板形状，带半圆拱门洞：宽 w（以 0 居中），高 h（从 0 起），洞宽 aw、拱脚高 ay（拱顶 = ay + aw/2） */
export function archPanelShape(w, h, aw, ay, y0 = 0) {
  // 外轮廓直接绕开拱洞（U 形），避免洞口贴边导致三角化失败
  const s = new THREE.Shape();
  const r = aw / 2;
  s.moveTo(-w / 2, y0);
  if (aw > 0) {
    s.lineTo(-r, y0);
    s.lineTo(-r, y0 + ay);
    s.absarc(0, y0 + ay, r, Math.PI, 0, true);
    s.lineTo(r, y0);
  }
  s.lineTo(w / 2, y0); s.lineTo(w / 2, y0 + h); s.lineTo(-w / 2, y0 + h); s.lineTo(-w / 2, y0);
  return s;
}
/** 半圆拱门洞形状（门洞内衬用） */
export function archPath(r, ay, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (Math.PI * i) / steps;
    pts.push([Math.cos(a) * r, ay + Math.sin(a) * r]);
  }
  return pts;
}

/** 把几何体整体平移/旋转（就地） */
export function xform(g, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}

/** 椭圆环带（水平面，y 固定）：在两个椭圆之间三角化，用于平台、走道 */
export function ellipseRingFlat(ringFn, s0, s1, y, seg = 320, up = true) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p00 = ringFn(s0, a0), p01 = ringFn(s0, a1), p10 = ringFn(s1, a0), p11 = ringFn(s1, a1);
    const q = up ? [p00, p10, p11, p00, p11, p01] : [p00, p11, p10, p00, p01, p11];
    for (const p of q) { pos.push(p.x, y, p.z); nor.push(0, up ? 1 : -1, 0); uv.push(p.x, p.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** 由三角形列表（[[x,y,z]x3, ...]）生成平直法线的几何体 */
export function fromTris(tris, uvFn) {
  const pos = [], nor = [], uv = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const t of tris) {
    a.set(...t[0]); b.set(...t[1]); c.set(...t[2]);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    for (const p of t) {
      pos.push(...p); nor.push(n.x, n.y, n.z);
      const u = uvFn ? uvFn(p, n) : [p[0], p[2]];
      uv.push(u[0], u[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** 世界坐标盒式 UV（按法线主方向投影），unit 米 = 1 个 UV 单位 */
export function boxUV(g, unit = 1) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / unit, v / unit);
  }
  uv.needsUpdate = true;
  return g;
}

export const rand = (() => { let s = 1234567; return (seed) => { if (seed !== undefined) s = seed; s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
