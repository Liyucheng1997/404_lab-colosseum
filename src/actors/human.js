// 可动人物：关节骨架（Group 层级）+ 程序化服饰与装备。面朝 +Z，脚底在 y=0，身高约 1.78 m。
// 角斗士兵种装备依据：鱼盔斗士 murmillo、色雷斯 thraex、追击 secutor、鱼网 retiarius、重装 hoplomachus、挑战 provocator、骑马 eques。
import * as THREE from 'three';
import { mulberry } from '../core/geom.js';

const MC = new Map();
export function cmat(color, { metal = 0, rough = 0.75, side = THREE.FrontSide, emissive = 0 } = {}) {
  const k = [color, metal, rough, side, emissive].join('|');
  if (!MC.has(k)) MC.set(k, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, side, emissive }));
  return MC.get(k);
}
const BRONZE = () => cmat(0xb28a4e, { metal: 0.9, rough: 0.32 });
const STEEL = () => cmat(0xb9bcc0, { metal: 0.95, rough: 0.25 });
const LEATHER = () => cmat(0x6b4a2c, { rough: 0.8 });
const WOOD = () => cmat(0x7a5634, { rough: 0.8 });

function mesh(geo, m, cast = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = false; return o; }
/** 锥台肢体：从原点向 -Y 延伸长度 L */
function limb(r0, r1, L, seg = 9) {
  const g = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(r0, -0.01), new THREE.Vector2((r0 + r1) / 2 * 1.04, -L * 0.45), new THREE.Vector2(r1, -L), new THREE.Vector2(0.001, -L - r1 * 0.6)], seg);
  return g;
}
function lath(pts, seg = 12) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg); }

const SKINS = [0xc89a74, 0xb5835c, 0x9a6b48, 0xd8ae8a, 0x7a5236];

/**
 * createHuman({ kind, skin, tunic, seed })
 * kind: 'murmillo' | 'thraex' | 'secutor' | 'retiarius' | 'hoplomachus' | 'provocator' | 'eques' | 'referee' |
 *       'venator' | 'lictor' | 'tubicen' | 'cornicen' | 'editor' | 'attendant' | 'worker' | 'paegniarius' | 'acrobat' | 'sailor' | 'statue'
 */
export function createHuman(opt = {}) {
  const r = mulberry(opt.seed || 1);
  const kind = opt.kind || 'attendant';
  const skinM = opt.material || cmat(opt.skin ?? SKINS[Math.floor(r() * SKINS.length)], { rough: 0.6 });
  const root = new THREE.Group();
  root.name = 'human:' + kind;
  const J = {};
  const add = (parent, name, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  const hips = add(root, 'hips', 0, 0.98, 0);
  const torso = add(hips, 'torso', 0, 0.02, 0);
  const neck = add(torso, 'neck', 0, 0.52, 0);
  const head = add(neck, 'head', 0, 0.1, 0.01);
  const shL = add(torso, 'shL', 0.2, 0.46, 0), shR = add(torso, 'shR', -0.2, 0.46, 0);
  const elL = add(shL, 'elL', 0, -0.29, 0), elR = add(shR, 'elR', 0, -0.29, 0);
  const haL = add(elL, 'haL', 0, -0.26, 0), haR = add(elR, 'haR', 0, -0.26, 0);
  const hipL = add(hips, 'hipL', 0.1, -0.04, 0), hipR = add(hips, 'hipR', -0.1, -0.04, 0);
  const knL = add(hipL, 'knL', 0, -0.45, 0), knR = add(hipR, 'knR', 0, -0.45, 0);
  const ftL = add(knL, 'ftL', 0, -0.44, 0), ftR = add(knR, 'ftR', 0, -0.44, 0);
  const SK = skinM;
  // ---- 身体 ----
  const tor = mesh(lath([[0.13, -0.02], [0.145, 0.08], [0.135, 0.2], [0.16, 0.34], [0.175, 0.44], [0.12, 0.52], [0.05, 0.56]], 14), SK);
  tor.scale.set(1.2, 1, 0.78);
  torso.add(tor);
  const pel = mesh(lath([[0.06, -0.12], [0.15, -0.1], [0.16, 0.0], [0.135, 0.06]], 12), SK);
  pel.scale.set(1.15, 1, 0.8);
  hips.add(pel);
  neck.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8).translate(0, 0.02, 0), SK));
  const hd = mesh(new THREE.SphereGeometry(0.105, 14, 12), SK);
  hd.scale.set(0.9, 1.08, 1);
  hd.position.y = 0.1;
  head.add(hd);
  const nose = mesh(new THREE.ConeGeometry(0.018, 0.04, 5).rotateX(Math.PI / 2), SK);
  nose.position.set(0, 0.09, 0.105);
  head.add(nose);
  const hair = opt.hair ?? [0x2a1d14, 0x3a2a1c, 0x1a1410, 0x5a4030][Math.floor(r() * 4)];
  const hm = mesh(new THREE.SphereGeometry(0.108, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), cmat(hair, { rough: 0.9 }));
  hm.scale.set(0.93, 1.05, 1.04); hm.position.set(0, 0.115, -0.01); hm.rotation.x = -0.25;
  head.add(hm);
  for (const [s, j] of [[shL, 1], [shR, -1]]) s.add(mesh(limb(0.055, 0.045, 0.29), SK));
  for (const e of [elL, elR]) e.add(mesh(limb(0.045, 0.035, 0.26), SK));
  for (const h of [haL, haR]) { const m = mesh(new THREE.SphereGeometry(0.045, 8, 6), SK); m.scale.set(0.8, 1.2, 0.6); m.position.y = -0.04; h.add(m); }
  for (const h of [hipL, hipR]) h.add(mesh(limb(0.08, 0.055, 0.45), SK));
  for (const k of [knL, knR]) k.add(mesh(limb(0.055, 0.038, 0.44), SK));
  const footM = opt.barefoot ? SK : LEATHER();
  for (const f of [ftL, ftR]) { const m = mesh(new THREE.BoxGeometry(0.09, 0.06, 0.24).translate(0, -0.03, 0.05), footM); f.add(m); }

  // ---- 服饰 ----
  const cloth = (c) => cmat(c, { rough: 0.85 });
  const subl = () => { const m = mesh(lath([[0.15, -0.16], [0.17, -0.12], [0.175, 0.0], [0.16, 0.05]], 12), cloth(opt.cloth ?? 0xeee6d6)); m.scale.set(1.18, 1, 0.84); hips.add(m); };
  const belt = () => { const m = mesh(new THREE.CylinderGeometry(0.17, 0.172, 0.11, 14, 1, true), cmat(0xb28a4e, { metal: 0.9, rough: 0.3, side: THREE.DoubleSide })); m.scale.set(1.17, 1, 0.83); m.position.y = 0.04; hips.add(m); };
  const tunic = (c, len = 0.48, sleeves = true) => {
    const t = mesh(lath([[0.13, 0.52], [0.19, 0.44], [0.185, 0.3], [0.165, 0.12], [0.19, -0.05], [0.24, -len]], 14), cloth(c));
    t.scale.set(1.2, 1, 0.82); torso.add(t);
    if (sleeves) for (const s of [shL, shR]) { const m = mesh(lath([[0.07, 0.02], [0.075, -0.12], [0.072, -0.14]], 8), cloth(c)); s.add(m); }
    return t;
  };
  const toga = (c = 0xf2eee4, stripe = null) => {
    const t = mesh(lath([[0.14, 0.5], [0.21, 0.42], [0.21, 0.2], [0.2, -0.1], [0.24, -0.6], [0.27, -0.95]], 16), cloth(c));
    t.scale.set(1.15, 1, 0.9); torso.add(t);
    const sash = mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16, Math.PI * 1.2), cloth(c));
    sash.rotation.set(0.3, 0, 0.9); sash.position.set(0, 0.25, 0.03); sash.scale.set(1.1, 1, 0.8); torso.add(sash);
    if (stripe) { const s = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 16, 1, true), cmat(stripe, { side: THREE.DoubleSide })); s.position.y = -0.93; s.scale.set(1.15, 1, 0.9); torso.add(s); }
    for (const s of [shL, shR]) s.add(mesh(lath([[0.075, 0.02], [0.085, -0.15], [0.08, -0.17]], 8), cloth(c)));
  };
  const cloak = (c) => {
    const g = new THREE.PlaneGeometry(0.55, 1.15, 4, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -Math.abs(x) * 0.25 - (0.6 - y) * 0.08 + Math.sin(x * 14) * 0.02); }
    g.computeVertexNormals();
    const m = mesh(g, cmat(c, { side: THREE.DoubleSide }));
    m.position.set(0, -0.1, -0.15);
    torso.add(m);
    const k = mesh(new THREE.SphereGeometry(0.03, 6, 4), cmat(0xd8aa48, { metal: 1, rough: 0.3 }));
    k.position.set(0.12, 0.47, 0.08); torso.add(k);
    return m;
  };
  const manica = (sh, el) => {
    for (const [p, L, r0] of [[sh, 0.29, 0.065], [el, 0.26, 0.05]]) {
      const m = mesh(limb(r0, r0 - 0.012, L, 10), cmat(0xe8dcc4, { rough: 0.9 }));
      m.scale.set(1.08, 1, 1.08); p.add(m);
      for (let i = 1; i < 5; i++) { const ring = mesh(new THREE.TorusGeometry(r0 - 0.002 - i * 0.002, 0.008, 4, 10).rotateX(Math.PI / 2), cmat(0xcbbb9a)); ring.position.y = -L * (i / 5); p.add(ring); }
    }
  };
  const greave = (kn, h = 0.36, metal = true) => {
    const m = mesh(lath([[0.06, 0.02], [0.068, -0.12], [0.058, -h], [0.05, -h - 0.02]], 10), metal ? BRONZE() : cloth(0xe2d6bc));
    kn.add(m);
  };
  const fasciae = (hip) => { const m = mesh(limb(0.09, 0.064, 0.42, 10), cmat(0xe6dcc6, { rough: 0.95 })); m.scale.set(1.04, 1, 1.04); hip.add(m); };
  // ---- 头盔 ----
  const helmetBowl = (rr = 0.135, h = 1.1) => { const m = mesh(new THREE.SphereGeometry(rr, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), BRONZE()); m.scale.set(1, h, 1.05); m.position.y = 0.1; head.add(m); return m; };
  const brim = (w = 0.2) => { const m = mesh(new THREE.CylinderGeometry(w, w + 0.02, 0.02, 18), BRONZE()); m.position.y = 0.045; m.scale.set(1, 1, 1.12); head.add(m); };
  const visor = (dark = true) => {
    const m = mesh(new THREE.SphereGeometry(0.128, 14, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.35, Math.PI * 0.4), BRONZE());
    m.position.y = 0.1; m.scale.set(1.02, 1.1, 1.12); head.add(m);
    if (dark) { const g = mesh(new THREE.PlaneGeometry(0.11, 0.08, 6, 4), cmat(0x161310, { rough: 1, side: THREE.DoubleSide })); g.position.set(0, 0.1, 0.143); head.add(g);
      const grid = new THREE.Group();
      for (let i = -2; i <= 2; i++) { const bar = mesh(new THREE.BoxGeometry(0.006, 0.085, 0.006), BRONZE(), false); bar.position.set(i * 0.022, 0.1, 0.147); grid.add(bar); }
      for (let i = -1; i <= 1; i++) { const bar = mesh(new THREE.BoxGeometry(0.11, 0.006, 0.006), BRONZE(), false); bar.position.set(0, 0.1 + i * 0.025, 0.147); grid.add(bar); }
      head.add(grid);
    }
  };
  const crest = (shape, color = 0xb28a4e) => {
    const s = new THREE.Shape();
    shape(s);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -0.0125); g.rotateY(Math.PI / 2);
    const m = mesh(g, cmat(color, color === 0xb28a4e ? { metal: 0.9, rough: 0.32 } : { rough: 0.8 }));
    m.position.y = 0.2; head.add(m); return m;
  };
  const plumes = (c = 0xe8e0d0) => { for (const sx of [-1, 1]) { const m = mesh(new THREE.ConeGeometry(0.02, 0.28, 5), cmat(c, { rough: 1 })); m.position.set(sx * 0.12, 0.3, -0.01); m.rotation.z = -sx * 0.25; head.add(m); } };
  // ---- 盾与兵器（挂在手上） ----
  const shieldOn = (geo, m, rot = [0, 0, 0], pos = [0, -0.05, 0.12]) => { const s = new THREE.Group(); const o = mesh(geo, m); s.add(o); s.position.set(...pos); s.rotation.set(...rot); haL.add(s); J.shield = s; return s; };
  const scutum = (w = 0.64, h = 1.04, c = 0x9a2a1c) => {
    const g = new THREE.CylinderGeometry(0.55, 0.55, h, 12, 1, true, -w / 1.1, w / 0.55);
    g.rotateY(Math.PI); g.translate(0, 0, 0.55);
    const grp = shieldOn(g, cmat(c, { side: THREE.DoubleSide, rough: 0.6 }), [0, Math.PI, 0], [0.02, -0.02, 0.06]);
    const boss = mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), BRONZE());
    boss.position.set(0, 0, -0.01); boss.rotation.y = Math.PI; grp.add(boss);
    const rim = mesh(new THREE.BoxGeometry(w * 1.02, 0.03, 0.04), BRONZE()); rim.position.set(0, h / 2, -0.04); grp.add(rim);
    const rim2 = rim.clone(); rim2.position.y = -h / 2; grp.add(rim2);
    return grp;
  };
  const parmula = () => {
    const g = new THREE.BoxGeometry(0.58, 0.64, 0.04);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getX(i) ** 2) * 0.5);
    g.computeVertexNormals();
    const grp = shieldOn(g, cmat(0x30506a, { rough: 0.6 }), [0, 0, 0], [0.02, -0.02, 0.1]);
    const boss = mesh(new THREE.SphereGeometry(0.05, 8, 6), BRONZE()); boss.position.z = 0.03; grp.add(boss);
    return grp;
  };
  const roundShield = (rr = 0.32, c = 0xb28a4e, metal = true) => {
    const g = new THREE.SphereGeometry(rr * 1.6, 18, 6, 0, Math.PI * 2, 0, 0.42).rotateX(Math.PI / 2).translate(0, 0, -rr * 1.6 * 0.91);
    const grp = shieldOn(g, metal ? cmat(c, { metal: 0.85, rough: 0.35, side: THREE.DoubleSide }) : cmat(c, { side: THREE.DoubleSide }), [0, 0, 0], [0.02, -0.02, 0.12]);
    return grp;
  };
  const inHand = (hand, obj, rot = [Math.PI / 2, 0, 0], pos = [0, -0.06, 0.02]) => { obj.position.set(...pos); obj.rotation.set(...rot); hand.add(obj); return obj; };
  const gladius = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.012).translate(0, 0.32, 0), STEEL()));
    g.add(mesh(new THREE.ConeGeometry(0.025, 0.06, 4).translate(0, 0.6, 0), STEEL()));
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.03, 0.04).translate(0, 0.06, 0), BRONZE()));
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 6).translate(0, 0.0, 0), cmat(0x3a2a1a)));
    g.add(mesh(new THREE.SphereGeometry(0.03, 6, 5).translate(0, -0.06, 0), BRONZE()));
    return g;
  };
  const sica = () => {
    const g = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.0, 0.32, 0), new THREE.Vector3(0.14, 0.46, 0));
    g.add(mesh(new THREE.TubeGeometry(curve, 8, 0.016, 4, false), STEEL()));
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 6), cmat(0x3a2a1a)));
    return g;
  };
  const shaft = (L, rr = 0.018, c = 0x7a5634) => mesh(new THREE.CylinderGeometry(rr, rr, L, 6).translate(0, L * 0.25, 0), cmat(c, { rough: 0.8 }));
  const spear = (L = 2.1) => { const g = new THREE.Group(); g.add(shaft(L)); const t = mesh(new THREE.ConeGeometry(0.035, 0.25, 4).translate(0, L * 0.75 + 0.12, 0), STEEL()); g.add(t); return g; };
  const trident = () => {
    const g = new THREE.Group(); g.add(shaft(1.75, 0.02));
    const y = 1.75 * 0.75;
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.025, 0.025).translate(0, y, 0), STEEL()));
    for (const x of [-0.09, 0, 0.09]) g.add(mesh(new THREE.ConeGeometry(0.014, 0.26, 4).translate(x, y + 0.13, 0), STEEL()));
    return g;
  };
  const netBundle = () => { const m = mesh(new THREE.IcosahedronGeometry(0.12, 1), cmat(0x8a7a5a, { rough: 1 })); m.scale.set(1, 1.5, 0.7); return m; };

  // ---- 按兵种装配 ----
  const tunicColor = opt.tunic ?? [0xa83a2a, 0x6a7a3a, 0x3a5a8a, 0xc89a3a, 0x7a4a6a, 0xd8c8a8][Math.floor(r() * 6)];
  const extra = {};
  switch (kind) {
    case 'murmillo':
      subl(); belt(); manica(shR, elR); fasciae(hipL); greave(knL, 0.3);
      helmetBowl(); brim(0.2); visor();
      crest((s) => { s.moveTo(-0.13, 0); s.quadraticCurveTo(-0.05, 0.12, 0.03, 0.2); s.lineTo(0.12, 0.17); s.quadraticCurveTo(0.1, 0.05, 0.13, -0.02); s.lineTo(-0.13, 0); });
      scutum(0.62, 1.0, opt.shieldColor ?? 0x8e2b1e);
      extra.weapon = inHand(haR, gladius());
      break;
    case 'thraex':
      subl(); belt(); manica(shR, elR); fasciae(hipL); fasciae(hipR); greave(knL, 0.42); greave(knR, 0.42);
      helmetBowl(); brim(0.19); visor(); plumes();
      crest((s) => { s.moveTo(-0.1, 0); s.quadraticCurveTo(0, 0.08, 0.06, 0.16); s.quadraticCurveTo(0.14, 0.2, 0.17, 0.12); s.lineTo(0.12, 0.1); s.quadraticCurveTo(0.08, 0.03, 0.1, -0.02); s.lineTo(-0.1, 0); });
      parmula();
      extra.weapon = inHand(haR, sica());
      break;
    case 'hoplomachus':
      subl(); belt(); manica(shR, elR); fasciae(hipL); fasciae(hipR); greave(knL, 0.4); greave(knR, 0.4);
      helmetBowl(); brim(0.19); visor(); plumes(0x9a2a1c);
      crest((s) => { s.moveTo(-0.08, 0); s.lineTo(-0.02, 0.1); s.lineTo(0.06, 0.1); s.lineTo(0.08, 0); s.lineTo(-0.08, 0); }, 0x9a2a1c);
      roundShield(0.3);
      extra.weapon = inHand(haR, spear(1.9), [Math.PI / 2, 0, 0], [0, -0.05, -0.4]);
      break;
    case 'secutor':
      subl(); belt(); manica(shR, elR); fasciae(hipL); greave(knL, 0.3);
      { const m = mesh(new THREE.SphereGeometry(0.14, 18, 14), BRONZE()); m.scale.set(0.95, 1.15, 1.15); m.position.set(0, 0.1, 0.01); head.add(m);
        for (const sx of [-1, 1]) { const e = mesh(new THREE.CircleGeometry(0.014, 8), cmat(0x0a0806)); e.position.set(sx * 0.035, 0.12, 0.162); head.add(e); }
        crest((s) => { s.moveTo(-0.12, -0.05); s.quadraticCurveTo(0, 0.07, 0.12, -0.05); s.lineTo(-0.12, -0.05); }); }
      scutum(0.62, 1.0, opt.shieldColor ?? 0x6a4a1a);
      extra.weapon = inHand(haR, gladius());
      break;
    case 'retiarius':
      subl(); belt(); manica(shL, elL); fasciae(hipL); fasciae(hipR);
      { const g = mesh(new THREE.BoxGeometry(0.14, 0.17, 0.02), BRONZE()); g.position.set(0.04, 0.06, 0); g.rotation.z = -0.3; shL.add(g); J.galerus = g; }
      extra.weapon = inHand(haR, trident(), [Math.PI / 2, 0, 0], [0, -0.05, -0.3]);
      extra.net = inHand(haL, netBundle(), [0, 0, 0], [0, -0.12, 0.05]);
      extra.dagger = (() => { const d = gladius(); d.scale.setScalar(0.5); d.position.set(0.1, 0.0, 0.14); d.rotation.z = 0.4; hips.add(d); return d; })();
      break;
    case 'provocator':
      subl(); belt(); manica(shR, elR); fasciae(hipL); greave(knL, 0.34);
      { const c = mesh(new THREE.BoxGeometry(0.22, 0.17, 0.03), BRONZE()); c.position.set(0, 0.36, 0.14); torso.add(c); }
      helmetBowl(0.135, 1.2); visor(); plumes(0xd8c8a0);
      scutum(0.56, 0.95, opt.shieldColor ?? 0x3a5a3a);
      extra.weapon = inHand(haR, gladius());
      break;
    case 'eques':
      tunic(opt.tunic ?? 0xc8a050, 0.42); manica(shR, elR); fasciae(hipL); fasciae(hipR);
      helmetBowl(); brim(0.18); visor(); plumes(0xb03020);
      roundShield(0.3, 0x8a2a1a, false);
      extra.weapon = inHand(haR, spear(2.4), [Math.PI / 2, 0, 0], [0, -0.05, -0.6]);
      break;
    case 'referee':
      tunic(0xf2eee4, 0.55);
      { for (const sx of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(0.03, 0.9, 0.005), cmat(0x8e2b1e)); st.position.set(sx * 0.08, 0.05, 0.2); st.rotation.x = -0.12; torso.add(st); } }
      extra.weapon = inHand(haR, shaft(1.6, 0.016, 0x5a3c22), [Math.PI / 2, 0, 0], [0, -0.04, -0.2]);
      break;
    case 'venator':
      tunic(opt.tunic ?? tunicColor, 0.4); belt(); fasciae(hipL); fasciae(hipR);
      extra.weapon = inHand(haR, spear(2.2), [Math.PI / 2, 0, 0], [0, -0.05, -0.5]);
      break;
    case 'lictor':
      toga(0xeae2d0);
      { const f = new THREE.Group(); for (let i = 0; i < 9; i++) { const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 4), WOOD()); rod.position.set(Math.cos(i) * 0.04, 0, Math.sin(i) * 0.04); f.add(rod); }
        for (const y of [-0.4, 0, 0.4]) { const t = mesh(new THREE.TorusGeometry(0.055, 0.008, 4, 10).rotateX(Math.PI / 2), cmat(0x8e2b1e)); t.position.y = y; f.add(t); }
        const axe = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.01), STEEL()); axe.position.set(0.1, 0.62, 0); f.add(axe);
        f.position.set(0, -0.05, 0.05); f.rotation.set(0, 0, 0); haL.add(f); extra.weapon = f; }
      break;
    case 'tubicen': case 'cornicen':
      tunic(opt.tunic ?? 0xc8a050, 0.45); belt();
      if (kind === 'tubicen') {
        const t = new THREE.Group();
        t.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.65), BRONZE()));
        t.add(mesh(new THREE.CylinderGeometry(0.07, 0.015, 0.16, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.36), cmat(0xb28a4e, { metal: 0.9, rough: 0.3, side: THREE.DoubleSide })));
        t.position.set(0, 0.08, 0.12); head.add(t); extra.horn = t;
      } else {
        const t = new THREE.Group();
        const c = mesh(new THREE.TorusGeometry(0.5, 0.018, 6, 28, Math.PI * 1.75), BRONZE()); c.rotation.y = Math.PI / 2; t.add(c);
        t.add(mesh(new THREE.CylinderGeometry(0.12, 0.02, 0.2, 10, 1, true).translate(0, 0.08, 0), cmat(0xb28a4e, { metal: 0.9, rough: 0.3, side: THREE.DoubleSide })));
        t.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5).rotateZ(0).translate(0, 0, 0), WOOD()));
        t.position.set(0, 0.0, 0.1); t.rotation.set(0, 0, 0); t.position.set(0, -0.3, 0.05);
        torso.add(t); t.position.set(0, 0.55, 0.05); extra.horn = t;
      }
      break;
    case 'editor':
      toga(0xf4f0e6, 0x5b1847);
      break;
    case 'senator':
      toga(0xf4f0e6, 0x5b1847);
      break;
    case 'worker': case 'attendant':
      tunic(opt.tunic ?? (kind === 'worker' ? 0x8a7a5a : 0xb89a6a), 0.42, kind !== 'worker'); belt();
      break;
    case 'paegniarius':
      tunic(opt.tunic ?? 0xc84a2a, 0.4);
      extra.weapon = inHand(haR, shaft(1.0, 0.03, 0x9a7a4a), [Math.PI / 2, 0, 0], [0, -0.05, -0.2]);
      break;
    case 'acrobat':
      subl(); { const s = mesh(lath([[0.12, 0.5], [0.17, 0.42], [0.16, 0.2], [0.15, 0.05]], 12), cmat(opt.tunic ?? 0xd8a020)); s.scale.set(1.2, 1, 0.8); torso.add(s); }
      break;
    case 'statue':
      break;
    case 'sailor':
      tunic(0x8a9aa8, 0.38, false);
      break;
    default:
      tunic(tunicColor, 0.45);
  }
  if (opt.cloak) extra.cloak = cloak(opt.cloak);
  const h = { root, J, kind, extra, pose: {}, t: 0 };
  setPose(h, POSES.stand);
  return h;
}

// ---------- 姿势 ----------
// 关节角（弧度）：sh*/el*/hip*/kn* 的 [x, y, z]；hipsY 骨盆高度偏移；torso [x,y,z]；head [x,y,z]
const P = (o) => o;
export const POSES = {
  stand: P({}),
  guard: P({ hipsY: -0.06, torso: [0.12, 0.25, 0], head: [-0.05, -0.2, 0], shL: [-0.9, 0, 0.25], elL: [-1.2, 0, 0], shR: [-0.35, 0, -0.35], elR: [-1.7, 0, 0], hipL: [-0.45, 0, 0.08], knL: [0.55, 0, 0], hipR: [0.25, 0, -0.08], knR: [0.4, 0, 0] }),
  thrust: P({ hipsY: -0.12, torso: [0.25, -0.25, 0], head: [-0.15, 0.2, 0], shL: [-0.6, 0, 0.35], elL: [-1.1, 0, 0], shR: [-1.5, 0, 0.05], elR: [-0.1, 0, 0], hipL: [-0.95, 0, 0.05], knL: [0.95, 0, 0], hipR: [0.5, 0, -0.05], knR: [0.2, 0, 0] }),
  slash: P({ hipsY: -0.08, torso: [0.15, 0.5, 0], shL: [-0.7, 0, 0.3], elL: [-1.2, 0, 0], shR: [-2.4, 0, -0.4], elR: [-0.6, 0, 0], hipL: [-0.6, 0, 0.1], knL: [0.7, 0, 0], hipR: [0.35, 0, -0.1], knR: [0.3, 0, 0] }),
  block: P({ hipsY: -0.1, torso: [-0.05, 0.35, 0], shL: [-1.35, 0, 0.1], elL: [-0.8, 0, 0], shR: [-0.2, 0, -0.5], elR: [-1.4, 0, 0], hipL: [-0.3, 0, 0.12], knL: [0.6, 0, 0], hipR: [0.45, 0, -0.1], knR: [0.5, 0, 0] }),
  hit: P({ hipsY: -0.05, torso: [-0.35, -0.3, 0.15], head: [-0.3, 0.2, 0], shL: [-0.3, 0, 0.8], elL: [-0.6, 0, 0], shR: [0.2, 0, -0.9], elR: [-0.6, 0, 0], hipL: [0.2, 0, 0.1], knL: [0.3, 0, 0], hipR: [-0.4, 0, -0.1], knR: [0.4, 0, 0] }),
  kneel: P({ hipsY: -0.43, torso: [0.2, 0, 0], head: [0.25, 0, 0], shL: [-0.2, 0, 0.2], elL: [-0.4, 0, 0], shR: [-0.1, 0, -0.3], elR: [-0.3, 0, 0], hipL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], hipR: [0.15, 0, -0.1], knR: [1.95, 0, 0] }),
  appeal: P({ hipsY: -0.43, torso: [0.1, 0, 0], head: [-0.2, 0, 0], shL: [-2.9, 0, 0.1], elL: [-0.15, 0, 0], shR: [-0.1, 0, -0.3], elR: [-0.3, 0, 0], hipL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], hipR: [0.15, 0, -0.1], knR: [1.95, 0, 0] }),
  victory: P({ torso: [-0.12, 0, 0], head: [-0.35, 0, 0], shL: [-2.8, 0, 0.35], elL: [-0.2, 0, 0], shR: [-2.8, 0, -0.35], elR: [-0.2, 0, 0], hipL: [-0.05, 0, 0.1], hipR: [0.05, 0, -0.1] }),
  salute: P({ head: [-0.25, 0, 0], shR: [-2.6, 0, -0.1], elR: [-0.1, 0, 0], shL: [-0.5, 0, 0.1], elL: [-1.0, 0, 0] }),
  cheer: P({ head: [-0.2, 0, 0], shL: [-2.4, 0, 0.6], elL: [-0.6, 0, 0], shR: [-2.4, 0, -0.6], elR: [-0.6, 0, 0] }),
  blow: P({ head: [-0.15, 0, 0], shL: [-1.2, 0, 0.5], elL: [-1.6, 0, 0], shR: [-1.2, 0, -0.5], elR: [-1.6, 0, 0] }),
  carry: P({ shL: [-0.8, 0, 0.1], elL: [-1.4, 0, 0], shR: [-0.2, 0, -0.1], elR: [-0.2, 0, 0] }),
  push: P({ hipsY: -0.08, torso: [0.55, 0, 0], shL: [-1.4, 0, 0.1], elL: [-0.3, 0, 0], shR: [-1.4, 0, -0.1], elR: [-0.3, 0, 0], hipL: [-0.6, 0, 0], knL: [0.5, 0, 0], hipR: [0.4, 0, 0], knR: [0.2, 0, 0] }),
  ride: P({ hipsY: 0, shL: [-0.8, 0, 0.2], elL: [-1.0, 0, 0], shR: [-0.6, 0, -0.2], elR: [-1.3, 0, 0], hipL: [-1.35, 0, 0.45], knL: [1.5, 0, 0], hipR: [-1.35, 0, -0.45], knR: [1.5, 0, 0] }),
  ridecharge: P({ torso: [0.25, 0, 0], shL: [-0.8, 0, 0.3], elL: [-1.0, 0, 0], shR: [-1.3, 0, -0.05], elR: [-0.1, 0, 0], hipL: [-1.35, 0, 0.45], knL: [1.5, 0, 0], hipR: [-1.35, 0, -0.45], knR: [1.5, 0, 0] }),
  dead: P({ hipsY: -0.85, torso: [-1.45, 0, 0], head: [0.2, 0.6, 0], shL: [-0.4, 0, 1.2], elL: [-0.3, 0, 0], shR: [0.3, 0, -1.0], elR: [-0.5, 0, 0], hipL: [-1.4, 0, 0.2], knL: [0.3, 0, 0], hipR: [-1.5, 0, -0.1], knR: [0.6, 0, 0] }),
  juggle: P({ head: [-0.4, 0, 0], shL: [-1.6, 0, 0.3], elL: [-1.2, 0, 0], shR: [-1.6, 0, -0.3], elR: [-1.2, 0, 0] }),
  handstand: P({ hipsY: 0.75, torso: [Math.PI, 0, 0], head: [0, 0, 0], shL: [Math.PI, 0, 0.15], elL: [0, 0, 0], shR: [Math.PI, 0, -0.15], elR: [0, 0, 0], hipL: [0.2, 0, 0.2], knL: [0.6, 0, 0], hipR: [0.2, 0, -0.2], knR: [0.6, 0, 0] }),
  throwNet: P({ torso: [0.1, -0.6, 0], shL: [-1.8, 0, 0.9], elL: [-0.2, 0, 0], shR: [-0.7, 0, -0.2], elR: [-0.8, 0, 0], hipL: [-0.6, 0, 0.1], knL: [0.6, 0, 0], hipR: [0.3, 0, -0.1], knR: [0.3, 0, 0] }),
  tridentGuard: P({ hipsY: -0.08, torso: [0.12, -0.15, 0], shL: [-0.6, 0, 0.5], elL: [-1.0, 0, 0], shR: [-0.9, 0, -0.2], elR: [-0.9, 0, 0], hipL: [-0.45, 0, 0.1], knL: [0.5, 0, 0], hipR: [0.3, 0, -0.1], knR: [0.4, 0, 0] }),
};
const JOINTS = ['torso', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR'];

function ensureCur(h) {
  if (!h.cur) { h.cur = { hipsY: 0 }; for (const n of JOINTS) h.cur[n] = [0, 0, 0]; }
  return h.cur;
}
/** 立即设为某姿势 */
export function setPose(h, pose) {
  const c = ensureCur(h);
  for (const n of JOINTS) c[n] = [...(pose[n] || [0, 0, 0])];
  c.hipsY = pose.hipsY || 0;
  apply(h, null);
}
/** 平滑过渡到目标姿势并叠加步态（每帧调用）。walk = { phase, amp, keepArms } */
export function animate(h, poseName, dt, speed = 6, walk = null) {
  const c = ensureCur(h);
  const pose = POSES[poseName] || POSES.stand;
  const k = 1 - Math.exp(-dt * speed);
  for (const n of JOINTS) {
    const t = pose[n] || [0, 0, 0], v = c[n];
    v[0] += (t[0] - v[0]) * k; v[1] += (t[1] - v[1]) * k; v[2] += (t[2] - v[2]) * k;
  }
  c.hipsY += ((pose.hipsY || 0) - c.hipsY) * k;
  apply(h, walk);
}
function apply(h, walk) {
  const J = h.J, c = h.cur;
  for (const n of JOINTS) J[n].rotation.set(c[n][0], c[n][1], c[n][2]);
  J.hips.position.y = 0.98 + c.hipsY;
  if (walk && walk.amp > 0.001) {
    const s = Math.sin(walk.phase), co = Math.cos(walk.phase), a = walk.amp;
    J.hipL.rotation.x += -s * 0.6 * a; J.hipR.rotation.x += s * 0.6 * a;
    J.knL.rotation.x += Math.max(0, co) * 1.0 * a; J.knR.rotation.x += Math.max(0, -co) * 1.0 * a;
    if (!walk.keepArms) { J.shL.rotation.x += s * 0.45 * a; J.shR.rotation.x += -s * 0.45 * a; }
    J.hips.position.y += Math.abs(co) * 0.04 * a - 0.02 * a;
    J.torso.rotation.y += s * 0.07 * a;
  }
}
