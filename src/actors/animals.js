// 斗兽表演的动物：狮、豹、虎、熊、公牛、大象、马、鸵鸟。程序化躯体 + 关节腿，步态由 speed 驱动。面朝 +Z。
import * as THREE from 'three';
import { cmat } from './human.js';
import { furTexture } from '../core/textures.js';

const SPECIES = {
  lion: { len: 1.9, h: 1.0, girth: 0.36, color: 0xc49a5a, dark: 0x9a7040, mane: 0x6a4424, tail: 0.9, head: 0.24, neck: 0.3, ear: 'round', jaw: true },
  lioness: { len: 1.7, h: 0.92, girth: 0.32, color: 0xc8a064, dark: 0xa07a48, tail: 0.85, head: 0.21, neck: 0.3, ear: 'round', jaw: true },
  leopard: { len: 1.4, h: 0.7, girth: 0.26, color: 0xd2a050, dark: 0x2a1a10, pattern: 'spots', tail: 0.9, head: 0.17, neck: 0.25, ear: 'round', jaw: true },
  tiger: { len: 2.0, h: 1.0, girth: 0.37, color: 0xd5843a, dark: 0x1e140c, pattern: 'stripes', tail: 0.95, head: 0.23, neck: 0.3, ear: 'round', jaw: true },
  bear: { len: 1.75, h: 1.1, girth: 0.46, color: 0x5a3e2a, dark: 0x3a2818, tail: 0.1, head: 0.24, neck: 0.25, ear: 'round', jaw: true, heavy: true },
  bull: { len: 2.2, h: 1.45, girth: 0.48, color: 0x3a2a20, dark: 0x2a1c14, tail: 0.8, head: 0.28, neck: 0.32, ear: 'side', horns: true },
  horse: { len: 1.9, h: 1.55, girth: 0.36, color: 0x6a4a30, dark: 0x2a1c14, tail: 0.75, head: 0.26, neck: 0.75, ear: 'tall', long: true },
  horse_w: { len: 1.9, h: 1.55, girth: 0.36, color: 0xd8d0c0, dark: 0x8a8070, tail: 0.75, head: 0.26, neck: 0.75, ear: 'tall', long: true },
  elephant: { len: 3.0, h: 2.6, girth: 0.95, color: 0x7d7670, dark: 0x5e5852, tail: 0.9, head: 0.55, neck: 0.25, elephant: true },
  ostrich: { biped: true, h: 1.1, color: 0x1e1a18, dark: 0xe8e0d0 },
};
export const SPECIES_NAMES = { lion: '狮子', lioness: '母狮', leopard: '豹子', tiger: '老虎', bear: '熊', bull: '公牛', horse: '马', horse_w: '马', elephant: '大象', ostrich: '鸵鸟' };

function m(geo, mat) { const o = new THREE.Mesh(geo, mat); o.castShadow = true; return o; }
function at(o, x, y, z) { o.position.set(x, y, z); return o; }
function ell(rx, ry, rz, mat, seg = 14) { const o = m(new THREE.SphereGeometry(1, seg, Math.max(8, seg - 4)), mat); o.scale.set(rx, ry, rz); return o; }
function seg(r0, r1, L, mat, s = 8) { return m(new THREE.CylinderGeometry(r1, r0, L, s).translate(0, -L / 2, 0), mat); }

export function createAnimal(species = 'lion', seed = 1) {
  const S = SPECIES[species];
  if (S.biped) return createOstrich(S);
  const root = new THREE.Group();
  root.name = 'animal:' + species;
  const skin = S.pattern ? new THREE.MeshStandardMaterial({ map: furTexture(S.pattern, S.color, S.dark), roughness: 0.85 }) : cmat(S.color, { rough: 0.85 });
  const darkM = cmat(S.dark, { rough: 0.9 });
  const body = new THREE.Group();
  body.position.y = S.h;
  root.add(body);
  const L = S.len, G = S.girth;
  // 躯干：胸部 + 腹部 + 臀部
  body.add(at(ell(G * 1.0, G * 1.05, L * 0.32, skin), 0, -0.02, L * 0.18));
  body.add(at(ell(G * 0.9, G * 0.92, L * 0.36, skin), 0, -0.04, -L * 0.08));
  body.add(at(ell(G * 0.92, G * 0.95, L * 0.22, skin), 0, 0.0, -L * 0.3));
  if (S.elephant) body.children.forEach((c) => c.scale.multiplyScalar(1.05));
  // 颈 + 头
  const neck = new THREE.Group();
  neck.position.set(0, G * 0.35, L * 0.4);
  body.add(neck);
  const head = new THREE.Group();
  const hs = S.head;
  if (S.long) {
    // 马：长颈斜向上
    const nk = m(new THREE.CylinderGeometry(0.12, 0.24, S.neck, 10).translate(0, S.neck / 2, 0), skin);
    nk.rotation.x = 0.85; neck.add(nk);
    head.position.set(0, S.neck * 0.66, S.neck * 0.75);
    head.rotation.x = 0.9;
    const mane = m(new THREE.BoxGeometry(0.05, S.neck * 0.95, 0.12).translate(0, S.neck / 2, -0.1), darkM); mane.rotation.x = 0.85; neck.add(mane);
  } else if (S.elephant) {
    head.position.set(0, -0.05, 0.1);
  } else {
    head.position.set(0, S.neck * 0.3, S.neck * 0.55);
  }
  neck.add(head);
  if (S.elephant) {
    head.add(at(ell(hs * 0.95, hs * 1.05, hs * 0.9, skin), 0, 0.1, 0.2));
    // 象鼻：多节，可摆动
    let p = head; const trunk = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(); g.position.set(0, i ? -0.22 : -0.05, i ? 0 : hs * 0.95 + 0.1); p.add(g);
      g.add(seg(0.16 - i * 0.018, 0.14 - i * 0.018, 0.24, skin)); g.rotation.x = i ? 0.12 : 0.15; trunk.push(g); p = g;
    }
    const ears = [];
    for (const sx of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(sx * hs * 0.7, 0.2, 0.15); head.add(eg);
      const e = m(new THREE.CircleGeometry(0.55, 14), cmat(S.dark, { rough: 0.9, side: THREE.DoubleSide }));
      e.scale.set(0.85, 1.05, 1); e.position.set(sx * 0.42, -0.1, -0.15); e.rotation.y = sx * 1.2; eg.add(e); ears.push(eg);
    }
    for (const sx of [-1, 1]) { const t = m(new THREE.ConeGeometry(0.05, 0.75, 6).rotateX(Math.PI * 0.62).translate(sx * 0.22, -0.32, hs + 0.15), cmat(0xf0e6cc, { rough: 0.5 })); head.add(t); }
    root.userData.trunk = trunk; root.userData.ears = ears;
  } else {
    const skull = ell(hs * 0.75, hs * 0.7, hs * 0.85, skin);
    head.add(skull);
    const muzzle = ell(hs * 0.45, hs * 0.38, hs * 0.55, skin);
    muzzle.position.set(0, -hs * 0.18, hs * 0.75); head.add(muzzle);
    const noseT = ell(hs * 0.16, hs * 0.11, hs * 0.08, cmat(0x2a1a14)); noseT.position.set(0, -hs * 0.1, hs * 1.28); head.add(noseT);
    if (S.jaw) { const jaw = new THREE.Group(); jaw.position.set(0, -hs * 0.35, hs * 0.3); head.add(jaw); const j = ell(hs * 0.35, hs * 0.12, hs * 0.5, skin); j.position.z = hs * 0.4; jaw.add(j); root.userData.jaw = jaw; }
    for (const sx of [-1, 1]) {
      const eye = ell(0.025, 0.02, 0.015, cmat(0x1a1208)); eye.position.set(sx * hs * 0.38, hs * 0.12, hs * 0.72); head.add(eye);
      let ear;
      if (S.ear === 'tall') { ear = m(new THREE.ConeGeometry(0.05, 0.16, 5), skin); ear.position.set(sx * hs * 0.35, hs * 0.75, -hs * 0.1); }
      else if (S.ear === 'side') { ear = ell(0.1, 0.04, 0.05, skin); ear.position.set(sx * hs * 0.85, hs * 0.25, -hs * 0.1); }
      else { ear = ell(hs * 0.22, hs * 0.22, hs * 0.08, skin); ear.position.set(sx * hs * 0.52, hs * 0.6, -hs * 0.2); }
      head.add(ear);
    }
    if (S.horns) for (const sx of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx * hs * 0.5, hs * 0.45, 0), new THREE.Vector3(sx * hs * 1.3, hs * 0.5, 0.05), new THREE.Vector3(sx * hs * 1.25, hs * 1.15, hs * 0.3));
      head.add(m(new THREE.TubeGeometry(curve, 6, 0.04, 6), cmat(0xe8dcc0, { rough: 0.5 })));
    }
    if (S.mane) {
      const mn = ell(hs * 1.35, hs * 1.4, hs * 1.0, cmat(S.mane, { rough: 1 }), 10);
      mn.position.set(0, hs * 0.05, -hs * 0.45); head.add(mn);
      const mn2 = ell(G * 0.95, G * 1.0, L * 0.18, cmat(S.mane, { rough: 1 }), 10); mn2.position.set(0, 0.05, L * 0.3); body.add(mn2);
    }
    if (S.heavy) head.position.y -= 0.05;
  }
  // 腿：前后各一对，关节在肩/髋
  const legs = [];
  const legH = S.h - G * 0.25;
  const legR = S.elephant ? 0.24 : S.heavy ? 0.12 : S.long || S.horns ? 0.11 : G * 0.24;
  for (const [fz, side, ph] of [[L * 0.28, 1, 0], [L * 0.28, -1, Math.PI], [-L * 0.32, 1, Math.PI * 1.5], [-L * 0.32, -1, Math.PI * 0.5]]) {
    const hip = new THREE.Group(); hip.position.set(side * G * 0.6, -G * 0.25, fz); body.add(hip);
    hip.add(seg(legR * 1.25, legR * 0.85, legH * 0.52, skin));
    const knee = new THREE.Group(); knee.position.y = -legH * 0.52; hip.add(knee);
    knee.add(seg(legR * 0.8, legR * 0.62, legH * 0.48, skin));
    const paw = S.elephant ? m(new THREE.CylinderGeometry(legR * 0.85, legR * 0.95, 0.12, 10).translate(0, -legH * 0.48, 0), darkM)
      : S.horns || S.long ? m(new THREE.CylinderGeometry(legR * 0.55, legR * 0.7, 0.1, 6).translate(0, -legH * 0.47, 0.02), cmat(0x1a1410))
      : ell(legR * 0.85, legR * 0.5, legR * 1.15, skin);
    if (!S.elephant && !S.horns && !S.long) paw.position.set(0, -legH * 0.47, legR * 0.4);
    knee.add(paw);
    legs.push({ hip, knee, ph, front: fz > 0 });
  }
  // 尾巴
  const tail = [];
  if (S.tail > 0.2) {
    let p = body;
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group(); g.position.set(0, i ? -S.tail / 4 : G * 0.3, i ? 0 : -L * 0.5); p.add(g);
      g.add(seg(0.035 * (S.elephant ? 1.6 : 1), 0.028 * (S.elephant ? 1.6 : 1), S.tail / 4, S.long ? darkM : skin, 5));
      g.rotation.x = i ? 0.25 : 2.3;
      tail.push(g); p = g;
    }
    if (!S.long) { const tuft = ell(0.06, 0.1, 0.06, S.mane ? cmat(S.mane) : darkM); tuft.position.y = -S.tail / 4; p.add(tuft); }
    else { const tf = m(new THREE.ConeGeometry(0.1, S.tail * 0.9, 6).translate(0, -S.tail * 0.45, 0), darkM); p.add(tf); }
  }
  const a = { root, body, head, neck, legs, tail, species, S, phase: Math.random() * 6, speed: 0, mode: 'walk', t: 0, rear: 0, roar: 0 };
  a.update = (dt) => updateQuad(a, dt);
  return a;
}

function updateQuad(a, dt) {
  const { S } = a;
  a.t += dt;
  const sp = a.speed;
  const stride = S.elephant ? 2.2 : S.h * 1.6;
  const run = sp > S.h * 2.2;
  a.phase += (sp / stride) * Math.PI * 2 * dt * (run ? 0.8 : 1);
  const amp = Math.min(1, sp / (S.h * 1.2));
  for (const l of a.legs) {
    const ph = run ? (l.front ? 0 : Math.PI * 0.7) + (l.ph % Math.PI) * 0.15 : l.ph;
    const s = Math.sin(a.phase + ph);
    l.hip.rotation.x = s * (run ? 0.75 : 0.4) * amp;
    l.knee.rotation.x = (l.front ? -1 : 1) * Math.max(0, -Math.cos(a.phase + ph)) * 0.6 * amp;
  }
  a.body.position.y = S.h + Math.abs(Math.sin(a.phase)) * (run ? 0.08 : 0.025) * amp * S.h;
  a.body.rotation.x = run ? Math.sin(a.phase * 2) * 0.05 : 0;
  // 后腿站立（熊）/ 扑击
  if (a.rear > 0.001) {
    a.body.rotation.x = -a.rear * 1.05;
    a.body.position.y += a.rear * S.h * 0.55;
    for (const l of a.legs) if (l.front) { l.hip.rotation.x = -a.rear * 0.9 + Math.sin(a.t * 6) * 0.2 * a.rear; l.knee.rotation.x = -0.6 * a.rear; }
      else l.hip.rotation.x = a.rear * 1.0;
  }
  for (let i = 0; i < a.tail.length; i++) a.tail[i].rotation.z = Math.sin(a.t * 2.2 + i * 0.7) * 0.25;
  a.head.rotation.y = Math.sin(a.t * 0.7) * 0.25 * (1 - amp);
  a.head.rotation.x = (S.long ? 0.9 + Math.sin(a.phase * 2) * 0.08 * amp : 0) - a.roar * 0.5;
  if (a.root.userData.jaw) a.root.userData.jaw.rotation.x = a.roar * 0.6;
  if (a.root.userData.trunk) a.root.userData.trunk.forEach((g, i) => { g.rotation.x = 0.12 + Math.sin(a.t * 1.3 + i * 0.5) * 0.08 - a.roar * (i < 4 ? 0.55 : 0.2); g.rotation.z = Math.sin(a.t * 0.9 + i) * 0.06; });
  if (a.root.userData.ears) a.root.userData.ears.forEach((e, i) => { e.rotation.y = (i ? -1 : 1) * (0.2 + Math.sin(a.t * 2.5) * 0.25); });
}

function createOstrich(S) {
  const root = new THREE.Group();
  root.name = 'animal:ostrich';
  const feather = cmat(S.color, { rough: 0.95 }), white = cmat(S.dark, { rough: 0.95 }), leg = cmat(0xd8a890, { rough: 0.7 });
  const body = new THREE.Group(); body.position.y = 1.15; root.add(body);
  body.add(ell(0.38, 0.32, 0.5, feather));
  const tail = ell(0.22, 0.18, 0.2, white); tail.position.set(0, 0.12, -0.5); body.add(tail);
  for (const sx of [-1, 1]) { const w = ell(0.08, 0.22, 0.38, white); w.position.set(sx * 0.36, 0.05, -0.05); body.add(w); }
  const neck = new THREE.Group(); neck.position.set(0, 0.18, 0.38); body.add(neck);
  neck.add(m(new THREE.CylinderGeometry(0.035, 0.06, 0.95, 8).translate(0, 0.47, 0), leg));
  neck.rotation.x = 0.25;
  const head = new THREE.Group(); head.position.y = 0.95; neck.add(head);
  head.add(ell(0.07, 0.06, 0.09, leg));
  const beak = m(new THREE.ConeGeometry(0.035, 0.12, 6).rotateX(Math.PI / 2).translate(0, -0.01, 0.12), cmat(0xc89070)); head.add(beak);
  const legs = [];
  for (const [sx, ph] of [[1, 0], [-1, Math.PI]]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.15, -0.15, 0.02); body.add(hip);
    hip.add(seg(0.09, 0.05, 0.5, leg));
    const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee);
    knee.add(seg(0.035, 0.03, 0.5, leg));
    const foot = m(new THREE.BoxGeometry(0.08, 0.04, 0.18).translate(0, -0.5, 0.06), leg); knee.add(foot);
    knee.rotation.x = -0.3; hip.rotation.x = 0.3;
    legs.push({ hip, knee, ph });
  }
  const a = { root, body, head, neck, legs, tail: [], species: 'ostrich', S, phase: 0, speed: 0, t: 0, rear: 0, roar: 0 };
  a.update = (dt) => {
    a.t += dt;
    a.phase += (a.speed / 2.2) * Math.PI * 2 * dt;
    const amp = Math.min(1, a.speed / 1.5);
    for (const l of legs) { const s = Math.sin(a.phase + l.ph); l.hip.rotation.x = 0.3 + s * 0.7 * amp; l.knee.rotation.x = -0.3 - Math.max(0, Math.cos(a.phase + l.ph)) * 1.1 * amp; }
    body.position.y = 1.15 + Math.abs(Math.sin(a.phase)) * 0.06 * amp;
    neck.rotation.x = 0.25 + Math.sin(a.phase * 2) * 0.08 * amp + Math.sin(a.t * 0.8) * 0.1 * (1 - amp);
  };
  return a;
}
