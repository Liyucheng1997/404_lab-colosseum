// 节目导演：开场游行、斗兽表演、午间余兴、角斗士对决（五种经典配对）、海战表演，以及“全天连播”。
// 每个节目是一段可取消的异步脚本；演员（人/兽/船）每帧按目标点移动并播放姿势动画。
import * as THREE from 'three';
import { createHuman, animate, cmat } from './human.js';
import { createAnimal } from './animals.js';
import { ARENA } from '../config.js';
import { HYPO_DEPTH } from '../model/arena.js';

class Cancel extends Error {}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const IN_A = ARENA.A - 3.2, IN_B = ARENA.B - 3.2;
function clampArena(x, z, m = 0) {
  const a = IN_A - m, b = IN_B - m;
  const r = (x / a) ** 2 + (z / b) ** 2;
  if (r <= 1) return [x, z];
  const k = 1 / Math.sqrt(r);
  return [x * k, z * k];
}
const WEST = [-40, 0], EAST = [40, 0], WEST_IN = [-64, 0], EAST_IN = [64, 0];
const IMPERIAL = [0, 22];

export const PROGRAMS = [
  { key: 'pompa', name: '开场游行', guide: '开场游行' },
  { key: 'venatio', name: '斗兽表演', guide: '斗兽表演' },
  { key: 'meridiani', name: '午间余兴', guide: '午间节目' },
  { key: 'munera', name: '角斗士对决', guide: '角斗士对决' },
  { key: 'naumachia', name: '海战表演', guide: '海战表演' },
  { key: 'day', name: '全天连播', guide: '比赛日节目单' },
];
export const PAIRS = [
  { key: 'retiarius-secutor', name: '鱼网斗士 对 追击斗士', a: 'retiarius', b: 'secutor', guides: ['鱼网斗士', '追击斗士'] },
  { key: 'thraex-murmillo', name: '色雷斯斗士 对 鱼盔斗士', a: 'thraex', b: 'murmillo', guides: ['色雷斯斗士', '鱼盔斗士'] },
  { key: 'hoplomachus-murmillo', name: '重装斗士 对 鱼盔斗士', a: 'hoplomachus', b: 'murmillo', guides: ['重装斗士', '鱼盔斗士'] },
  { key: 'provocator', name: '挑战斗士 对 挑战斗士', a: 'provocator', b: 'provocator', guides: ['挑战斗士'] },
  { key: 'eques', name: '骑马斗士 对 骑马斗士', a: 'eques', b: 'eques', guides: ['骑马斗士'] },
];
const GUIDE_OF = { murmillo: '鱼盔斗士', thraex: '色雷斯斗士', secutor: '追击斗士', retiarius: '鱼网斗士', hoplomachus: '重装斗士', provocator: '挑战斗士', eques: '骑马斗士',
  referee: '裁判', venator: '猎兽手', lictor: '开场游行', tubicen: '乐队与水力风琴', cornicen: '乐队与水力风琴', editor: '主办官包厢', attendant: '开场游行', paegniarius: '午间节目', acrobat: '午间节目', worker: '升降机', sailor: '海战表演' };

// ---------- 演员 ----------
class Actor {
  constructor(show, obj, { kind, animal = null, human = null, speed = 1.4, guide }) {
    this.show = show; this.obj = obj; this.kind = kind; this.animal = animal; this.h = human;
    this.x = 0; this.z = 0; this.heading = 0; this.v = 0; this.maxV = speed; this.target = null;
    this.pose = 'stand'; this.phase = Math.random() * 6; this.face = null; this.lockY = null; this.yOff = 0;
    this.guide = guide || GUIDE_OF[kind] || (animal ? '斗兽表演' : null);
    this.rider = null; this.mount = null; this.busy = 0; this.keepArms = false;
    obj.userData.actor = this;
  }
  at(x, z, heading = this.heading) { this.x = x; this.z = z; this.heading = heading; this.target = null; this.sync(); return this; }
  go(x, z, speed) { this.target = [x, z]; if (speed) this.maxV = speed; return this; }
  stop() { this.target = null; return this; }
  dist(x, z) { return Math.hypot(this.x - x, this.z - z); }
  get arrived() { return !this.target; }
  lookTo(x, z) { this.face = Math.atan2(x - this.x, z - this.z); return this; }
  update(dt) {
    if (this.mount) { if (this.h) animate(this.h, this.pose, dt, 7, null); return; }
    let want = 0;
    if (this.target) {
      const dx = this.target[0] - this.x, dz = this.target[1] - this.z, d = Math.hypot(dx, dz);
      if (d < 0.25) { this.target = null; }
      else {
        want = Math.min(this.maxV, d * 1.6 + 0.3);
        const hd = Math.atan2(dx, dz);
        this.heading += angDiff(this.heading, hd) * Math.min(1, dt * (this.animal ? 3 : 6));
        const turnK = Math.max(0.15, Math.cos(angDiff(this.heading, hd)));
        want *= turnK;
      }
    } else if (this.face !== null) this.heading += angDiff(this.heading, this.face) * Math.min(1, dt * 4);
    this.v += (want - this.v) * Math.min(1, dt * 4);
    this.x += Math.sin(this.heading) * this.v * dt;
    this.z += Math.cos(this.heading) * this.v * dt;
    if (this.animal) { this.animal.speed = this.v; this.animal.update(dt); }
    else if (this.h) {
      const stride = this.v > 2.6 ? 2.0 : 1.35;
      this.phase += (this.v / stride) * Math.PI * 2 * dt;
      animate(this.h, this.pose, dt, 7, this.v > 0.12 ? { phase: this.phase, amp: Math.min(1, this.v / 1.3), keepArms: this.keepArms } : null);
    }
    this.sync();
  }
  sync() {
    this.obj.position.set(this.x, this.lockY ?? this.yOff, this.z);
    this.obj.rotation.y = this.heading;
  }
}

// ---------- 粒子（香雾、水花、沙尘、抛撒的奖券） ----------
class Particles {
  constructor(scene, n, color, size, opacity = 0.8) {
    this.n = n; this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true }));
    this.pts.frustumCulled = false;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    scene.add(this.pts);
    this.grav = -9.8; this.drag = 0.4;
  }
  emit(count, x, y, z, vfn) {
    for (let k = 0; k < count; k++) {
      const i = this.i++ % this.n;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const [vx, vy, vz, life] = vfn();
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz; this.life[i] = life;
    }
  }
  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      v[i * 3 + 1] += this.grav * dt;
      const k = Math.exp(-this.drag * dt);
      v[i * 3] *= k; v[i * 3 + 1] *= k; v[i * 3 + 2] *= k;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (this.life[i] <= 0) p[i * 3 + 1] = -999;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------- 道具 ----------
function hydraulis() {
  const g = new THREE.Group();
  const wood = cmat(0x6a4a2c), br = cmat(0xb28a4e, { metal: 0.85, rough: 0.35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.1, 8), wood); base.position.y = 0.55; g.add(base);
  for (const sx of [-0.35, 0.35]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), br); c.position.set(sx, 1.4, -0.3); g.add(c); }
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.5), wood); box.position.set(0, 1.25, 0.1); g.add(box);
  for (let i = 0; i < 14; i++) { const h = 1.8 - Math.abs(i - 6.5) * 0.09; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6), br); p.position.set(-0.6 + i * 0.092, 1.42 + h / 2, 0.15); g.add(p); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function palm() {
  const g = new THREE.Group();
  const m = cmat(0x5a7a2e, { side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1.2, 5).translate(0, 0.6, 0), cmat(0x7a6a3a)));
  for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.32), m); l.position.set((i % 2 ? 1 : -1) * 0.08, 0.6 + i * 0.05, 0); l.rotation.z = (i % 2 ? -1 : 1) * 0.9; g.add(l); }
  return g;
}
function netMesh() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 2.5;
  for (let i = 0; i <= 64; i += 10) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshStandardMaterial({ color: 0x9a8a62, alphaMap: t, alphaTest: 0.4, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}
function scenery() {
  // 中央升降台上的布景：假山、树丛（猛兽从中跃出）
  const g = new THREE.Group();
  const rock = cmat(0x8a7a62, { rough: 1 }), leaf = cmat(0x4a6a32), trunk = cmat(0x5a4030);
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.6, 1.3), 0), rock); r.position.set(rnd(-4, 4), 0.3, rnd(-1.2, 1.2)); r.scale.y = 0.7; r.castShadow = true; g.add(r); }
  for (const x of [-3, 0.5, 3.2]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 2.6, 6).translate(0, 1.3, 0), trunk); t.position.set(x, 0, rnd(-0.8, 0.8)); g.add(t);
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), leaf); c.position.set(x, 3.0, t.position.z); c.scale.y = 0.85; c.castShadow = true; g.add(c);
  }
  return g;
}
function ship(color, seed) {
  const g = new THREE.Group();
  const hullM = cmat(0x5a3a22), deckM = cmat(0x8a6a44), sailM = cmat(color, { side: THREE.DoubleSide });
  const sh = new THREE.Shape();
  sh.moveTo(-6, 0.9); sh.quadraticCurveTo(-6.6, 2.4, -5.6, 3.0); sh.lineTo(-5.2, 1.6); sh.lineTo(5.2, 1.6); sh.lineTo(6.2, 1.2); sh.lineTo(7.2, 0.25); sh.lineTo(5.6, 0.2); sh.quadraticCurveTo(0, -0.5, -6, 0.9);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 }).translate(0, 0, -1.2), hullM);
  hull.rotation.y = -Math.PI / 2; hull.castShadow = true; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 10.5), deckM); deck.position.y = 1.62; g.add(deck);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), cmat(0xf0e8d8)); eye.position.set(1.42, 1.1, 5.2); eye.rotation.y = Math.PI / 2; g.add(eye);
  const eye2 = eye.clone(); eye2.position.x = -1.42; eye2.rotation.y = -Math.PI / 2; g.add(eye2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6).translate(0, 4.6, 0.5), deckM); g.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 5).rotateZ(Math.PI / 2).translate(0, 7.2, 0.5), deckM); g.add(yard);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4, 4, 2).translate(0, 5.9, 0.6), sailM); g.add(sail);
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10), cmat(i % 2 ? color : 0xd8c8a0, { side: THREE.DoubleSide })); s.position.set(sx * 1.43, 1.9, -3.6 + i * 1.2); s.rotation.y = sx * Math.PI / 2; g.add(s); }
  const oars = [];
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 1.35, 1.2, -4 + i * 1.0); g.add(piv);
    const o = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.08).translate(sx * 1.6, 0, 0), deckM); piv.add(o); oars.push({ piv, sx, i });
  }
  const crew = [];
  for (let i = 0; i < 5; i++) {
    const h = createHuman({ kind: i % 2 ? 'provocator' : 'hoplomachus', seed: seed * 10 + i, shieldColor: color });
    h.root.position.set(rnd(-0.6, 0.6), 1.65, -3.5 + i * 1.6);
    h.root.rotation.y = rnd(-1.5, 1.5);
    animate(h, i % 2 ? 'guard' : 'block', 1, 50);
    g.add(h.root); crew.push(h);
  }
  g.userData = { oars, crew };
  return g;
}

/**
 * createShow({ scene, world, audio, onEvent })
 * onEvent({ type: 'stage' | 'guide' | 'end', ... })
 */
export function createShow({ scene, world, audio = null, onEvent = () => {} }) {
  const group = new THREE.Group();
  group.name = 'show';
  scene.add(group);
  const arena = world.arena, crowd = world.crowd;
  const A = audio || new Proxy({}, { get: () => () => {} });
  let actors = [];
  let simT = 0, runId = 0, running = null, waiters = [];
  const focus = new THREE.Vector3(0, 1.5, 0);
  const mist = new Particles(group, 1500, 0xf3d27a, 0.35, 0.55); mist.grav = -0.6; mist.drag = 0.9;
  const dust = new Particles(group, 800, 0xcbb08a, 0.5, 0.45); dust.grav = -0.4; dust.drag = 1.5;
  const tokens = new Particles(group, 600, 0xc8a050, 0.18, 1);
  const spray = new Particles(group, 1200, 0xdfeff2, 0.4, 0.7);

  // 乐队与水力风琴固定在南侧护墙前
  const band = new THREE.Group(); band.visible = false; group.add(band);
  const organ = hydraulis(); organ.position.set(-10, 0, 19.5); organ.rotation.y = Math.PI; band.add(organ);
  const bandActors = [];
  // 地下室推绞盘的工人
  const workers = [];
  for (const l of arena.lifts.filter((l) => l.z < 0).slice(0, 10)) {
    const h = createHuman({ kind: 'worker', seed: 100 + l.id });
    h.root.position.set(1.4, 0, 0); h.root.rotation.y = 0;
    animate(h, 'push', 1, 50);
    const holder = new THREE.Group(); holder.add(h.root);
    l.capstan.add(holder);
    workers.push(h);
  }

  // ---------- 异步脚本工具 ----------
  const frame = () => new Promise((r) => waiters.push(r));
  async function wait(sec) { const id = runId, end = simT + sec; while (simT < end) { await frame(); if (id !== runId) throw new Cancel(); } }
  async function until(fn, timeout = 60) { const id = runId, end = simT + timeout; while (!fn() && simT < end) { await frame(); if (id !== runId) throw new Cancel(); } }
  const stage = (title, sub = '') => onEvent({ type: 'stage', title, sub });
  const narrate = (name) => onEvent({ type: 'guide', name });

  function spawnHuman(kind, opt = {}) {
    const h = createHuman({ kind, seed: Math.floor(Math.random() * 1e6), ...opt });
    group.add(h.root);
    const a = new Actor(api, h.root, { kind, human: h, speed: opt.speed || 1.4, guide: opt.guide });
    actors.push(a);
    return a;
  }
  function spawnAnimal(species, opt = {}) {
    const an = createAnimal(species);
    group.add(an.root);
    const sp = { lion: 7, lioness: 7, leopard: 8, tiger: 7, bear: 4.5, bull: 6, elephant: 2.2, ostrich: 8, horse: 7, horse_w: 7 }[species] || 4;
    const a = new Actor(api, an.root, { kind: species, animal: an, speed: opt.speed || sp * 0.35, guide: opt.guide });
    a.topSpeed = sp;
    actors.push(a);
    return a;
  }
  function remove(a) { group.remove(a.obj); actors = actors.filter((x) => x !== a); if (a.rider) remove(a.rider); }
  function clearAll() {
    for (const a of [...actors]) if (!bandActors.includes(a)) remove(a);
    for (const c of [...group.children]) if (c.userData.temp) group.remove(c);
    for (let i = 0; i < arena.lifts.length; i++) arena.closeLift(i);
    arena.setCenterLift(1);
    if (sceneryG) { arena.centerTrap.remove(sceneryG); sceneryG = null; }
  }
  function setBand(on) {
    band.visible = on;
    if (on && !bandActors.length) {
      const pos = [[-14, 19.2, 'tubicen'], [-12.6, 19.6, 'tubicen'], [-8, 19.8, 'cornicen'], [-10, 18.3, 'attendant']];
      for (const [x, z, kind] of pos) { const a = spawnHuman(kind, { guide: '乐队与水力风琴' }); a.at(x, z, Math.PI); a.pose = kind === 'attendant' ? 'carry' : 'blow'; bandActors.push(a); }
    }
    for (const a of bandActors) a.obj.visible = on;
  }
  async function walkPath(a, pts, speed) { for (const [x, z] of pts) { a.go(x, z, speed); await until(() => a.arrived, 40); } }
  const ellipsePt = (t, m = 1.5) => [Math.cos(t) * (IN_A - m), Math.sin(t) * (IN_B - m)];

  // ---------- 升降机放出动物 ----------
  async function liftRelease(liftIdx, a, dur = 4) {
    const l = arena.lifts[liftIdx];
    a.at(l.x, l.z, Math.atan2(-l.x, -l.z));
    a.lockY = -HYPO_DEPTH + 0.4;
    A.creak();
    const t0 = simT;
    while (simT - t0 < dur) {
      const t = (simT - t0) / dur;
      arena.setLift(liftIdx, t);
      a.lockY = -HYPO_DEPTH + 0.4 + (HYPO_DEPTH - 0.3) * t;
      await frame();
    }
    arena.setLift(liftIdx, 1);
    a.lockY = null;
    crowd.cheer(0.6, Math.atan2(l.z / IN_B, l.x / IN_A));
    A.cheer(0.6);
    // 稍后降回、关门
    setTimeout(() => { if (arena.lifts[liftIdx]) arena.closeLift(liftIdx); }, 4000);
  }

  // ---------- 角斗 ----------
  async function duel(pair, { short = false } = {}) {
    stage('角斗士对决', pair.name);
    const a = spawnHuman(pair.a, { cloak: 0x5b1847, shieldColor: 0x8e2b1e });
    const b = spawnHuman(pair.b, { cloak: 0x7a1c14, shieldColor: 0x2f4a6a, tunic: 0x3a6a8a });
    const ref = spawnHuman('referee');
    a.at(WEST_IN[0], -1.2, Math.PI / 2); b.at(WEST_IN[0] - 2.5, 1.2, Math.PI / 2); ref.at(WEST_IN[0] - 5, 0, Math.PI / 2);
    let horses = [];
    if (pair.a === 'eques') {
      for (const r of [a, b]) {
        const hs = spawnAnimal(Math.random() < 0.5 ? 'horse' : 'horse_w');
        hs.at(r.x, r.z, Math.PI / 2);
        r.mount = hs; hs.rider = r;
        r.h.root.position.set(0, -0.6, -0.1); r.h.root.rotation.set(0, 0, 0);
        hs.animal.body.add(r.h.root); r.pose = 'ride';
        animate(r.h, 'ride', 1, 50);
        horses.push(hs);
      }
    }
    const riders = horses.length ? horses : [a, b];
    // 入场：走到场中，向皇帝包厢致意
    riders[0].go(-4, -2.5, horses.length ? 3 : 1.6); riders[1].go(-4, 2.5, horses.length ? 3 : 1.6); ref.go(-6, 0, 1.6);
    narrate(pair.guides[0]);
    let secondNarr = pair.guides[1] ? simT + 32 : Infinity;
    await until(() => riders[0].arrived && riders[1].arrived, 40);
    for (const r of [...riders, ref]) r.lookTo(...IMPERIAL);
    if (!horses.length) { a.pose = b.pose = 'salute'; }
    crowd.cheer(0.8, Math.PI / 2); A.cheer(0.8); A.fanfare();
    await wait(3.2);
    a.pose = b.pose = horses.length ? 'ride' : 'guard';
    if (a.h.extra.cloak) a.h.extra.cloak.visible = false;
    if (b.h.extra.cloak) b.h.extra.cloak.visible = false;
    A.setOrgan(true, 1.2);
    crowd.setMood(0.25);
    ref.go(-1, 6, 1.2);
    // 骑马斗士：先策马对冲三个回合，然后下马步战
    if (horses.length) {
      for (let pass = 0; pass < 3; pass++) {
        const sx = pass % 2 ? 1 : -1;
        horses[0].go(sx * 18, -1.2, 9); horses[1].go(-sx * 18, 1.2, 9);
        a.pose = b.pose = 'ridecharge';
        await until(() => Math.abs(horses[0].x - horses[1].x) < 2, 12);
        A.clash(1.2); A.cheer(0.7); crowd.cheer(0.7);
        await until(() => horses[0].arrived && horses[1].arrived, 12);
        a.pose = b.pose = 'ride';
        horses[0].go(sx * 18, -5, 3); horses[1].go(-sx * 18, 5, 3);
        await wait(1.8);
      }
      for (const [r, hs] of [[a, horses[0]], [b, horses[1]]]) {
        hs.animal.body.remove(r.h.root); group.add(r.h.root);
        r.mount = null; hs.rider = null;
        r.at(hs.x + 1.2, hs.z, hs.heading); r.pose = 'guard';
        r.h.extra.weapon.visible = false;
        const sw = createHuman({ kind: 'murmillo' }).extra.weapon; sw.position.set(0, -0.06, 0.02); sw.rotation.set(Math.PI / 2, 0, 0); r.h.J.haR.add(sw);
        hs.go(EAST_IN[0], hs.z, 5);
      }
      await wait(2);
      for (const hs of horses) remove(hs);
      a.go(-3, 0); b.go(3, 0);
      await until(() => a.arrived && b.arrived, 8);
    }
    // 步战
    const fighters = [a, b];
    const hp = [3 + Math.random() * 2, 3 + Math.random() * 2];
    const guardPose = (f) => (f.kind === 'retiarius' ? 'tridentGuard' : 'guard');
    a.pose = guardPose(a); b.pose = guardPose(b);
    let center = [0, 0];
    const T_END = simT + (short ? 32 : 55);
    let netObj = null;
    while (simT < T_END && hp[0] > 0 && hp[1] > 0) {
      // 绕圈对峙
      const ang = Math.atan2(a.z - b.z, a.x - b.x) + rnd(-0.6, 0.6);
      center = clampArena(center[0] + rnd(-3, 3), center[1] + rnd(-2, 2), 6);
      const R = rnd(1.4, 2.0);
      a.go(...clampArena(center[0] + Math.cos(ang) * R, center[1] + Math.sin(ang) * R), 1.1);
      b.go(...clampArena(center[0] - Math.cos(ang) * R, center[1] - Math.sin(ang) * R), 1.1);
      a.keepArms = b.keepArms = true;
      ref.go(...clampArena(center[0] + rnd(2, 3.5), center[1] + rnd(2, 3.5), 4), 1.4);
      if (simT > secondNarr) { narrate(pair.guides[1]); secondNarr = Infinity; }
      const t1 = simT + rnd(1.2, 2.4);
      while (simT < t1) { a.face = Math.atan2(b.x - a.x, b.z - a.z); b.face = Math.atan2(a.x - b.x, a.z - b.z); if (a.arrived) a.lookTo(b.x, b.z); if (b.arrived) b.lookTo(a.x, a.z); await frame(); }
      // 进攻
      const ai = Math.random() < 0.5 ? 0 : 1;
      const atk = fighters[ai], def = fighters[1 - ai];
      // 鱼网斗士：有时撒网
      if (atk.kind === 'retiarius' && !netObj && Math.random() < 0.35) {
        atk.stop(); atk.lookTo(def.x, def.z); atk.pose = 'throwNet';
        await wait(0.35);
        atk.h.extra.net.visible = false;
        netObj = netMesh(); netObj.userData.temp = true; group.add(netObj);
        const from = new THREE.Vector3(atk.x, 1.6, atk.z), to = new THREE.Vector3(def.x, 1.9, def.z);
        const caught = Math.random() < 0.45;
        if (!caught) to.add(new THREE.Vector3(rnd(-2, 2), 0, rnd(-2, 2)));
        const t0 = simT;
        while (simT - t0 < 0.7) { const k = (simT - t0) / 0.7; netObj.position.lerpVectors(from, to, k).y += Math.sin(k * Math.PI) * 1.2; netObj.scale.setScalar(0.3 + k * 1.0); netObj.rotation.x = -Math.PI / 2 + k * 0.3; await frame(); }
        if (caught) {
          netObj.position.set(0, 0.2, 0.1); netObj.rotation.set(-1.3, 0, 0); netObj.scale.setScalar(0.9);
          def.h.J.head.add(netObj); def.pose = 'hit'; crowd.cheer(0.9); A.cheer(0.9); A.gasp();
          atk.pose = 'tridentGuard'; atk.go(def.x + (atk.x - def.x) * 0.4, def.z + (atk.z - def.z) * 0.4, 2.5);
          await wait(0.6);
          atk.pose = 'thrust'; await wait(0.35); A.thud(); hp[1 - ai] -= 1.2;
          await wait(1.2);
          def.h.J.head.remove(netObj); netObj = null;
        } else {
          netObj.position.y = 0.05; netObj.rotation.set(-Math.PI / 2, 0, 0);
          A.gasp(); def.pose = guardPose(def);
          const nn = netObj;
          setTimeout(() => { group.remove(nn); }, 3000);
          netObj = null;
          // 追击斗士趁机猛攻
          def.go(atk.x, atk.z, 3.2); await wait(0.6);
        }
        atk.h.extra.net.visible = true;
        atk.pose = guardPose(atk);
        def.pose = guardPose(def);
        continue;
      }
      const dx = def.x - atk.x, dz = def.z - atk.z, d = Math.hypot(dx, dz) || 1;
      atk.go(atk.x + (dx / d) * (d - 0.9), atk.z + (dz / d) * (d - 0.9), 3.2);
      atk.lookTo(def.x, def.z);
      await wait(0.35);
      atk.pose = atk.kind === 'thraex' || Math.random() < 0.3 ? 'slash' : 'thrust';
      const r = Math.random();
      await wait(0.22);
      if (r < 0.58) { def.pose = 'block'; A.clash(rnd(0.7, 1.2)); if (Math.random() < 0.4) dust.emit(12, def.x, 0.1, def.z, () => [rnd(-1, 1), rnd(0.3, 1), rnd(-1, 1), 1.2]); }
      else if (r < 0.8) { def.go(def.x + (dz / d) * 1.4, def.z - (dx / d) * 1.4, 3.5); A.gasp(); crowd.cheer(0.35); }
      else { def.pose = 'hit'; A.thud(); hp[1 - ai] -= 1; crowd.cheer(0.85, Math.atan2(def.z / IN_B, def.x / IN_A)); A.cheer(0.8); dust.emit(30, def.x, 0.1, def.z, () => [rnd(-2, 2), rnd(0.5, 1.5), rnd(-2, 2), 1.5]); }
      await wait(0.5);
      atk.pose = guardPose(atk); def.pose = guardPose(def);
      atk.go(atk.x - (dx / d) * 0.8, atk.z - (dz / d) * 0.8, 1.5);
      await wait(rnd(0.4, 0.9));
    }
    a.keepArms = b.keepArms = false;
    // 结局：一方举指求饶，观众呼喊，主办官裁决
    const li = hp[0] <= hp[1] ? 0 : 1;
    const loser = fighters[li], winner = fighters[1 - li];
    loser.stop(); winner.stop();
    if (loser.h.J.shield) loser.h.J.shield.visible = false;
    loser.pose = 'kneel';
    await wait(1.0);
    loser.lookTo(...IMPERIAL); loser.pose = 'appeal';
    winner.lookTo(loser.x, loser.z); winner.pose = 'stand';
    ref.go(loser.x + 1, loser.z + 0.6, 2.5);
    A.setOrgan(false);
    stage('胜负与赦免', '落败者举指求饶，全场呼喊，等待主办官裁决');
    narrate('胜负与赦免');
    crowd.setMood(0.8); A.setCrowd(0.9); A.cheer(1, 5);
    await wait(6.5);
    // 绝大多数情况获赦（missio）
    crowd.setMood(0.25); A.setCrowd(0.4);
    crowd.cheer(1); A.cheer(1, 4);
    stage('胜负与赦免', '获赦：败者免死，胜者获得棕榈枝');
    loser.pose = 'stand';
    const att = spawnHuman('attendant');
    att.at(WEST[0] - 4, 0, Math.PI / 2); att.go(winner.x - 1, winner.z, 2.2);
    await until(() => att.arrived, 20);
    const p = palm(); p.position.set(0, -0.05, 0); p.rotation.x = Math.PI / 2 * 0; winner.h.J.haL.add(p);
    if (winner.h.J.shield) winner.h.J.shield.visible = false;
    winner.lookTo(...IMPERIAL); winner.pose = 'victory';
    crowd.cheer(1, Math.PI / 2); A.cheer(1);
    await wait(3);
    for (const x of [winner, loser, ref, att]) { x.pose = 'stand'; x.go(WEST_IN[0], rnd(-1.5, 1.5), 1.5); }
    await until(() => [winner, loser, ref, att].every((x) => x.x < -42), 40);
    for (const x of [winner, loser, ref, att]) remove(x);
  }

  // ---------- 节目脚本 ----------
  const SCRIPTS = {
    async pompa() {
      stage('开场游行', '束棒侍从 · 乐队 · 主办官 · 角斗士');
      narrate('开场游行');
      A.fanfare(); crowd.setMood(0.3); A.setCrowd(0.6);
      const order = [...Array(6).fill('lictor'), 'tubicen', 'tubicen', 'cornicen', 'cornicen', 'editor', 'attendant', 'attendant',
        'murmillo', 'thraex', 'retiarius', 'secutor', 'hoplomachus', 'provocator', 'murmillo', 'thraex', 'referee', 'referee'];
      const walkers = order.map((k, i) => {
        const glad = ['murmillo', 'thraex', 'retiarius', 'secutor', 'hoplomachus', 'provocator'].includes(k);
        const a = spawnHuman(k, { cloak: glad ? pick([0x5b1847, 0x7a1c14, 0x6a2a5a]) : null });
        a.at(WEST_IN[0] - i * 1.6, (i % 2 ? 0.7 : -0.7), Math.PI / 2);
        if (k === 'tubicen' || k === 'cornicen') a.pose = 'blow';
        if (k === 'lictor') a.pose = 'carry';
        if (glad) { if (a.h.extra.weapon) a.h.extra.weapon.visible = false; if (a.h.J.shield) a.h.J.shield.visible = false; }
        return a;
      });
      // 路线：西门 → 沿南侧（皇帝包厢）→ 东端 → 北侧 → 回到皇帝包厢前列队
      const route = [];
      for (let i = 0; i <= 28; i++) route.push(ellipsePt(Math.PI - (i / 28) * Math.PI * 2 * 0.98, 3.5));
      const lineUp = (i) => [-11 + (i % 12) * 2.0, 13 + Math.floor(i / 12) * 2.4];
      const jobs = walkers.map(async (a, i) => {
        await wait(i * 1.15);
        a.go(WEST[0] + 2, a.z, 1.5);
        await until(() => a.arrived, 30);
        for (const p of route.slice(1)) { a.go(...p, 1.5); await until(() => a.dist(...p) < 1.2, 30); }
        a.go(...lineUp(i), 1.4);
        await until(() => a.arrived, 40);
        a.lookTo(...IMPERIAL);
      });
      let cheerT = simT, done = false;
      const cheerLoop = (async () => { while (!done) { await wait(rnd(2.5, 5)); crowd.cheer(rnd(0.4, 0.8)); A.cheer(rnd(0.3, 0.6)); if (simT - cheerT > 12) { A.fanfare(); cheerT = simT; } } })();
      cheerLoop.catch(() => {});
      await Promise.all(jobs);
      done = true;
      stage('开场游行', '列队向皇帝包厢致敬，当众检验兵器');
      for (const a of walkers) if (['murmillo', 'thraex', 'retiarius', 'secutor', 'hoplomachus', 'provocator'].includes(a.kind)) { a.pose = 'salute'; if (a.h.extra.weapon) a.h.extra.weapon.visible = true; }
      crowd.cheer(1, Math.PI / 2); A.cheer(1, 4); A.fanfare();
      await wait(5);
      for (const a of walkers) a.pose = a.kind === 'lictor' ? 'carry' : 'stand';
      // 退场
      for (const [i, a] of walkers.entries()) { a.go(WEST[0] + 1, rnd(-1.5, 1.5), 1.6); if (i % 4 === 3) await wait(0.6); }
      await until(() => walkers.every((a) => a.arrived), 30);
      for (const a of walkers) a.go(WEST_IN[0], a.z, 1.6);
      await until(() => walkers.every((a) => a.x < -44), 30);
      for (const a of walkers) remove(a);
      crowd.setMood(0.1);
    },

    async venatio() {
      stage('斗兽表演', '升降机将猛兽与布景送上场');
      narrate('斗兽表演');
      crowd.setMood(0.3); A.setCrowd(0.6);
      // 中央布景升起
      sceneryG = scenery(); arena.centerTrap.add(sceneryG); sceneryG.position.set(0, 0.1, -1.7);
      arena.setCenterLift(0);
      await wait(1.5);
      A.creak();
      for (let t = 0; t <= 1; t += 0.008) { arena.setCenterLift(t); await frame(); }
      arena.setCenterLift(1);
      crowd.cheer(0.7); A.cheer(0.6);
      // 猎兽手从西门入场
      const hunters = [0, 1, 2, 3].map((i) => { const h = spawnHuman('venator', { tunic: pick([0xa83a2a, 0x6a7a3a, 0xc89a3a]) }); h.at(WEST_IN[0] - i * 2, rnd(-1, 1), Math.PI / 2); h.go(-25 + i * 3, rnd(-6, 6), 2.4); h.pose = 'guard'; return h; });
      const rider = spawnAnimal('horse'); const rv = spawnHuman('venator', { tunic: 0x7a4a6a });
      rider.at(WEST_IN[0] - 10, 0, Math.PI / 2); rv.mount = rider; rider.rider = rv;
      rv.h.root.position.set(0, -0.6, -0.1); rv.pose = 'ridecharge'; rider.animal.body.add(rv.h.root); animate(rv.h, 'ridecharge', 1, 50);
      rider.go(-20, 10, 4);
      // 动物陆续从升降机冒出
      const lifts = arena.lifts.map((l, i) => i).sort(() => Math.random() - 0.5);
      const roster = ['lion', 'lioness', 'leopard', 'tiger', 'bear', 'bull', 'ostrich', 'ostrich', 'ostrich', 'lion', 'leopard'];
      const beasts = [];
      for (let i = 0; i < roster.length; i++) {
        const sp = roster[i];
        const b = spawnAnimal(sp);
        beasts.push(b);
        liftRelease(lifts[i], b, 3.4).then(() => { b.go(...clampArena(b.x * 0.6 + rnd(-8, 8), b.z * 0.5 + rnd(-5, 5), 2), b.topSpeed * 0.5); if (['lion', 'lioness', 'tiger'].includes(sp)) { b.animal.roar = 1; A.roar('lion'); setTimeout(() => (b.animal.roar = 0), 1300); } if (sp === 'bear') A.roar('bear'); }).catch(() => {});
        await wait(i < 3 ? 1.6 : 0.9);
      }
      // 大象从东门（死亡之门）进场
      const eles = [0, 1].map((i) => { const e = spawnAnimal('elephant'); e.at(EAST_IN[0] + i * 6, i ? 1.5 : -1.5, -Math.PI / 2); e.go(24 - i * 4, i ? 8 : -8, 1.6); return e; });
      setTimeout(() => A.trumpet(), 2500);
      await wait(4);
      // 追逐与搏斗
      const T = simT + 70;
      let lastEvent = simT;
      while (simT < T) {
        for (const b of beasts) {
          if (b.busy > simT) continue;
          if (b.kind === 'ostrich') { if (b.arrived) b.go(...ellipsePt(rnd(0, 6.28), rnd(2, 8)), b.topSpeed * rnd(0.5, 0.9)); continue; }
          if (b.kind === 'bear' || b.kind === 'bull') continue;
          if (b.arrived) {
            const h = pick(hunters);
            if (Math.random() < 0.35) {
              // 扑向猎兽手
              b.go(...clampArena(h.x, h.z), b.topSpeed * 0.9); b.busy = simT + 3;
              const hb = b;
              until(() => hb.dist(h.x, h.z) < 2.2, 3).then(() => {
                if (hb.dist(h.x, h.z) < 2.4) { h.pose = Math.random() < 0.6 ? 'thrust' : 'block'; h.go(...clampArena(h.x + rnd(-3, 3), h.z + rnd(-3, 3)), 4); crowd.cheer(0.9); A.cheer(0.9); A.roar('lion'); hb.animal.roar = 1; setTimeout(() => (hb.animal.roar = 0), 800); dust.emit(30, h.x, 0.1, h.z, () => [rnd(-2, 2), rnd(0.5, 1.5), rnd(-2, 2), 1.4]); setTimeout(() => (h.pose = 'guard'), 900); }
                hb.go(...clampArena(hb.x + rnd(-14, 14), hb.z + rnd(-8, 8), 2), hb.topSpeed * 0.6);
              }).catch(() => {});
            } else b.go(...clampArena(rnd(-30, 30), rnd(-16, 16), 2), b.topSpeed * rnd(0.25, 0.6));
          }
        }
        for (const h of hunters) if (h.arrived && Math.random() < 0.02) { const t = pick(beasts.filter((b) => b.kind !== 'ostrich')); if (t) h.go(...clampArena(t.x - 3, t.z - 3), 2.6); }
        if (rider.arrived) rider.go(...ellipsePt(rnd(0, 6.28), 4), rnd(5, 8));
        for (const e of eles) if (e.arrived) e.go(...clampArena(rnd(5, 30), rnd(-14, 14), 4), 1.4);
        // 熊斗公牛
        if (simT - lastEvent > 14) {
          lastEvent = simT;
          const bear = beasts.find((b) => b.kind === 'bear'), bull = beasts.find((b) => b.kind === 'bull');
          if (bear && bull) {
            stage('斗兽表演', '熊斗公牛：两头猛兽被拴在一起相斗');
            bear.go(-5, -8, 3); bull.go(5, -8, 4);
            until(() => bear.arrived, 8).then(async () => {
              bear.lookTo(bull.x, bull.z); bear.animal.rear = 0; A.roar('bear');
              for (let k = 0; k < 40; k++) { bear.animal.rear = Math.min(1, k / 15); await frame(); }
              bull.go(bear.x + 0.5, bear.z, 7); A.roar('bull');
              await wait(1.2); A.thud(); crowd.cheer(1); A.cheer(1); dust.emit(60, bear.x, 0.2, bear.z, () => [rnd(-3, 3), rnd(0.5, 2), rnd(-3, 3), 1.8]);
              bull.go(...clampArena(bull.x + 12, bull.z + 5), 4);
              for (let k = 0; k < 40; k++) { bear.animal.rear = Math.max(0, 1 - k / 30); await frame(); }
              bear.go(...clampArena(rnd(-20, 0), rnd(-10, 10)), 2);
            }).catch(() => {});
          }
          if (Math.random() < 0.5) setTimeout(() => A.trumpet(), 1000);
        }
        await wait(0.5);
      }
      // 收场：动物从东门赶出，猎兽手致意后由西门退场
      stage('斗兽表演', '收场：猛兽被赶回东门');
      for (const b of [...beasts, ...eles]) { b.busy = 1e9; b.go(EAST[0] - 2, rnd(-2, 2), b.topSpeed * 0.5); }
      for (const h of hunters) { h.go(rnd(-12, -4), rnd(12, 16), 2); }
      rider.go(-10, 14, 3);
      await wait(6);
      for (const b of [...beasts, ...eles]) b.go(EAST_IN[0], b.z, b.topSpeed * 0.4);
      for (const h of hunters) { h.lookTo(...IMPERIAL); h.pose = 'salute'; }
      crowd.cheer(1, Math.PI / 2); A.cheer(1, 4);
      await wait(4);
      for (const h of [...hunters, rider]) { h.pose = 'stand'; h.go(WEST_IN[0], rnd(-1.5, 1.5), 2); }
      await until(() => [...hunters, rider].every((h) => h.x < -44) && [...beasts, ...eles].every((b) => b.x > 44), 40);
      for (const b of [...beasts, ...eles, ...hunters, rider]) if (actors.includes(b)) remove(b);
      for (let t = 1; t >= 0; t -= 0.01) { arena.setCenterLift(t); await frame(); }
      arena.centerTrap.remove(sceneryG); sceneryG = null;
      arena.setCenterLift(1);
      crowd.setMood(0.1);
    },

    async meridiani() {
      stage('午间余兴', '滑稽打斗 · 杂技 · 香雾 · 抛撒奖券');
      narrate('午间节目');
      crowd.setMood(0.15); A.setCrowd(0.4);
      const clowns = [0, 1, 2, 3].map((i) => { const c = spawnHuman('paegniarius', { tunic: pick([0xc84a2a, 0xd8a020, 0x3a7a5a, 0x6a4a8a]) }); c.at(WEST_IN[0] - i * 2, rnd(-1, 1), Math.PI / 2); c.go(-12 + i * 3, rnd(-4, 4), 2); return c; });
      const acro = [0, 1].map((i) => { const c = spawnHuman('acrobat', { tunic: i ? 0xd8a020 : 0xa83a2a }); c.at(WEST_IN[0] - 10 - i * 2, 0, Math.PI / 2); c.go(10 + i * 4, rnd(-3, 3), 2); return c; });
      // 香雾喷口：讲台层四周
      const sprays = Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * Math.PI * 2; return [Math.cos(t) * (ARENA.A + 2.5), Math.sin(t) * (ARENA.B + 2.5), t]; });
      const T = simT + 50;
      let sprayOn = false, tossT = simT;
      while (simT < T) {
        for (const c of clowns) if (c.arrived) {
          const o = pick(clowns.filter((x) => x !== c));
          c.go(...clampArena(o.x + rnd(-1, 1), o.z + rnd(-1, 1)), rnd(1.5, 3));
          c.pose = pick(['slash', 'thrust', 'block', 'stand', 'hit', 'cheer']);
          if (Math.random() < 0.3) { A.thud(); crowd.cheer(0.35); }
          if (Math.random() < 0.1) { c.pose = 'dead'; setTimeout(() => (c.pose = 'stand'), 1500); A.gasp(); crowd.cheer(0.6); }
        }
        acro.forEach((c, i) => { c.pose = Math.floor(simT / 3 + i) % 3 === 0 ? 'handstand' : Math.floor(simT / 3 + i) % 3 === 1 ? 'juggle' : 'cheer'; c.lookTo(...IMPERIAL); });
        if (simT > T - 38 && !sprayOn) { sprayOn = true; stage('香水喷洒', '藏红花香水洒向看台'); narrate('香水喷洒'); }
        if (sprayOn) for (const [x, z, t] of sprays) mist.emit(3, x, 5.5, z, () => [Math.cos(t) * rnd(1, 3) + rnd(-0.6, 0.6), rnd(3.5, 6), Math.sin(t) * rnd(1, 3) + rnd(-0.6, 0.6), rnd(2.5, 4)]);
        if (sprayOn && simT - tossT > 2.5) {
          tossT = simT;
          const w = pick(acro);
          for (let k = 0; k < 40; k++) { const t = rnd(0, Math.PI * 2), sp = rnd(10, 14); tokens.emit(1, w.x, 1.6, w.z, () => [Math.cos(t) * sp * 0.55, sp * 0.95, Math.sin(t) * sp * 0.4, 2.6]); }
          crowd.cheer(0.9, Math.atan2(w.z, w.x)); A.cheer(0.8);
        }
        await wait(0.12);
      }
      for (const c of [...clowns, ...acro]) { c.pose = 'stand'; c.go(WEST_IN[0], rnd(-1.5, 1.5), 2); }
      await until(() => [...clowns, ...acro].every((c) => c.x < -44), 40);
      for (const c of [...clowns, ...acro]) remove(c);
      crowd.setMood(0.1);
    },

    async munera(opt = {}) {
      narrate('角斗士对决');
      setBand(true);
      const pairs = opt.pair ? [PAIRS.find((p) => p.key === opt.pair)] : opt.pairs || [pick(PAIRS)];
      for (const p of pairs) { await duel(p, { short: opt.short }); await wait(2); }
      A.setOrgan(false);
      setBand(false);
      crowd.setMood(0.1);
    },

    async naumachia() {
      stage('海战表演', '注水的竞技场：两支舰队重演古代海战');
      narrate('海战表演');
      arena.setHypogeum(false);
      A.setWater(true);
      for (let t = 0; t <= 1; t += 0.004) { arena.setWater(t * 1.6); await frame(); }
      const fleets = [0xb03a2a, 0x2f5a8a];
      const ships = [];
      for (let f = 0; f < 2; f++) for (let i = 0; i < 3; i++) {
        const s = ship(fleets[f], f * 3 + i + 1);
        s.userData.temp = true;
        group.add(s);
        const sh = { g: s, x: (f ? 1 : -1) * 30, z: (i - 1) * 9, h: f ? -Math.PI / 2 : Math.PI / 2, v: 0, f, sink: 0, tx: 0, tz: 0, hp: 2 };
        ships.push(sh);
      }
      crowd.setMood(0.4); A.setCrowd(0.7); A.fanfare();
      const T = simT + 75;
      let rams = 0;
      while (simT < T) {
        const dt = 1 / 60;
        for (const s of ships) {
          if (s.sink > 0) { s.sink = Math.min(1, s.sink + dt * 0.08); s.g.position.y = 1.6 - 1.4 - s.sink * 1.9; s.g.rotation.z = s.sink * 0.5; continue; }
          const foes = ships.filter((o) => o.f !== s.f && o.sink === 0);
          const tgt = foes.length ? foes.reduce((a, b) => (Math.hypot(a.x - s.x, a.z - s.z) < Math.hypot(b.x - s.x, b.z - s.z) ? a : b)) : null;
          let hx = s.x, hz = s.z;
          if (tgt) { hx = tgt.x + Math.sin(simT * 0.3 + s.f) * 4; hz = tgt.z + Math.cos(simT * 0.25) * 3; }
          [hx, hz] = clampArena(hx, hz, 6);
          const want = Math.atan2(hx - s.x, hz - s.z);
          s.h += angDiff(s.h, want) * dt * 0.6;
          s.v += ((tgt ? 3.2 : 0.5) - s.v) * dt * 0.5;
          s.x += Math.sin(s.h) * s.v * dt; s.z += Math.cos(s.h) * s.v * dt;
          [s.x, s.z] = clampArena(s.x, s.z, 4);
          s.g.position.set(s.x, 1.6 - 1.4 + Math.sin(simT * 1.3 + s.x) * 0.05, s.z);
          s.g.rotation.set(Math.sin(simT * 0.9 + s.z) * 0.02, s.h, Math.sin(simT * 1.1 + s.x) * 0.03);
          for (const o of s.g.userData.oars) { o.piv.rotation.y = o.sx * Math.sin(simT * 3 + o.i * 0.1) * 0.35; o.piv.rotation.z = o.sx * (0.25 + Math.cos(simT * 3 + o.i * 0.1) * 0.12); }
          if (Math.random() < 0.05) spray.emit(4, s.x + Math.sin(s.h) * 6, 1.6, s.z + Math.cos(s.h) * 6, () => [rnd(-1, 1), rnd(1, 2.5), rnd(-1, 1), 1.2]);
          // 撞击
          if (tgt && Math.hypot(tgt.x - (s.x + Math.sin(s.h) * 6.5), tgt.z - (s.z + Math.cos(s.h) * 6.5)) < 2.2 && (s.cool || 0) < simT) {
            s.cool = simT + 6; tgt.hp -= 1; rams++;
            A.thud(); A.splash(); A.clash(1.4); crowd.cheer(1, Math.atan2(tgt.z / IN_B, tgt.x / IN_A)); A.cheer(1, 4);
            spray.emit(160, tgt.x, 1.6, tgt.z, () => [rnd(-4, 4), rnd(3, 8), rnd(-4, 4), 2]);
            stage('海战表演', `撞角命中！（第 ${rams} 次撞击）`);
            if (tgt.hp <= 0) tgt.sink = 0.001;
            s.v = -1;
          }
        }
        focus.set(ships.reduce((a, s) => a + s.x, 0) / ships.length, 2, ships.reduce((a, s) => a + s.z, 0) / ships.length);
        await frame();
      }
      stage('海战表演', '战斗结束，排水');
      crowd.cheer(1); A.cheer(1, 4);
      for (const s of ships) s.sink = Math.max(s.sink, 0.0001);
      await wait(4);
      for (const s of ships) group.remove(s.g);
      for (let t = 1; t >= 0; t -= 0.004) { arena.setWater(t * 1.6); await frame(); }
      arena.setWater(0); A.setWater(false);
      crowd.setMood(0.1);
    },

    async day() {
      stage('全天连播', '开场游行 → 斗兽 → 午间余兴 → 角斗');
      narrate('比赛日节目单');
      await wait(3);
      await SCRIPTS.pompa(); await wait(2);
      await SCRIPTS.venatio(); await wait(2);
      await SCRIPTS.meridiani(); await wait(2);
      await SCRIPTS.munera({ pairs: [PAIRS[1], PAIRS[0], PAIRS[4]], short: true });
    },
  };
  let sceneryG = null;

  const api = {
    group, focus, PROGRAMS, PAIRS,
    get actors() { return actors; },
    get running() { return running; },
    async play(key, opt = {}) {
      api.stop();
      const id = ++runId;
      running = key;
      arena.setWater(0);
      try { await SCRIPTS[key](opt); }
      catch (e) { if (!(e instanceof Cancel)) console.error(e); }
      if (id === runId) { running = null; clearAll(); setBand(false); A.setOrgan(false); onEvent({ type: 'end', key }); }
    },
    stop() {
      runId++;
      running = null;
      waiters.forEach((r) => r()); waiters = [];
      clearAll(); setBand(false); A.setOrgan(false); A.setWater(false);
      arena.setWater(0);
      crowd.setMood(0.05);
      onEvent({ type: 'stage', title: '', sub: '' });
    },
    update(dt) {
      simT += dt;
      const ws = waiters; waiters = [];
      ws.forEach((r) => r());
      for (const a of actors) a.update(dt);
      mist.update(dt); dust.update(dt); tokens.update(dt); spray.update(dt);
      // 地下室工人：升降机转动时推杆
      // 焦点：场上演员的重心
      const live = actors.filter((a) => !bandActors.includes(a) && Math.abs(a.x) < 44 && !a.mount);
      if (live.length && running !== 'naumachia') {
        const cx = live.reduce((s, a) => s + a.x, 0) / live.length, cz = live.reduce((s, a) => s + a.z, 0) / live.length;
        focus.x += (cx - focus.x) * Math.min(1, dt * 1.5); focus.z += (cz - focus.z) * Math.min(1, dt * 1.5);
      }
    },
    /** 点击拾取演员 */
    pick(ray) {
      let best = null, bd = Infinity;
      const box = new THREE.Box3(), hit = new THREE.Vector3();
      for (const a of actors) {
        if (!a.obj.visible) continue;
        box.setFromObject(a.obj).expandByScalar(0.25);
        if (ray.intersectBox(box, hit)) { const d = hit.distanceTo(ray.origin); if (d < bd) { bd = d; best = a; } }
      }
      return best ? { actor: best, dist: bd } : null;
    },
  };
  return api;
}
