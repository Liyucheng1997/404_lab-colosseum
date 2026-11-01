// 周边环境（公元 80 年前后）：地形与山丘（帕拉蒂尼、西里欧、奥皮奥、维利亚）、广场铺地与界石、道路、
// 汗水泉、尼禄巨像（已改为太阳神像）、大角斗士学校、神君克劳狄神庙台地、提图斯浴场、远处民居与松柏
import * as THREE from 'three';
import { BAYS } from '../config.js';
import { ringP, locate, placeMatrix, bayArc, thetaAt } from '../core/ellipse.js';
import { box, boxB, cyl, lathe, merge, norm, xform, ellipseRingFlat, boxUV, mulberry, extrude, sweepX } from '../core/geom.js';
import { mat } from '../core/materials.js';
import { Batcher } from '../core/batcher.js';
import { createHuman, setPose } from '../actors/human.js';

export const GROUND_Y = -0.5;
export const LANDMARKS_OUT = {
  meta: { name: '汗水泉', pos: [-140, 0, 62] },
  colossus: { name: '尼禄巨像', pos: [-232, 0, -52] },
  ludus: { name: '大角斗士学校', pos: [205, 0, 18], rot: 0.28 },
};
const HILLS = [
  { x: -330, z: 360, r: 230, h: 30 },   // 帕拉蒂尼
  { x: 250, z: 360, r: 250, h: 28 },    // 西里欧
  { x: 40, z: -360, r: 280, h: 26 },    // 奥皮奥
  { x: 380, z: -300, r: 220, h: 34 },   // 埃斯奎利诺
  { x: -260, z: -70, r: 95, h: 8 },     // 维利亚（巨像所在台地）
  { x: -620, z: -120, r: 200, h: 22 },
];
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function terrainHeight(x, z) {
  let h = 0;
  for (const H of HILLS) {
    const d = Math.hypot(x - H.x, z - H.z) / H.r;
    h += H.h * (1 - sstep(0.55, 1.15, d));
  }
  const { s } = locate(x, z);
  const flat = sstep(-34, -70, s);
  // 巨像台地保持平顶
  const ld = Math.hypot(x - LANDMARKS_OUT.colossus.pos[0], z - LANDMARKS_OUT.colossus.pos[2]);
  if (ld < 40) h = Math.max(h, 8 * (1 - sstep(28, 40, ld)));
  return GROUND_Y + h * flat;
}

function buildTerrain(scene) {
  const N = 240, S = 3200;
  const g = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // 竞技场下方挖空（地下室深约 6 m），其余贴地形
    p.setY(i, (x / 52) ** 2 + (z / 34) ** 2 < 1 ? -8 : terrainHeight(x, z) - 0.03);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  const col = new Float32Array(p.count * 3);
  const r = mulberry(3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    uv.setXY(i, x, z);
    // 山坡偏绿，谷地与城区偏土黄；大尺度起伏的色块
    const hill = Math.min(1, Math.max(0, (p.getY(i) - GROUND_Y) / 14));
    const n = 0.5 + 0.25 * Math.sin(x * 0.011 + Math.sin(z * 0.007) * 2) + 0.25 * Math.sin(z * 0.013 + x * 0.004);
    const g2 = Math.min(1, hill * 0.8 + n * 0.35);
    col[i * 3] = 0.92 - g2 * 0.3; col[i * 3 + 1] = 0.86 - g2 * 0.12; col[i * 3 + 2] = 0.72 - g2 * 0.28;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const gm = mat('ground').clone();
  gm.vertexColors = true;
  const m = new THREE.Mesh(g, gm);
  m.receiveShadow = true;
  m.name = 'terrain';
  scene.add(m);
}

function road(b, pts, w) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
    const n = Math.ceil(len / 8);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      const nx = -Math.sin(a) * w / 2, nz = Math.cos(a) * w / 2;
      const P = (x, z) => [x, terrainHeight(x, z) + 0.04, z];
      const q = [P(ax - nx, az - nz), P(bx - nx, bz - nz), P(bx + nx, bz + nz), P(ax + nx, az + nz)];
      const g = new THREE.BufferGeometry();
      const v = [q[0], q[2], q[1], q[0], q[3], q[2]].flat();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2));
      b.add('basalt', boxUV(g));
    }
  }
}

/** 汗水泉：圆形水池 + 鼓座 + 圆锥（水从锥顶渗出流下） */
function buildMeta(b, scene) {
  const [x, , z] = LANDMARKS_OUT.meta.pos;
  const y = terrainHeight(x, z);
  const g = [];
  g.push(lathe([[8.6, 0], [8.6, 0.9], [8.2, 0.9], [8.2, 0.3], [0.1, 0.3]], 48));
  g.push(lathe([[3.6, 0.3], [3.6, 1.0], [3.3, 1.2], [3.3, 4.6], [3.5, 4.8], [3.0, 5.0]], 32));
  g.push(lathe([[2.95, 5.0], [2.4, 8], [1.7, 11.5], [1.0, 14.5], [0.6, 15.6], [0.75, 15.9], [0.5, 16.4], [0.15, 17.2], [0.01, 17.4]], 32));
  for (const q of g) b.add('marble', boxUV(xform(q, { x, y, z })));
  // 鼓座上的壁龛
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add('dark', xform(box(1.0, 2.0, 0.1), { x: x + Math.sin(a) * 3.31, y: y + 2.8, z: z + Math.cos(a) * 3.31, ry: a }));
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(8.2, 48).rotateX(-Math.PI / 2), mat('water'));
  water.position.set(x, y + 0.75, z);
  scene.add(water);
  const filmMat = mat('water').clone(); filmMat.opacity = 0.32; filmMat.color.set(0xbfd6d8); filmMat.depthWrite = false;
  const film = new THREE.Mesh(lathe([[3.02, 5.0], [2.47, 8], [1.76, 11.5], [1.05, 14.5], [0.65, 15.6]], 32), filmMat);
  film.position.set(x, y, z);
  scene.add(film);
  return { water, film };
}

/** 尼禄巨像（太阳神像）：青铜立像约 30 m，光芒冠，右手扶舵，左手托球，立于大理石台座上 */
function buildColossus(scene, b) {
  const [x, , z] = LANDMARKS_OUT.colossus.pos;
  const y = terrainHeight(x, z);
  // 台座（哈德良迁移后的台座约 17.6 × 14.5 m，这里按同等体量）
  b.add('marble', boxUV(boxB(19, 1.2, 16, x, y, z)));
  b.add('marble', boxUV(boxB(17, 6.0, 14, x, y + 1.2, z)));
  b.add('marble', boxUV(boxB(18, 0.8, 15, x, y + 7.2, z)));
  const h = createHuman({ kind: 'statue', seed: 9, cloak: 0xa88550 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xa88550, metalness: 0.85, roughness: 0.38 });
  h.root.traverse((o) => { if (o.isMesh) { o.material = bronze; o.castShadow = true; } });
  setPose(h, { shR: [-0.15, 0, -0.32], elR: [-0.35, 0, 0], shL: [-0.65, 0, 0.12], elL: [-1.0, 0, 0], hipL: [0.05, 0, 0.04], knL: [0.12, 0, 0], hipR: [-0.12, 0, -0.04], head: [0.05, 0.25, 0] });
  // 光芒冠
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.22, 4), bronze);
    ray.position.set(Math.sin(a) * 0.1, 0.24, Math.cos(a) * 0.06);
    ray.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.6);
    h.J.head.add(ray);
  }
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), bronze);
  globe.position.set(0, -0.1, 0.06);
  h.J.haL.add(globe);
  const rudder = new THREE.Group();
  rudder.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.1, 8).translate(0, -0.42, 0), bronze));
  rudder.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.18).translate(0, -0.9, 0.06), bronze));
  rudder.position.set(0, -0.05, 0.02);
  h.J.haR.add(rudder);
  h.root.scale.setScalar(17);
  h.root.position.set(x, y + 8.0, z);
  h.root.rotation.y = Math.atan2(-x, -z);   // 面向斗兽场
  scene.add(h.root);
  return h;
}

/** 大角斗士学校：四面柱廊院落 + 中央椭圆训练场（小看台） */
function buildLudus(b) {
  const { pos: [cx, , cz], rot } = LANDMARKS_OUT.ludus;
  const y = terrainHeight(cx, cz);
  const T = (g) => xform(g, { ry: -rot, x: cx, y, z: cz });
  const W = 104, D = 84, depth = 9, H = 9;
  // 外围房舍（两层，内为角斗士小间）
  for (const [w, d, x, z] of [[W, depth, 0, -D / 2 + depth / 2], [W, depth, 0, D / 2 - depth / 2], [depth, D - 2 * depth, -W / 2 + depth / 2, 0], [depth, D - 2 * depth, W / 2 - depth / 2, 0]]) {
    b.add('plaster_ochre', boxUV(T(boxB(w, H, d, x, 0, z))));
    const roof = new THREE.Shape();
    roof.moveTo(-d / 2 - 0.6, 0); roof.lineTo(d / 2 + 0.6, 0); roof.lineTo(0, 2.6); roof.lineTo(-d / 2 - 0.6, 0);
    const rg = extrude(roof, w, -w / 2, 1);
    if (w < d) xform(rg, { ry: 0 }); else xform(rg, { ry: Math.PI / 2 });
    b.add('roof', boxUV(T(xform(rg, { x, y: H, z }))));
    // 立面小窗
    const n = Math.floor(Math.max(w, d) / 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const wx = w > d ? x + t * w : x + (x > 0 ? 1 : -1) * (d / 2 + 0.02);
      const wz = w > d ? z + (z > 0 ? 1 : -1) * (d / 2 + 0.02) : z + t * d;
      b.add('dark', T(boxB(w > d ? 0.8 : 0.05, 1.0, w > d ? 0.05 : 0.8, wx, 5.6, wz)));
      b.add('dark', T(boxB(w > d ? 1.2 : 0.05, 2.2, w > d ? 0.05 : 1.2, wx * 1, 0.2, wz)));
    }
  }
  // 内侧柱廊
  const iw = W - 2 * depth, id = D - 2 * depth;
  const colGeo = merge([cyl(0.32, 0.36, 5.4, 10), boxB(0.9, 0.3, 0.9, 0, 5.4, 0)]);
  const cols = [];
  for (let x = -iw / 2 + 2; x <= iw / 2 - 2; x += 3.6) for (const sz of [-1, 1]) cols.push([x, sz * (id / 2 - 3)]);
  for (let z = -id / 2 + 5; z <= id / 2 - 5; z += 3.6) for (const sx of [-1, 1]) cols.push([sx * (iw / 2 - 3), z]);
  for (const [x, z] of cols) b.add('trav_smooth', boxUV(T(xform(colGeo.clone(), { x, z }))));
  for (const [w, d, x, z] of [[iw - 2, 3.6, 0, -id / 2 + 1.5], [iw - 2, 3.6, 0, id / 2 - 1.5], [3.6, id - 2, -iw / 2 + 1.5, 0], [3.6, id - 2, iw / 2 - 1.5, 0]]) {
    b.add('trav_smooth', boxUV(T(boxB(w, 0.8, d, x, 5.7, z))));
    b.add('roof', boxUV(T(boxB(w, 0.3, d, x, 6.5, z))));
  }
  b.add('paving', boxUV(T(boxB(iw, 0.05, id, 0, 0, 0))));
  // 椭圆训练场：沙地 + 7 排看台 + 短轴两端的小包厢
  const ring = (s) => ({ a: 31.5 + s, b: 21 + s });
  const P = (s, th) => ({ x: ring(s).a * Math.cos(th), z: ring(s).b * Math.sin(th) });
  const sand = norm(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2));
  b.add('sand', boxUV(T(xform(sand, { sx: 31.5, sz: 21, y: 0.06 }))));
  for (let i = 0; i < 8; i++) {
    const g = ellipseRingFlat(P, i * 0.75, (i + 1) * 0.75, 1.6 + i * 0.42, 96);
    b.add('seat', boxUV(T(g)));
    // 竖向踢面
    const pos = [];
    for (let k = 0; k < 96; k++) {
      const a0 = (k / 96) * Math.PI * 2, a1 = ((k + 1) / 96) * Math.PI * 2;
      const p0 = P(i * 0.75, a0), p1 = P(i * 0.75, a1), y0 = i ? 1.6 + (i - 1) * 0.42 : 0, y1 = 1.6 + i * 0.42;
      pos.push(p0.x, y0, p0.z, p1.x, y1, p1.z, p1.x, y0, p1.z, p0.x, y0, p0.z, p0.x, y1, p0.z, p1.x, y1, p1.z);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.computeVertexNormals();
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    b.add(i ? 'seat' : 'marble', boxUV(T(rg)));
  }
  for (const sz of [-1, 1]) b.add('marble', boxUV(T(boxB(6, 3.5, 3, 0, 1.6, sz * 25.5))));
}

/** 远处建筑群：神君克劳狄神庙台地、提图斯浴场、民居 */
function buildCity(scene, b) {
  // 神君克劳狄神庙台地（西里欧山）：拱券挡土墙 + 神庙
  {
    const cx = 230, cz = 300, y = terrainHeight(cx, cz);
    b.add('brick', boxUV(boxB(180, 16, 160, cx, y - 14, cz)));
    for (let i = 0; i < 24; i++) b.add('dark', boxUV(boxB(3.6, 8, 0.4, cx - 84 + i * 7.3, y - 12, cz - 80.1)));
    b.add('marble', boxUV(boxB(46, 4.5, 28, cx, y + 2, cz)));
    b.add('marble', boxUV(boxB(36, 14, 20, cx, y + 6.5, cz + 2)));
    for (let i = 0; i < 6; i++) b.add('marble', boxUV(cyl(0.9, 1.0, 14, 12, cx - 15 + i * 6, y + 6.5, cz - 12)));
    const tri = new THREE.Shape(); tri.moveTo(-20, 0); tri.lineTo(20, 0); tri.lineTo(0, 6); tri.lineTo(-20, 0);
    b.add('marble', boxUV(xform(extrude(tri, 30, -15, 1), { x: cx, y: y + 20.5, z: cz })));
    b.add('roof', boxUV(xform(extrude(tri, 29.5, -14.6, 1), { x: cx, y: y + 20.9, z: cz })));
  }
  // 提图斯浴场（奥皮奥山南坡，公元 80 年落成）
  {
    const cx = 70, cz = -235, y = terrainHeight(cx, cz);
    b.add('travertine', boxUV(boxB(150, 6, 110, cx, y - 4, cz)));
    b.add('brick', boxUV(boxB(110, 22, 70, cx, y + 2, cz)));
    b.add('plaster_white', boxUV(boxB(40, 30, 40, cx, y + 2, cz)));
    for (const sx of [-1, 1]) {
      const v = norm(new THREE.CylinderGeometry(12, 12, 50, 24, 1, false, 0, Math.PI));
      b.add('roof', boxUV(xform(v, { rz: Math.PI / 2, ry: Math.PI / 2, x: cx + sx * 34, y: y + 24, z: cz })));
      b.add('dark', boxUV(boxB(0.4, 8, 30, cx + sx * 55.1, y + 10, cz)));
    }
    b.add('roof', boxUV(xform(norm(new THREE.SphereGeometry(20, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2)), { x: cx, y: y + 32, z: cz })));
    for (let i = 0; i < 9; i++) b.add('dark', boxUV(boxB(4, 9, 0.4, cx - 48 + i * 12, y + 5, cz + 35.1)));
    for (let i = 0; i < 5; i++) b.add('travertine', boxUV(boxB(40, 0.6, 2, cx, y - 4 + 1 + i * 0.6 * 1.8, cz + 56 - i * 2)));
  }
  // 民居（实例化）：避开山顶大建筑、道路与斗兽场周边
  const r = mulberry(99);
  const houses = [], roofs = [];
  const avoid = [[230, 300, 110], [70, -235, 95], [-232, -52, 40], [205, 18, 75], [-140, 62, 30]];
  let tries = 0;
  while (houses.length < 520 && tries++ < 8000) {
    const x = (r() - 0.5) * 2000, z = (r() - 0.5) * 2000;
    const { s } = locate(x, z);
    if (s > -95) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    if (Math.abs(z - 50 + x * 0.02) < 14 && x < -150) continue;     // 圣道
    if (Math.abs(z + 20 - (x - 100) * 0.1) < 12 && x > 120) continue;  // 拉比卡纳路
    const w = 10 + r() * 16, d = 9 + r() * 12, h = 7 + r() * 14;
    const rot = Math.round(r() * 3) * 0.04 + (x > 0 ? 0.25 : -0.1);
    const y = terrainHeight(x, z);
    houses.push({ x, y, z, w, d, h, rot, c: r() });
    roofs.push({ x, y: y + h, z, w: w + 0.8, d: d + 0.8, rot });
  }
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const hm = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.92 }), houses.length);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-0.5, 0); roofShape.lineTo(0.5, 0); roofShape.lineTo(0, 0.28); roofShape.lineTo(-0.5, 0);
  const roofG = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  const rm = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ color: 0xa65638, roughness: 0.85 }), roofs.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
  const cols = [0xd8b77e, 0xc8875a, 0xe2d5bc, 0xb8644a, 0xd9a868, 0xcfc3a8];
  houses.forEach((h, i) => {
    M.compose(new THREE.Vector3(h.x, h.y - 1, h.z), Q.setFromAxisAngle(Y, h.rot), new THREE.Vector3(h.w, h.h + 1, h.d));
    hm.setMatrixAt(i, M);
    hm.setColorAt(i, C.set(cols[Math.floor(h.c * cols.length)]));
    const rf = roofs[i];
    M.compose(new THREE.Vector3(rf.x, rf.y, rf.z), Q.setFromAxisAngle(Y, rf.rot), new THREE.Vector3(rf.w, rf.w * 0.8, rf.d));
    rm.setMatrixAt(i, M);
  });
  hm.castShadow = rm.castShadow = true; hm.receiveShadow = rm.receiveShadow = true;
  scene.add(hm, rm);

  // 树：意大利石松（伞形）与柏树
  const pines = [], cypress = [];
  tries = 0;
  while ((pines.length < 260 || cypress.length < 200) && tries++ < 9000) {
    const x = (r() - 0.5) * 1500, z = (r() - 0.5) * 1500;
    const { s } = locate(x, z);
    if (s > -40) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar * 0.9)) continue;
    if (houses.some((h) => Math.abs(h.x - x) < h.w / 2 + 3 && Math.abs(h.z - z) < h.d / 2 + 3)) continue;
    const y = terrainHeight(x, z);
    if (r() < 0.55) { if (pines.length < 260) pines.push([x, y, z, 0.8 + r() * 0.5, r() * 6]); }
    else if (cypress.length < 200) cypress.push([x, y, z, 0.8 + r() * 0.5, 0]);
  }
  const pineTrunk = merge([cyl(0.25, 0.4, 11, 7)]);
  const pineTop = merge([xform(norm(new THREE.IcosahedronGeometry(1, 1)), { sx: 6, sy: 2.2, sz: 6, y: 12 }), xform(norm(new THREE.IcosahedronGeometry(1, 1)), { sx: 4, sy: 1.8, sz: 4, y: 13.4, x: 1.5 })]);
  const cypG = merge([cyl(0.2, 0.3, 2, 6), xform(norm(new THREE.SphereGeometry(1, 10, 10)), { sx: 1.5, sy: 7, sz: 1.5, y: 8 })]);
  const inst = (geo, m, list) => {
    const im = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach(([x, y, z, s, ro], i) => { M.compose(new THREE.Vector3(x, y, z), Q.setFromAxisAngle(Y, ro), new THREE.Vector3(s, s, s)); im.setMatrixAt(i, M); });
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  };
  inst(pineTrunk, mat('trunk'), pines);
  inst(pineTop, mat('foliage'), pines);
  inst(cypG, mat('foliage_dark'), cypress);
}

export function buildSurroundings(scene) {
  const b = new Batcher('surroundings');
  buildTerrain(scene);
  // 广场铺地（外墙台阶外到 36 m）
  b.add('paving', ellipseRingFlat((s, th) => ringP(s, th), -2.8, -0.0, GROUND_Y + 0.0, 480));
  b.add('paving', ellipseRingFlat((s, th) => ringP(s, th), -38, -2.8, GROUND_Y + 0.01, 480));
  // 界石（距外墙约 18 m，每开间一块）
  const cip = merge([boxB(0.62, 1.35, 0.46, 0, 0, 0), xform(norm(new THREE.CylinderGeometry(0.31, 0.31, 0.46, 10, 1, false, 0, Math.PI)), { rx: Math.PI / 2, rz: Math.PI / 2, y: 1.35 }),
    xform(norm(new THREE.TorusGeometry(0.1, 0.025, 4, 10)), { y: 1.1, z: 0.24 })]);
  for (let k = 0; k < BAYS; k++) b.place('cippus', () => [{ mat: 'trav_smooth', geo: cip }], placeMatrix(-18, thetaAt(bayArc(k) + 3.38), GROUND_Y));
  // 道路
  road(b, [[-150, 55], [-260, 46], [-420, 28], [-700, 10]], 9);                // 圣道（向西通往广场）
  road(b, [[-120, 75], [-180, 160], [-230, 330], [-260, 700]], 9);            // 凯旋大道（帕拉蒂尼与西里欧之间）
  road(b, [[110, -5], [250, -5], [420, 15], [800, 50]], 8);                   // 拉比卡纳路
  road(b, [[60, -90], [70, -150], [80, -170]], 7);                             // 通往提图斯浴场
  const meta = buildMeta(b, scene);
  const colossus = buildColossus(scene, b);
  buildLudus(b);
  buildCity(scene, b);
  b.build(scene);
  return { meta, colossus, tris: b.tris, update(t) { for (const w of [meta.water, meta.film]) if (w.material.normalMap) w.material.normalMap.offset.set(t * 0.01, -t * 0.03); } };
}
