// 竞技场：铺沙木地板（南北两半，可揭开北半部看地下室）、活板门与升降机、地下室（图密善增建）、长轴大门隧道、
// 护墙防护网、海战表演用的注水水面
import * as THREE from 'three';
import { ARENA, OUTER } from '../config.js';
import { boxB, box, cyl, merge, norm, xform, boxUV } from '../core/geom.js';
import { mat } from '../core/materials.js';
import { ringP, semiA, semiB } from '../core/ellipse.js';

export const HYPO_DEPTH = 6.2;
const A = ARENA.A, B = ARENA.B;

/** 升降机位置：沿外圈通道，避开长轴两端大门；另有中央布景大升降台 */
export const LIFTS = (() => {
  const out = [];
  const n = 32;
  for (let i = 0; i < n; i++) {
    const th = ((i + 0.5) / n) * Math.PI * 2;
    const x = (A - 3.2) * Math.cos(th), z = (B - 3.2) * Math.sin(th);
    if (Math.abs(z) < 4) continue;    // 长轴两端留给大门
    out.push({ id: out.length, x, z, rot: Math.atan2(-(B - 3.2) * Math.cos(th), (A - 3.2) * Math.sin(th)) });
  }
  return out;
})();
export const CENTER_LIFT = { x: 0, z: 0, w: 9, d: 3.4 };
const TRAP = 1.9;

function ellipseShapePoints(a, b, th0, th1, n = 96) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = th0 + ((th1 - th0) * i) / n;
    pts.push(new THREE.Vector2(a * Math.cos(t), -b * Math.sin(t)));
  }
  return pts;
}
function rectPath(cx, cz, w, d, rot = 0) {
  const p = new THREE.Path();
  const c = Math.cos(rot), s = Math.sin(rot);
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c]);
  // ShapeGeometry 平面坐标 (x, -z)
  corners.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z)));
  p.lineTo(corners[0][0], -corners[0][1]);
  return p;
}

export function buildArena(scene, b) {
  const group = new THREE.Group();
  group.name = 'arena';
  scene.add(group);

  // ---------- 地板：南半 / 北半 ----------
  const halves = {};
  for (const [key, th0, th1] of [['south', 0, Math.PI], ['north', Math.PI, Math.PI * 2]]) {
    const sh = new THREE.Shape(ellipseShapePoints(A + 0.05, B + 0.05, th0, th1));
    for (const l of LIFTS) if ((key === 'south') === l.z > 0) sh.holes.push(rectPath(l.x, l.z, TRAP, TRAP, l.rot));
    if (key === 'north') sh.holes.push(rectPath(0, -CENTER_LIFT.d / 2 - 0.02, CENTER_LIFT.w, CENTER_LIFT.d));
    const top = new THREE.ShapeGeometry(sh, 24).rotateX(-Math.PI / 2);
    boxUV(norm(top));
    const geo = norm(top);
    const m = new THREE.Mesh(boxUV(geo), mat('sand'));
    m.receiveShadow = true;
    m.name = 'floor:' + key;
    group.add(m);
    // 地板厚度与下方梁格（揭开时可见）
    const under = [];
    under.push(box(2 * A, 0.3, 0.3, 0, -0.18, key === 'south' ? 0.15 : -0.15));
    for (let x = -A + 2; x < A - 1; x += 2.4) {
      const half = B * Math.sqrt(Math.max(0, 1 - (x / A) ** 2));
      if (half < 0.5) continue;
      under.push(box(0.25, 0.35, half, x, -0.33, key === 'south' ? half / 2 : -half / 2));
    }
    const um = new THREE.Mesh(boxUV(merge(under)), mat('wood_dark'));
    um.castShadow = true;
    group.add(um);
    halves[key] = [m, um];
  }
  // 中央升降台盖板（北半边一块，开合时整体下降）
  const centerTrap = new THREE.Mesh(boxUV(box(CENTER_LIFT.w, 0.2, CENTER_LIFT.d, 0, -0.1, -CENTER_LIFT.d / 2 - 0.02)), mat('sand'));
  centerTrap.receiveShadow = true;
  group.add(centerTrap);

  // ---------- 活板门 + 竖井 + 升降平台 ----------
  const lifts = [];
  const shaftG = [];
  for (const l of LIFTS) {
    const pivot = new THREE.Group();
    pivot.position.set(l.x, 0, l.z);
    pivot.rotation.y = -l.rot;
    group.add(pivot);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0, -TRAP / 2);
    pivot.add(hinge);
    const flap = new THREE.Mesh(boxUV(box(TRAP - 0.04, 0.12, TRAP - 0.04, 0, -0.06, TRAP / 2)), mat('sand'));
    flap.receiveShadow = true; flap.castShadow = true;
    hinge.add(flap);
    const plat = new THREE.Group();
    plat.position.y = -HYPO_DEPTH + 0.3;
    pivot.add(plat);
    const pm = new THREE.Mesh(boxUV(merge([box(TRAP - 0.15, 0.18, TRAP - 0.15, 0, 0, 0)])), mat('wood'));
    pm.castShadow = true;
    plat.add(pm);
    // 木笼（升到顶后笼门打开）
    const cage = new THREE.Mesh(boxUV(merge([
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => box(0.12, 2.0, 0.12, sx * 0.78, 1.0, sz * 0.78)),
      box(1.7, 0.12, 1.7, 0, 2.0, 0),
      ...[-0.4, 0, 0.4].map((x) => box(0.06, 2.0, 0.06, x, 1.0, 0.78)),
      ...[-0.4, 0, 0.4].map((x) => box(0.06, 2.0, 0.06, x, 1.0, -0.78)),
      ...[-0.4, 0, 0.4].map((z) => box(0.06, 2.0, 0.06, -0.78, 1.0, z)),
    ])), mat('wood_dark'));
    cage.castShadow = true;
    plat.add(cage);
    const SH = HYPO_DEPTH - 0.35, SY = -HYPO_DEPTH / 2 - 0.175;
    shaftG.push(xform(merge([box(0.15, SH, TRAP + 0.3, -TRAP / 2 - 0.08, SY, 0), box(0.15, SH, TRAP + 0.3, TRAP / 2 + 0.08, SY, 0),
      box(TRAP + 0.3, SH, 0.15, 0, SY, -TRAP / 2 - 0.08)]), { x: l.x, z: l.z, ry: -l.rot }));
    // 绞盘（立轴 + 四根推杆）
    const cx = l.x * 0.9, cz = l.z * 0.9;
    const cap = new THREE.Group();
    cap.position.set(cx - Math.sign(l.x) * 0.5, -HYPO_DEPTH, cz - Math.sign(l.z) * 1.6);
    const capG = merge([cyl(0.22, 0.22, 3.2, 10), ...[0, 1, 2, 3].map((i) => xform(box(3.0, 0.12, 0.12, 0, 1.1, 0), { ry: (i * Math.PI) / 4 }))]);
    cap.add(new THREE.Mesh(boxUV(capG), mat('wood')));
    group.add(cap);
    lifts.push({ ...l, pivot, hinge, flap, plat, cage, capstan: cap, state: 0 });
  }
  const shafts = new THREE.Mesh(boxUV(merge(shaftG)), mat('tuff'));
  shafts.castShadow = true; shafts.receiveShadow = true;
  group.add(shafts);

  // ---------- 地下室墙体 ----------
  const hyp = new THREE.Group();
  hyp.name = 'hypogeum';
  group.add(hyp);
  const walls = [], bricks = [], floor = [];
  // 外圈墙
  const n = 160;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [(A + 0.4) * Math.cos(a0), (B + 0.4) * Math.sin(a0)], p1 = [(A + 0.4) * Math.cos(a1), (B + 0.4) * Math.sin(a1)];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const g = box(len + 0.05, HYPO_DEPTH - 0.45, 0.8, 0, -HYPO_DEPTH / 2 - 0.22, 0);
    xform(g, { x: (p0[0] + p1[0]) / 2, z: (p0[1] + p1[1]) / 2, ry: -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) });
    walls.push(g);
  }
  // 平行于长轴的墙（中央通道 + 两侧各四道），开拱形门洞
  const zs = [2.0, 5.6, 9.2, 12.8, 16.4];
  for (const zz of zs) for (const sz of [-1, 1]) {
    const z = zz * sz;
    const half = (A - 3.5) * Math.sqrt(Math.max(0, 1 - (z / (B - 3.0)) ** 2));
    if (half < 2) continue;
    for (let x = -half; x < half; x += 6.2) {
      const seg = Math.min(6.2, half - x);
      if (seg < 1) continue;
      const solid = Math.max(0.6, seg - 2.2);
      walls.push(box(solid, HYPO_DEPTH - 0.45, 0.75, x + solid / 2, -HYPO_DEPTH / 2 - 0.22, z));
      if (seg > solid) bricks.push(box(seg - solid, 1.6, 0.75, x + solid + (seg - solid) / 2, -1.0, z));
    }
  }
  // 横向墙
  for (let x = -30; x <= 30; x += 10) {
    const half = (B - 3.2) * Math.sqrt(Math.max(0, 1 - (x / (A - 2)) ** 2));
    for (const sz of [-1, 1]) walls.push(box(0.75, HYPO_DEPTH - 0.45, half - 2.4, x, -HYPO_DEPTH / 2 - 0.22, sz * (2.4 + (half - 2.4) / 2)));
  }
  floor.push(xform(norm(new THREE.CircleGeometry(1, 64)).rotateX(-Math.PI / 2), { sx: A, sz: B, y: -HYPO_DEPTH }));
  const hypMat = mat('tuff').clone(); hypMat.color.set(0x857862);
  const wm = new THREE.Mesh(boxUV(merge(walls)), hypMat);
  wm.castShadow = true; wm.receiveShadow = true;
  const bm = new THREE.Mesh(boxUV(merge(bricks)), hypMat);
  const fm = new THREE.Mesh(boxUV(merge(floor)), mat('wood_dark'));
  fm.receiveShadow = true;
  hyp.add(wm, bm, fm);
  // 兽笼（沿中央通道两侧）
  const cages = [];
  for (let x = -26; x <= 26; x += 4) for (const sz of [-1, 1]) {
    const z = sz * 3.8;
    cages.push(...[-0.9, -0.45, 0, 0.45, 0.9].map((dx) => box(0.08, 2.4, 0.08, x + dx, -HYPO_DEPTH + 1.2, z - sz * 1.0)));
    cages.push(box(2.0, 0.12, 0.12, x, -HYPO_DEPTH + 2.4, z - sz * 1.0));
  }
  const cm = new THREE.Mesh(boxUV(merge(cages)), mat('iron'));
  hyp.add(cm);
  // 地下照明（火把）——仅揭开地板时启用
  const torches = [];
  for (const [x, z] of [[-24, -7], [0, -7], [24, -7], [-12, -14], [12, -14]]) {
    const L = new THREE.PointLight(0xffa04a, 0, 22, 1.6);
    L.position.set(x, -HYPO_DEPTH + 3, z);
    hyp.add(L);
    torches.push(L);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
    fl.position.copy(L.position);
    hyp.add(fl);
  }

  // ---------- 长轴大门隧道（东西） ----------
  const tun = [], tunV = [], tunF = [];
  for (const sx of [-1, 1]) {
    const x0 = A + 0.2, x1 = semiA(14.6) + 0.5;
    const len = x1 - x0, cx = sx * (x0 + len / 2);
    tun.push(boxB(len, 3.6, 0.9, cx, 0, 2.75), boxB(len, 3.6, 0.9, cx, 0, -2.75));
    tunV.push(boxB(len, 0.5, 6.4, cx, 3.6, 0));
    tunF.push(boxB(len, 0.02, 4.6, cx, 0, 0));
    // 隧道里每隔 6 m 一道横拱
    for (let x = x0 + 3; x < x1; x += 6) tunV.push(boxB(0.6, 0.4, 4.6, sx * x, 3.2, 0));
  }
  const tm = new THREE.Mesh(boxUV(merge(tun)), mat('tuff'));
  const tv = new THREE.Mesh(boxUV(merge(tunV)), mat('brick'));
  const tf = new THREE.Mesh(boxUV(merge(tunF)), mat('sand'));
  for (const m of [tm, tv, tf]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }

  // ---------- 护墙防护网与网杆 ----------
  const netTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const netMat = mat('net').clone();
  netMat.alphaMap = netTex; netMat.alphaTest = 0.3; netMat.transparent = false; netMat.opacity = 1;
  const netPos = [], netUV = [];
  const NS = 240;
  let arc = 0;
  for (let i = 0; i < NS; i++) {
    const a0 = (i / NS) * Math.PI * 2, a1 = ((i + 1) / NS) * Math.PI * 2;
    const p0 = ringP(53.15, a0), p1 = ringP(53.15, a1);
    const l = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const q = [[p0, 4.2, arc], [p1, 4.2, arc + l], [p1, 6.6, arc + l], [p0, 4.2, arc], [p1, 6.6, arc + l], [p0, 6.6, arc]];
    for (const [p, y, u] of q) { netPos.push(p.x, y, p.z); netUV.push(u / 0.35, y / 0.35); }
    arc += l;
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(netPos, 3));
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(netUV, 2));
  ng.computeVertexNormals();
  const net = new THREE.Mesh(ng, netMat);
  group.add(net);
  const posts = [];
  for (let i = 0; i < 120; i++) {
    const th = (i / 120) * Math.PI * 2;
    const p = ringP(53.15, th);
    posts.push(cyl(0.05, 0.06, 2.6, 6, p.x, 4.15, p.z));
    // 网杆顶端的象牙滚筒托
    posts.push(cyl(0.09, 0.09, 0.12, 8, p.x, 6.7, p.z));
  }
  const pm = new THREE.Mesh(boxUV(merge(posts)), mat('bronze'));
  group.add(pm);

  // ---------- 海战水面 ----------
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), mat('water'));
  water.scale.set(A + 0.3, 1, B + 0.3);
  water.visible = false;
  water.receiveShadow = true;
  group.add(water);

  // ---------- 接口 ----------
  let hypOpen = false;
  function setHypogeum(open) {
    hypOpen = open;
    for (const m of halves.north) m.visible = !open;
    for (const l of lifts) if (l.z < 0) l.flap.visible = !open;
    centerTrap.visible = !open;
    for (const t of torches) t.intensity = open ? 60 : 0;
  }
  setHypogeum(false);
  function setWater(level) {
    water.visible = level > 0.02;
    water.position.y = level;
  }
  /** 升降机动画：t ∈ [0,1]，0 = 地下，1 = 地面；门在 0.6 之后打开 */
  function setLift(i, t) {
    const l = lifts[i];
    l.plat.position.y = -HYPO_DEPTH + 0.3 + (HYPO_DEPTH - 0.2) * Math.min(1, t);
    l.hinge.rotation.x = -Math.min(1, Math.max(0, (t - 0.0) / 0.35)) * 1.9;
    l.capstan.rotation.y = t * 12;
    l.cage.visible = t < 0.999 || l.keepCage;
  }
  function closeLift(i) { const l = lifts[i]; l.plat.position.y = -HYPO_DEPTH + 0.3; l.hinge.rotation.x = 0; l.cage.visible = true; }
  function setCenterLift(t) {
    centerTrap.position.y = -HYPO_DEPTH * (1 - t);
    centerTrap.visible = !hypOpen || t > 0.99;
  }
  function update(t) {
    if (water.visible) { const m = water.material; m.normalMap.offset.set(t * 0.01, t * 0.007); }
    for (const tc of torches) if (tc.intensity) tc.intensity = 55 + Math.sin(t * 13 + tc.position.x) * 6;
  }
  return { group, lifts, setHypogeum, setWater, setLift, closeLift, setCenterLift, centerTrap, water, update, get hypOpen() { return hypOpen; } };
}
