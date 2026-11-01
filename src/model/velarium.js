// 遮阳天篷：240 根桅杆（立在阁楼层托座上、穿过檐口）、放射状绳索、中央椭圆绳环、可收放的帆布（相邻两桅之间一幅）
import * as THREE from 'three';
import { BAYS } from '../config.js';
import { BAY_W, bayArc, thetaAt, ringP, frame, placeMatrix } from '../core/ellipse.js';
import { cyl, merge, mulberry } from '../core/geom.js';
import { mat } from '../core/materials.js';

const MAST_S = -0.42;          // 桅杆中心在外墙外 0.42 m（托座上）
const MAST_TOP = 57.5, MAST_FOOT = 44.15;
const INNER_S = 47.5;          // 中央绳环所在进深（竞技场上方留出天窗）
const INNER_Y = 47.0;
const NV = 14, NU = 4;

export function buildVelarium(scene) {
  const group = new THREE.Group();
  group.name = 'velarium';
  scene.add(group);
  // 桅杆
  const masts = [];
  for (let k = 0; k < BAYS; k++) for (const cx of [-BAY_W / 3, 0, BAY_W / 3]) masts.push(thetaAt(bayArc(k) - cx));
  masts.sort((a, b) => a - b);
  const mastGeo = merge([cyl(0.16, 0.2, MAST_TOP - MAST_FOOT, 8), cyl(0.24, 0.24, 0.3, 8, 0, MAST_TOP - MAST_FOOT - 0.4)]);
  const mastMesh = new THREE.InstancedMesh(mastGeo, mat('wood'), masts.length);
  masts.forEach((th, i) => mastMesh.setMatrixAt(i, placeMatrix(MAST_S, th, MAST_FOOT)));
  mastMesh.castShadow = true;
  group.add(mastMesh);

  // 绳索：桅顶 → 中央绳环（下垂），桅顶 → 地面界石（外拉）
  const ropeTop = (th) => { const p = ringP(MAST_S, th); return new THREE.Vector3(p.x, MAST_TOP - 0.3, p.z); };
  const ropeIn = (th) => { const p = ringP(INNER_S, th); return new THREE.Vector3(p.x, INNER_Y, p.z); };
  const sag = (v) => Math.sin(Math.PI * v) * 3.2;
  const ropeAt = (th, v, out) => out.copy(ropeTop(th)).lerp(ropeIn(th), v).setY(THREE.MathUtils.lerp(MAST_TOP - 0.3, INNER_Y, v) - sag(v));
  const lines = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  for (const th of masts) {
    for (let i = 0; i < 8; i++) {
      ropeAt(th, i / 8, tmp); ropeAt(th, (i + 1) / 8, tmp2);
      lines.push(tmp.x, tmp.y, tmp.z, tmp2.x, tmp2.y, tmp2.z);
    }
  }
  // 中央绳环
  for (let i = 0; i < 240; i++) {
    const a = ropeIn((i / 240) * Math.PI * 2), b = ropeIn(((i + 1) / 240) * Math.PI * 2);
    lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const ropes = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x6a5a40, transparent: true, opacity: 0.75 }));
  group.add(ropes);
  const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 120 }, (_, i) => ropeIn((i / 120) * Math.PI * 2)), true), 240, 0.12, 5, true), mat('rope'));
  group.add(ring);

  // 帆布：相邻两桅之间一幅，(u 横向, v 自桅杆向中心)
  const n = masts.length;
  const vertsPer = (NU + 1) * (NV + 1);
  const pos = new Float32Array(n * vertsPer * 3), uv = new Float32Array(n * vertsPer * 2);
  const idx = [];
  const rr = mulberry(77);
  const tint = [];
  for (let p = 0; p < n; p++) {
    tint.push(rr());
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const vi = p * vertsPer + j * (NU + 1) + i;
      uv[vi * 2] = (p % 2) * 0.5 + (i / NU) * 0.5; uv[vi * 2 + 1] = j / NV * 6;
      if (i < NU && j < NV) { const a = vi, b = vi + 1, c = vi + NU + 1, d = vi + NU + 2; idx.push(a, c, b, b, c, d); }
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  cg.setIndex(idx);
  const clothMat = mat('canvas');
  clothMat.shadowSide = THREE.DoubleSide;
  const cloth = new THREE.Mesh(cg, clothMat);
  cloth.castShadow = true; cloth.receiveShadow = true;
  cloth.frustumCulled = false;
  group.add(cloth);
  // 收拢的帆布卷（挂在桅杆附近）
  const furled = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 8).rotateZ(Math.PI / 2), mat('canvas'), n);
  furled.castShadow = true;
  group.add(furled);

  let deploy = -1;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  function setDeploy(e) {
    e = Math.max(0, Math.min(1, e));
    if (Math.abs(e - deploy) < 1e-4) return;
    deploy = e;
    cloth.visible = e > 0.01;
    for (let p = 0; p < n; p++) {
      const t0 = masts[p], t1 = masts[(p + 1) % n] + (p === n - 1 ? Math.PI * 2 : 0);
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * e;
        for (let i = 0; i <= NU; i++) {
          const u = i / NU;
          ropeAt(t0, v, A); ropeAt(t1, v, B);
          P.copy(A).lerp(B, u);
          P.y -= Math.sin(Math.PI * u) * (0.35 + v * 0.5);
          const vi = p * vertsPer + j * (NU + 1) + i;
          pos[vi * 3] = P.x; pos[vi * 3 + 1] = P.y; pos[vi * 3 + 2] = P.z;
        }
      }
      // 帆布卷：位于展开前沿
      ropeAt(t0, e, A); ropeAt(t1, e, B);
      dummy.position.copy(A).lerp(B, 0.5);
      dummy.position.y -= 0.3;
      dummy.lookAt(B.x, dummy.position.y, B.z);
      dummy.rotateY(-Math.PI / 2);
      const len = A.distanceTo(B);
      const fat = 0.25 + (1 - e) * 0.9;
      dummy.scale.set(len * 0.95, fat, fat);
      dummy.updateMatrix();
      furled.setMatrixAt(p, dummy.matrix);
    }
    furled.instanceMatrix.needsUpdate = true;
    furled.visible = e < 0.98;
    cg.attributes.position.needsUpdate = true;
    cg.computeVertexNormals();
    cg.computeBoundingSphere();
  }
  setDeploy(1);
  let target = 1;
  return {
    group, masts,
    get deploy() { return deploy; },
    setTarget(t) { target = t; },
    setVisible(v) { group.visible = v; },
    update(dt) { if (Math.abs(target - deploy) > 0.001) setDeploy(deploy + Math.sign(target - deploy) * Math.min(Math.abs(target - deploy), dt * 0.12)); },
    INNER_S, INNER_Y,
  };
}
