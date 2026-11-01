// 外立面四层（托斯卡纳 / 爱奥尼 / 科林斯 / 阁楼层）+ 外环两圈回廊（拱顶、内环墩柱）+ 台阶 + 门廊
// 每个开间在“局部立面坐标”中建模（见 core/ellipse.js），再弯曲贴合椭圆。
import * as THREE from 'three';
import { BAYS } from '../config.js';
import { BAY_W, bayArc, thetaAt, bend, placeMatrix, ringP } from '../core/ellipse.js';
import { sweepX, extrude, archPanelShape, box, boxB, merge, norm, xform, ellipseRingFlat } from '../core/geom.js';
import * as O from './orders.js';

const W = BAY_W, HW = W / 2;

// ---------- 截面（z 向外，y 向上，自下而上 / 自外而内） ----------
const ENT_T = [[0, 8.6], [0.5, 8.6], [0.5, 9.05], [0.55, 9.1], [0.55, 9.25], [0.42, 9.25], [0.42, 9.85], [0.5, 9.9], [0.56, 9.98], [0.6, 9.98],
  [0.95, 10.06], [1.0, 10.1], [1.0, 10.3], [1.06, 10.36], [1.06, 10.42], [0.98, 10.5], [0, 10.5]];
const entIC = (y0) => [[0, 0], [0.42, 0], [0.42, 0.2], [0.46, 0.22], [0.46, 0.4], [0.5, 0.42], [0.5, 0.58], [0.56, 0.62], [0.56, 0.68], [0.38, 0.68],
  [0.38, 1.22], [0.46, 1.26], [0.46, 1.34], [0.54, 1.38], [0.9, 1.5], [0.94, 1.54], [0.94, 1.74], [1.0, 1.8], [1.0, 1.87], [0.92, 1.95], [0, 1.95]].map(([z, y]) => [z, y + y0]);
const band = (y0, y1, back = -0.6) => [[0.36, y0], [0.36, y0 + 0.18], [0.3, y0 + 0.24], [0.3, y1 - 0.25], [0.36, y1 - 0.2], [0.36, y1 - 0.12], [0.42, y1 - 0.08], [0.42, y1], [back, y1], [back, y0]];
const ATTIC_BASE = [[0.45, 33.95], [0.45, 34.1], [0.38, 34.16], [0.38, 34.82], [0.44, 34.86], [0.44, 34.95], [0.3, 35.0], [0, 35.0]];
const ENT_TOP = [[0, 45.6], [0.3, 45.6], [0.3, 45.8], [0.34, 45.84], [0.34, 46.0], [0.22, 46.0], [0.22, 47.3], [0.3, 47.36], [0.36, 47.46], [0.9, 47.62], [0.95, 47.66],
  [0.95, 48.05], [1.02, 48.12], [1.02, 48.25], [0.92, 48.4], [-1.6, 48.4]];
const STEPS = [[2.8, -0.5], [2.8, -0.25], [1.4, -0.25], [1.4, 0], [0, 0]];

function archivolt(r0, r1, ys, depth = 0.1) {
  const s = new THREE.Shape();
  s.moveTo(r1, ys); s.absarc(0, ys, r1, 0, Math.PI, false); s.lineTo(-r0, ys); s.absarc(0, ys, r0, Math.PI, 0, true); s.lineTo(r1, ys);
  return extrude(s, depth, 0, 14);
}
/** 环形筒拱（从下往上看的内表面）：轴沿 x，圆心 z=zc，拱脚 ys */
function vault(zc, r, ys, x0 = -HW, x1 = HW, segX = 6, segA = 12) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < segX; i++) for (let j = 0; j < segA; j++) {
    const xa = x0 + ((x1 - x0) * i) / segX, xb = x0 + ((x1 - x0) * (i + 1)) / segX;
    const a0 = (Math.PI * j) / segA, a1 = (Math.PI * (j + 1)) / segA;
    const P = (x, a) => [x, ys + Math.sin(a) * r, zc + Math.cos(a) * r];
    const N = (a) => [0, -Math.sin(a), -Math.cos(a)];
    const q = [[xa, a0], [xa, a1], [xb, a1], [xa, a0], [xb, a1], [xb, a0]];
    for (const [x, a] of q) { pos.push(...P(x, a)); nor.push(...N(a)); uv.push(x, a * r); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function impost(y, r, h = 0.25, d = 0.12) {
  const w = HW - r;
  return merge([box(w, h, d, -(HW + r) / 2, y - h / 2, d / 2), box(w, h, d, (HW + r) / 2, y - h / 2, d / 2)]);
}
function pierFill(y0, h, r, z0, z1) {
  const w = HW - r;
  return merge([boxB(w, h, z1 - z0, -(HW + r) / 2, y0, (z0 + z1) / 2), boxB(w, h, z1 - z0, (HW + r) / 2, y0, (z0 + z1) / 2)]);
}
function numeralPlate(n) {
  const g = norm(new THREE.PlaneGeometry(1.1, 0.46));
  const idx = n - 1, col = idx % 8, row = Math.floor(idx / 8);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (col + 0.04 + u * 0.92) / 8, 1 - (row + 1) / 10 + (0.06 + v * 0.88) / 10);
  }
  return xform(g, { y: 8.12, z: 0.014 });
}
/** 门号：自南门（k=20）以东第一间起逆时针编号 I–LXXVI，四个轴线门不编号 */
export function gateNumber(k) {
  if (k % 20 === 0) return 0;
  const order = (k - 20 + BAYS) % BAYS;     // 1..79
  return order - Math.floor(order / 20);
}

export function buildFacade(b) {
  const ionic = O.ionicColumn(), tuscan = O.tuscanColumn(), corin = O.corinthianColumn(), pil = O.atticPilaster();
  const ped2 = O.pedestal(1.2, 1.7, 0.6), ped3 = O.pedestal(1.16, 1.65, 0.58), ped4 = O.pedestal(1.04, 1.05, 0.5);
  const statues = [0, 1, 2, 3].map((i) => O.statue(i));
  const shield = O.clipeus(), corbel = O.corbel();
  for (let k = 0; k < BAYS; k++) {
    const arc = bayArc(k);
    const chunk = Math.floor(((k + 10) % BAYS) / 20);
    const axis = k % 20 === 0;
    const add = (m, g, opt) => b.add(m, bend(g, arc, opt), chunk);
    const pierTh = thetaAt(arc + HW);
    const P = (key, proto, y, s = 0, x = -HW, rotY = 0) => b.place(key, () => proto, placeMatrix(s, thetaAt(arc - x), y, 1, rotY));

    // 台阶
    add('travertine', sweepX(STEPS, -HW, HW, 6));
    // ---- 底层 ----
    add('travertine', extrude(archPanelShape(W, 8.6, 4.2, 5.0, 0), 2.4, -2.4, 12));
    add('trav_smooth', archivolt(2.1, 2.45, 5.0));
    add('trav_smooth', boxB(0.42, 0.5, 0.16, 0, 6.98, 0.08));
    add('trav_smooth', impost(5.0, 2.1));
    add('travertine', boxB(W, 1.9, 2.4, 0, 8.6, -1.2));
    add('trav_smooth', sweepX(ENT_T, -HW, HW, 6));
    const n = gateNumber(k);
    if (n) add('numerals', numeralPlate(n), { uvMode: 'keep' });
    P('tuscan', tuscan, 0);
    // ---- 二层 ----
    add('trav_smooth', sweepX(band(10.5, 12.2), -HW, HW, 6));
    add('travertine', pierFill(10.5, 1.7, 2.1, -2.4, -0.6));
    add('travertine', extrude(archPanelShape(W, 8.2, 4.2, 3.7, 12.2), 2.4, -2.4, 12));
    add('trav_smooth', archivolt(2.1, 2.4, 15.9));
    add('trav_smooth', impost(15.9, 2.1, 0.22, 0.1));
    add('travertine', boxB(W, 1.95, 2.4, 0, 20.4, -1.2));
    add('trav_smooth', sweepX(entIC(20.4), -HW, HW, 6));
    P('ped2', ped2, 10.5); P('ionic', ionic, 12.2);
    // ---- 三层 ----
    add('trav_smooth', sweepX(band(22.35, 24.0), -HW, HW, 6));
    add('travertine', pierFill(22.35, 1.65, 2.1, -2.4, -0.6));
    add('travertine', extrude(archPanelShape(W, 8.0, 4.2, 3.4, 24.0), 2.4, -2.4, 12));
    add('trav_smooth', archivolt(2.1, 2.4, 27.4));
    add('trav_smooth', impost(27.4, 2.1, 0.22, 0.1));
    add('travertine', boxB(W, 1.95, 2.4, 0, 32.0, -1.2));
    add('trav_smooth', sweepX(entIC(32.0), -HW, HW, 6));
    P('ped3', ped3, 22.35); P('corin', corin, 24.0);
    // 雕像（二、三层拱门）
    const sv = statues[k % 4];
    b.place('statue:' + (k % 4), () => sv, placeMatrix(0.12, thetaAt(arc), 12.2));
    b.place('statue:' + ((k + 2) % 4), () => statues[(k + 2) % 4], placeMatrix(0.12, thetaAt(arc), 24.0));
    // ---- 阁楼层 ----
    add('trav_smooth', sweepX(ATTIC_BASE, -HW, HW, 6));
    add('travertine', boxB(W, 1.05, 1.6, 0, 33.95, -0.8));
    const sh = new THREE.Shape();
    sh.moveTo(-HW, 35); sh.lineTo(HW, 35); sh.lineTo(HW, 45.6); sh.lineTo(-HW, 45.6); sh.lineTo(-HW, 35);
    const win = k % 2 === 0;
    if (win) {
      const h = new THREE.Path();
      h.moveTo(-0.65, 38.4); h.lineTo(-0.65, 40.5); h.lineTo(0.65, 40.5); h.lineTo(0.65, 38.4); h.lineTo(-0.65, 38.4);
      sh.holes.push(h);
    }
    add('travertine', extrude(sh, 1.6, -1.6, 4));
    if (win) {
      add('trav_smooth', merge([boxB(1.66, 0.18, 0.1, 0, 40.5, 0.05), boxB(1.66, 0.14, 0.12, 0, 38.26, 0.06), boxB(0.16, 2.1, 0.08, -0.73, 38.4, 0.04), boxB(0.16, 2.1, 0.08, 0.73, 38.4, 0.04)]));
      add('dark', box(1.3, 2.1, 0.02, 0, 39.45, -1.5));
    } else {
      P('shield', shield, 39.5, 0, 0);
    }
    add('travertine', boxB(W, 2.8, 1.6, 0, 45.6, -0.8));
    add('trav_smooth', sweepX(ENT_TOP, -HW, HW, 6));
    P('ped4', ped4, 33.95); P('pilaster', pil, 35.0);
    for (const cx of [-W / 3, 0, W / 3]) P('corbel', corbel, 43.4, 0, cx);

    // ---- 外环回廊：内环墩柱（s 6.8–8.6）、第二圈回廊、内墙（s 13–14.6）、拱顶 ----
    add('travertine', extrude(archPanelShape(W, 11.0, 4.4, 5.2, 0), 1.8, -8.6, 10));
    add('travertine', extrude(archPanelShape(W, 11.8, 4.4, 5.0, 11.0), 1.8, -8.6, 10));
    add('travertine', extrude(archPanelShape(W, 11.7, 4.4, 4.8, 22.8), 1.8, -8.6, 10));
    add('brick', vault(-4.6, 2.2, 6.2));
    add('brick', vault(-4.6, 2.2, 17.0));
    add('brick', vault(-4.6, 2.2, 28.6));
    add('brick', vault(-10.8, 2.2, 6.2));
    add('brick', vault(-10.8, 2.2, 17.0));
    const dw = axis ? 4.2 : 2.6;
    add('tuff', extrude(archPanelShape(W, 11.0, dw, axis ? 4.6 : 3.0, 0), 1.6, -14.6, 10));
    add('tuff', extrude(archPanelShape(W, 11.8, 2.6, 3.0, 11.0), 1.6, -14.6, 10));
    if (!axis) add('dark', boxB(3.0, 4.6, 0.3, 0, 0, -14.75));
    add('dark', boxB(3.0, 4.6, 0.3, 0, 11.0, -14.75));
    // 墩柱间横墙（放射墙）在回廊内的截面：只做门洞上方的拱券连接（视觉上的横向拱）
    add('brick', merge([boxB(0.9, 2.4, 4.4, -HW, 8.6, -4.6), boxB(0.9, 2.4, 4.4, -HW, 19.4, -4.6), boxB(0.9, 2.4, 4.4, -HW, 8.6, -10.8)]));

    // ---- 南北轴线门廊 ----
    if (k === 20 || k === 60) {
      for (const x of [-2.9, 2.9]) {
        for (const p of O.freeColumn(8.3, 0.46, 'tuscan', 'trav_smooth', 'trav_smooth')) b.place('porchcol:' + p.mat, () => [p], placeMatrix(-3.8, thetaAt(arc - x), 0.3));
        add('trav_smooth', boxB(1.3, 0.3, 1.3, x, 0, 3.8));
      }
      add('trav_smooth', boxB(7.4, 1.9, 4.4, 0, 8.6, 2.2));
      const tri = new THREE.Shape();
      tri.moveTo(-3.9, 0); tri.lineTo(3.9, 0); tri.lineTo(0, 2.4); tri.lineTo(-3.9, 0);
      add('travertine', xform(extrude(tri, 4.6, -0.2, 2), { y: 10.5 }));
      add('trav_smooth', sweepX([[4.4, 10.5], [4.55, 10.6], [4.55, 10.75], [4.4, 10.8]], -3.9, 3.9, 2));
      // 门廊上方的四马战车雕像底座（青铜像简化）
      add('gilded', merge([boxB(1.6, 0.5, 1.2, 0, 12.9, 2.2), boxB(0.4, 1.6, 0.4, 0, 13.4, 2.2)]));
    }
  }
  // ---- 各层楼面 ----
  b.add('tile_floor', ellipseRingFlat(ringP, -0.01, 14.6, 0.015, 480));
  b.add('paving', ellipseRingFlat(ringP, 0.6, 13.0, 11.0, 480));
  b.add('paving', ellipseRingFlat(ringP, 0.6, 8.6, 22.8, 480));
}
