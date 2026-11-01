// 椭圆平面几何：同心椭圆族、等弧长开间、把“展平的开间”弯曲贴合到椭圆上
//
// ring(s, θ)：进深 s（外墙外皮 s=0，向内增大，竞技场护墙 s=S_ARENA）处、参数角 θ 的点。
//   A(s) = OUTER.A - s·ka，B(s) = OUTER.B - s·kb；同一 θ、不同 s 的点在一条直线上（放射墙）。
// 开间：在外墙外皮按弧长等分 BAYS 份，第 k 间中心弧长 = k·L/BAYS（k=0 在 +X 长轴东端，k=20 在 +Z 南端）。
//
// bend(geo, arcCenter)：几何体按“局部立面坐标”建模 —— x 向右（从外面看），y 向上，z 向外（外墙外皮 z=0，墙内为负），
//   映射到世界：θ = θ(arcCenter - x)，s = -z。
import * as THREE from 'three';
import { OUTER, ARENA, S_ARENA, BAYS } from '../config.js';

export const KA = (OUTER.A - ARENA.A) / S_ARENA;
export const KB = (OUTER.B - ARENA.B) / S_ARENA;
export const semiA = (s) => OUTER.A - s * KA;
export const semiB = (s) => OUTER.B - s * KB;

const _p = { x: 0, z: 0 };
export function ring(s, th, out = { x: 0, z: 0 }) {
  out.x = semiA(s) * Math.cos(th);
  out.z = semiB(s) * Math.sin(th);
  return out;
}
export const ringP = (s, th) => ring(s, th, { x: 0, z: 0 });

// ---- 外墙外皮弧长表 ----
const N = 8192;
const TH = new Float64Array(N + 1), AR = new Float64Array(N + 1);
{
  let px = OUTER.A, pz = 0;
  for (let i = 1; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const x = OUTER.A * Math.cos(th), z = OUTER.B * Math.sin(th);
    AR[i] = AR[i - 1] + Math.hypot(x - px, z - pz);
    TH[i] = th;
    px = x; pz = z;
  }
}
export const PERIM = AR[N];
export const BAY_W = PERIM / BAYS;

/** 弧长 → θ（可为负或超过一周） */
export function thetaAt(arc) {
  const k = Math.floor(arc / PERIM);
  let a = arc - k * PERIM;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (AR[m] <= a) lo = m; else hi = m; }
  const t = (a - AR[lo]) / (AR[hi] - AR[lo] || 1);
  return TH[lo] + t * (TH[hi] - TH[lo]) + k * Math.PI * 2;
}
/** θ → 弧长 */
export function arcAt(th) {
  const tau = Math.PI * 2;
  const k = Math.floor(th / tau);
  const t = ((th - k * tau) / tau) * N;
  const i = Math.min(N - 1, Math.floor(t));
  return AR[i] + (t - i) * (AR[i + 1] - AR[i]) + k * PERIM;
}
export const bayArc = (k) => k * BAY_W;
export const bayTheta = (k) => thetaAt(bayArc(k));

/** 椭圆在 (s, θ) 处的外法线（水平）与切线（θ 增大方向） */
export function frame(s, th) {
  const a = semiA(s), b = semiB(s);
  const nx = Math.cos(th) / a, nz = Math.sin(th) / b;
  const l = Math.hypot(nx, nz);
  const out = { x: nx / l, z: nz / l };
  return { out, tan: { x: -out.z, z: out.x } };
}
/** 某点所在的进深 s 与 θ（近似反算：用于拾取） */
export function locate(x, z) {
  // 沿 θ 的放射直线：x = A(s)cosθ, z = B(s)sinθ。二分 s。
  let lo = -4000, hi = S_ARENA + 60;
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2;
    const a = semiA(m), b = semiB(m);
    if (a <= 0.5 || b <= 0.5) { hi = m; continue; }
    const r = (x / a) ** 2 + (z / b) ** 2;
    if (r > 1) hi = m; else lo = m;
  }
  const s = (lo + hi) / 2;
  const th = Math.atan2(z / semiB(s), x / semiA(s));
  return { s, th: th < 0 ? th + Math.PI * 2 : th };
}

/**
 * 弯曲：把局部立面坐标的几何体映射到椭圆上（就地修改并返回）。
 * uvMode：'box' 世界尺度盒式投影（石材）；'keep' 保留原 uv。
 */
export function bend(g, arcCenter, { uvMode = 'box', uvUnit = 1 } = {}) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    if (uvMode === 'box' && uv) {
      const g_ = lx - arcCenter;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      let u, v;
      if (ay >= ax && ay >= az) { u = g_; v = lz; }
      else if (ax >= az) { u = lz; v = ly; }
      else { u = g_; v = ly; }
      uv.setXY(i, u / uvUnit, v / uvUnit);
    }
    const th = thetaAt(arcCenter - lx);
    const s = -lz;
    ring(s, th, _p);
    const f = frame(Math.max(-40, Math.min(S_ARENA + 10, s)), th);
    // 局部 x 向右 = -切线；局部 z 向外 = 外法线
    const wx = -nx * f.tan.x + nz * f.out.x;
    const wz = -nx * f.tan.z + nz * f.out.z;
    const l = Math.hypot(wx, ny, wz) || 1;
    p.setXYZ(i, _p.x, ly, _p.z);
    n.setXYZ(i, wx / l, ny / l, wz / l);
  }
  p.needsUpdate = true; n.needsUpdate = true;
  if (uv) uv.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

/** 世界坐标 → 局部立面矩阵（用于放置实例：雕像、托座等）：返回 Matrix4，原点在 (s, θ) 处，+z 朝外，+x 向右 */
export function placeMatrix(s, th, y, scale = 1, extraRotY = 0) {
  const f = frame(s, th);
  ring(s, th, _p);
  const X = new THREE.Vector3(-f.tan.x, 0, -f.tan.z), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(f.out.x, 0, f.out.z);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  if (extraRotY) m.multiply(new THREE.Matrix4().makeRotationY(extraRotY));
  m.scale(new THREE.Vector3(scale, scale, scale));
  m.setPosition(_p.x, y, _p.z);
  return m;
}
