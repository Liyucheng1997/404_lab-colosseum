// 看台：讲台层（元老席）→ 第一区（骑士）→ 第二区下/上半区（平民）→ 顶层木座 → 顶层柱廊
// 截面用 (s, y) 描述（s = 自外墙外皮向内的进深）；在局部立面坐标里 z = -s，沿开间扫掠后弯曲贴合。
import * as THREE from 'three';
import { BAYS } from '../config.js';
import { BAY_W, PERIM, bayArc, thetaAt, bend, placeMatrix, semiA, semiB, ringP } from '../core/ellipse.js';
import { sweepX, boxB, box, merge, extrude, xform, ellipseRingFlat, norm } from '../core/geom.js';
import { freeColumn } from './orders.js';

const HW = BAY_W / 2;
const perim = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
/** 进深 s 处 1 米世界长度对应的局部 x 长度 */
export const widthFactor = (s) => PERIM / perim(semiA(s), semiB(s));

// 看台分区（自下而上）。walk: 前方走道 [s0, s1] 标高 y；hb 矮墙高；rows/rise/run 座位排；mat 材质
export const TIERS = [
  { key: 'podium', name: '讲台层元老席', walk: [53, 52.0], y: 4.0, hb: 0, rows: 3, rise: 0.4, run: 0.9, mat: 'marble', vom: null, aisle: null },
  { key: 'primum', name: '第一区骑士席', walk: [49.3, 48.3], y: 5.2, hb: 1.2, rows: 14, rise: 0.45, run: 0.72, mat: 'seat', vom: 2, aisle: 0 },
  { key: 'imum', name: '第二区平民席', walk: [38.22, 37.2], y: 12.7, hb: 1.2, rows: 16, rise: 0.5, run: 0.72, mat: 'seat', vom: 0, aisle: 2 },
  { key: 'summum', name: '第二区平民席', walk: [25.68, 24.6], y: 21.9, hb: 1.2, rows: 12, rise: 0.56, run: 0.72, mat: 'seat', vom: 2, aisle: 0 },
  { key: 'ligneis', name: '顶层木座', walk: [15.96, 15.0], y: 29.82, hb: 2.18, rows: 10, rise: 0.62, run: 0.78, mat: 'wood_seat', vom: 1, aisle: null },
];
const VOM_W = 2.4, VOM_H = 2.4, VOM_ROWS = 3, AISLE_W = 1.1;

/** 每排座位的 (s 前沿, s 后沿, y 座面)，供人群摆放 */
export function seatRows() {
  const out = [];
  for (const t of TIERS) {
    let s = t.walk[1], y = t.y + t.hb;
    for (let i = 0; i < t.rows; i++) {
      out.push({ tier: t.key, i, sFront: s, sBack: s - t.run, y: y + t.rise, rise: t.rise });
      s -= t.run; y += t.rise;
    }
  }
  return out;
}
/** 某开间某区是否有出入口 / 楼梯（人群避让用） */
export function hasVom(t, k) { return t.vom !== null && k % 20 !== 0 && (t.key === 'ligneis' ? k % 2 === 1 : k % 4 === t.vom); }
export function hasAisle(t, k) { return t.aisle !== null && k % 4 === t.aisle; }

/** 看台截面折线（局部 z = -s），自竞技场向外向上 */
function tierProfile(t, from = 0) {
  const P = [];
  let s = t.walk[1], y = t.y + t.hb;
  if (from === 0) {
    P.push([-t.walk[0], t.y], [-t.walk[1], t.y]);
    if (t.hb) P.push([-t.walk[1], t.y + t.hb]);
  } else {
    s -= t.run * from; y += t.rise * from;
    P.push([-s, y]);
  }
  for (let i = from; i < t.rows; i++) {
    P.push([-s, y + t.rise]);
    s -= t.run; y += t.rise;
    P.push([-s, y]);
  }
  return P;
}
function aisleProfile(t) {
  const P = [[-t.walk[1], t.y + t.hb]];
  let s = t.walk[1], y = t.y + t.hb;
  for (let i = 0; i < t.rows * 2; i++) {
    P.push([-s, y + t.rise / 2]);
    s -= t.run / 2; y += t.rise / 2;
    P.push([-s, y]);
  }
  return P;
}

export function buildCavea(b) {
  const sMid = (t) => (t.walk[1] + t.walk[1] - t.rows * t.run) / 2;
  for (let k = 0; k < BAYS; k++) {
    const arc = bayArc(k);
    const chunk = Math.floor(((k + 10) % BAYS) / 20);
    const add = (m, g) => b.add(m, bend(g, arc), chunk);
    const sweep = (m, pts, x0, x1, seg = 4) => { if (x1 - x0 > 0.01) add(m, sweepX(pts, x0, x1, seg, true)); };
    const gate = k === 0 || k === 40;
    const box_ = k === 20 || k === 60;

    // ---- 护墙（竞技场一侧）+ 讲台层 ----
    const fw = widthFactor(53);
    const gw = gate ? 4.6 * fw / 2 : 0;
    const podiumWall = [[-53, 0], [-53, 4.0]];
    sweep('marble', podiumWall, -HW, -gw, 6); sweep('marble', podiumWall, gw, HW, 6);
    if (gate) {
      // 大门：拱形门洞 + 门框，门洞内为通往外面的隧道
      const sh = new THREE.Shape();
      const w = 2.3 * fw, top = 3.6;
      sh.moveTo(-w - 0.5, 0); sh.lineTo(-w, 0); sh.lineTo(-w, top - 0.6); sh.quadraticCurveTo(0, top + 0.5, w, top - 0.6); sh.lineTo(w, 0); sh.lineTo(w + 0.5, 0); sh.lineTo(w + 0.5, 4.0); sh.lineTo(-w - 0.5, 4.0);
      add('marble', extrude(sh, 0.6, -53.3, 10));
    }
    // 护墙顶石 + 大理石栏杆
    add('marble', sweepX([[-53.25, 4.0], [-53.25, 4.12], [-53.0, 4.18], [-52.6, 4.18]], -HW, HW, 6, true));
    add('marble', merge([boxB(BAY_W, 0.85, 0.22, 0, 4.18, -52.75), boxB(BAY_W, 0.1, 0.32, 0, 5.03, -52.75)]));
    // 护墙上的小门（通往护墙后的服务走廊）
    if (k % 4 === 1) add('dark', boxB(1.0 * fw, 2.1, 0.05, 0, 0.0, -53.03));
    // 元老席三级宽台阶
    const pod = TIERS[0];
    if (!box_) sweep('marble', tierProfile(pod), -HW, HW, 6);
    else {
      const bw = 6.5 * widthFactor(51);
      sweep('marble', tierProfile(pod), -HW, -bw, 4); sweep('marble', tierProfile(pod), bw, HW, 4);
      sweep('marble', [[-53, 4.0], [-49.3, 4.0]], -bw, bw, 4);
    }
    // 元老席后矮墙 + 走道
    // ---- 第一区 → 顶层木座 ----
    for (const t of TIERS.slice(1)) {
      const f = widthFactor(t.walk[1]);
      const vom = hasVom(t, k), ais = hasAisle(t, k);
      const vw = (VOM_W * f) / 2, aw = (AISLE_W * f) / 2;
      const mat = t.mat;
      const wallMat = t.key === 'ligneis' ? 'travertine' : 'trav_smooth';
      // 走道 + 矮墙（矮墙另用墙材）
      const walk = [[-t.walk[0], t.y], [-t.walk[1], t.y]];
      const wall = [[-t.walk[1], t.y], [-t.walk[1], t.y + t.hb]];
      const rows = tierProfile(t).slice(t.hb ? 3 : 2);
      rows.unshift([-t.walk[1], t.y + t.hb]);
      const cuts = [];
      if (vom) cuts.push([-vw, vw, 'vom']);
      if (ais) cuts.push([-aw, aw, 'aisle']);
      cuts.sort((a, c) => a[0] - c[0]);
      sweep('paving', walk, -HW, HW, 6);
      let x = -HW;
      for (const [c0, c1, kind] of cuts) {
        if (t.hb) sweep(wallMat, wall, x, c0, 3);
        sweep(mat, rows, x, c0, 3);
        if (kind === 'aisle') {
          if (t.hb) sweep(wallMat, wall, c0, c1, 1);
          sweep(mat, aisleProfile(t), c0, c1, 1);
        } else {
          // 出入口：门洞（暗）+ 过梁 + 上方座位 + 两侧挡墙
          const sw = t.walk[1], sd = sw - t.run * VOM_ROWS, yt = t.y + t.hb + t.rise * VOM_ROWS;
          sweep('dark', [[-sw, t.y], [-sd, t.y], [-sd, t.y + VOM_H], [-sw, t.y + VOM_H]], c0, c1, 1);
          sweep(wallMat, [[-sw, t.y + VOM_H], [-sw, yt], [-sd, yt]], c0, c1, 1);
          sweep(mat, tierProfile(t, VOM_ROWS), c0, c1, 1);
          for (const cx of [c0 - 0.14, c1 + 0.14]) {
            const g = boxB(0.28, yt - t.y + 0.55, sw - sd + 0.2, cx, t.y, -(sw + sd) / 2);
            add(wallMat, g);
          }
        }
        x = c1;
      }
      if (t.hb) sweep(wallMat, wall, x, HW, 3);
      sweep(mat, rows, x, HW, 3);
    }
    // 木座下的支撑面与背墙
    add('wood_dark', boxB(BAY_W * 0.62, 6.2, 0.2, 0, 32.0, -7.1));

    // ---- 顶层柱廊（s ≈ 6.4）----
    for (const cx of [-HW, 0]) {
      const cols = freeColumn(7.4, 0.32, 'corinthian', cx === 0 ? 'marble_col' : 'marble', 'marble');
      cols.forEach((p, i) => b.place('portico:' + i + ':' + p.mat, () => [p], placeMatrix(6.4, thetaAt(arc - cx * widthFactor(6.4) / widthFactor(6.4)), 38.2)));
    }
    add('paving', sweepX([[-7.2, 38.2], [-1.6, 38.2]], -HW, HW, 4, true));
    add('marble', sweepX([[-6.75, 45.6], [-6.75, 46.2], [-6.85, 46.28], [-6.85, 46.62], [-6.4, 46.62]], -HW, HW, 4, true));
    add('wood_dark', sweepX([[-6.1, 45.6], [-1.6, 45.6]], -HW, HW, 3, false));
    add('roof', sweepX([[-6.85, 46.62], [-1.6, 47.15]], -HW, HW, 3, true));
    // 柱廊屋顶平台的护栏
    add('trav_smooth', boxB(BAY_W, 0.9, 0.18, 0, 46.62, -6.75));

    // ---- 皇帝包厢（南）/ 主办官包厢（北）----
    if (box_) buildBox(b, k, arc, chunk);
  }
  // 讲台层后、第一区前的矮墙已含在走道中；竞技场一周的排水沟
  b.add('trav_smooth', ellipseRingFlat(ringP, 52.98, 53.5, 0.02, 400));
}

/** 包厢：在讲台层上凸出的平台，四柱、山花、紫色帷幔 */
function buildBox(b, k, arc, chunk) {
  const imperial = k === 20;
  const f = widthFactor(51);
  const add = (m, g) => b.add(m, bend(g, arc), chunk);
  const W = 6.0 * f;
  // 平台（向场内凸出 1 m）
  add('marble', boxB(W * 2, 0.3, 4.6, 0, 3.9, -51.6));
  add('marble', merge([boxB(W * 2, 4.2, 0.3, 0, 0, -54.0)]));
  add('marble', boxB(W * 2 + 0.2, 1.1, 0.3, 0, 4.2, -53.9));
  add('gilded', boxB(W * 1.2, 0.5, 0.06, 0, 4.45, -54.08));
  // 宝座与长凳
  if (imperial) {
    add('purple', merge([boxB(1.0, 0.5, 0.8, -0.8, 4.2, -51.8), boxB(1.0, 1.4, 0.18, -0.8, 4.2, -51.35), boxB(1.0, 0.5, 0.8, 0.8, 4.2, -51.8), boxB(1.0, 1.4, 0.18, 0.8, 4.2, -51.35)]));
    add('gilded', merge([boxB(1.1, 0.1, 0.9, -0.8, 4.7, -51.8), boxB(1.1, 0.1, 0.9, 0.8, 4.7, -51.8)]));
  }
  add('marble', merge([boxB(W * 1.6, 0.45, 0.6, 0, 4.2, -50.2), boxB(W * 1.6, 0.45, 0.6, 0, 4.65, -49.6)]));
  // 四柱 + 檐部 + 山花
  for (const x of [-W + 0.4, -W / 3, W / 3, W - 0.4]) {
    freeColumn(4.6, 0.26, 'corinthian', 'marble_col', 'gilded').forEach((p, i) => b.place('boxcol:' + i + ':' + p.mat, () => [p], placeMatrix(53.3, thetaAt(arc - x), 4.2)));
  }
  add('marble', boxB(W * 2 + 0.4, 0.7, 4.4, 0, 8.8, -51.6));
  add('gilded', boxB(W * 2 + 0.5, 0.12, 0.08, 0, 9.25, -53.86));
  const tri = new THREE.Shape();
  tri.moveTo(-W - 0.2, 0); tri.lineTo(W + 0.2, 0); tri.lineTo(0, imperial ? 1.9 : 1.3); tri.lineTo(-W - 0.2, 0);
  add('marble', xform(extrude(tri, 4.4, -53.8, 2), { y: 9.5 }));
  if (imperial) add('gilded', merge([boxB(0.6, 0.9, 0.4, 0, 11.4, -53.4), boxB(0.3, 0.6, 0.3, -W, 9.5, -53.6), boxB(0.3, 0.6, 0.3, W, 9.5, -53.6)]));
  // 帷幔：柱间垂下的紫/红色帘
  const cloth = imperial ? 'purple' : 'red_cloth';
  for (const [x0, x1] of [[-W + 0.4, -W / 3], [W / 3, W - 0.4]]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([-53.2 - Math.sin(t * Math.PI) * 0.12, 8.8 - Math.sin(t * Math.PI) * 1.1]); }
    add(cloth, sweepX([[-53.2, 8.8], [-53.3, 7.3], [-53.25, 6.4]], x0 + 0.3, x0 + 0.9, 1, true));
    add(cloth, sweepX([[-53.2, 8.8], [-53.3, 7.3], [-53.25, 6.4]], x1 - 0.9, x1 - 0.3, 1, true));
    add(cloth, sweepX([[-53.25, 8.8], [-53.35, 8.1]], x0 + 0.3, x1 - 0.3, 6, true));
  }
}
