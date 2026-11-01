// 观众：约 4 万个实例化坐姿人像，按看台分区着装（元老/骑士白色托加、平民本色羊毛、顶层妇女彩色披肩与穷人深色衣）。
// 顶点着色器里做呼吸摆动、起身欢呼、举手挥动（uExcite 全场情绪，uFocus 关注方向）。
import * as THREE from 'three';
import { BAYS } from '../config.js';
import { BAY_W, PERIM, thetaAt, placeMatrix, semiA, semiB } from '../core/ellipse.js';
import { TIERS, seatRows, hasVom, hasAisle, widthFactor } from '../model/cavea.js';
import { mulberry } from '../core/geom.js';

function figureGeometry(lo = false) {
  const parts = [];
  const add = (g, arm = 0, skin = 0, hair = 0) => {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count;
    g.setAttribute('aArm', new THREE.Float32BufferAttribute(new Float32Array(n).fill(arm), 1));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(new Float32Array(n).fill(skin), 1));
    g.setAttribute('aHair', new THREE.Float32BufferAttribute(new Float32Array(n).fill(hair), 1));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  if (lo) {
    add(new THREE.BoxGeometry(0.36, 0.6, 0.3).translate(0, 0.3, 0.02));
    add(new THREE.BoxGeometry(0.34, 0.14, 0.4).translate(0, 0.07, 0.18));
    add(new THREE.BoxGeometry(0.16, 0.18, 0.18).translate(0, 0.78, 0), 0, 1);
  } else {
    // 躯干（收腰五棱柱）
    add(new THREE.CylinderGeometry(0.15, 0.18, 0.58, 5, 1, true).scale(1.15, 1, 0.75).translate(0, 0.38, -0.02));
    add(new THREE.CylinderGeometry(0.06, 0.15, 0.1, 5, 1, true).scale(1.2, 1, 0.8).translate(0, 0.72, -0.02));
    // 大腿（向前，合为一块）+ 小腿
    add(new THREE.BoxGeometry(0.32, 0.13, 0.42).translate(0, 0.07, 0.18));
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.11, 0.48, 0.12).translate(sx * 0.09, -0.22, 0.36));
    // 头 + 头发
    add(new THREE.IcosahedronGeometry(0.1, 0).scale(0.92, 1.1, 1).translate(0, 0.86, 0.01), 0, 1);
    add(new THREE.SphereGeometry(0.104, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.45).translate(0, 0.885, -0.012), 0, 0, 1);
    // 手臂（肩部为旋转支点），手为小方块
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.045, 0.05, 0.48, 4, 1, true).translate(sx * 0.22, 0.43, 0.02), 1);
      add(new THREE.BoxGeometry(0.07, 0.08, 0.07).translate(sx * 0.22, 0.17, 0.03), 1, 1);
    }
  }
  const pos = [], nor = [], arm = [], skin = [], hair = [];
  for (const g of parts) {
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    arm.push(...g.attributes.aArm.array); skin.push(...g.attributes.aSkin.array); hair.push(...g.attributes.aHair.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aArm', new THREE.Float32BufferAttribute(arm, 1));
  g.setAttribute('aSkin', new THREE.Float32BufferAttribute(skin, 1));
  g.setAttribute('aHair', new THREE.Float32BufferAttribute(hair, 1));
  return g;
}

// 各分区服色（rgb 0..1）
const PALETTE = {
  podium: [[0.88, 0.86, 0.8, 8], [0.84, 0.81, 0.74, 4], [0.6, 0.2, 0.18, 1], [0.45, 0.16, 0.36, 1]],
  primum: [[0.86, 0.83, 0.76, 8], [0.8, 0.76, 0.68, 4], [0.66, 0.56, 0.42, 2], [0.55, 0.25, 0.2, 1], [0.3, 0.38, 0.52, 1]],
  imum: [[0.8, 0.75, 0.64, 6], [0.7, 0.62, 0.5, 4], [0.58, 0.44, 0.3, 3], [0.62, 0.28, 0.2, 3], [0.3, 0.4, 0.56, 2], [0.44, 0.5, 0.3, 2], [0.75, 0.58, 0.3, 2]],
  summum: [[0.76, 0.7, 0.6, 4], [0.58, 0.48, 0.36, 5], [0.4, 0.34, 0.28, 5], [0.65, 0.3, 0.2, 3], [0.32, 0.4, 0.55, 3], [0.46, 0.48, 0.28, 2], [0.72, 0.55, 0.28, 2]],
  ligneis: [[0.4, 0.32, 0.26, 5], [0.3, 0.28, 0.28, 3], [0.72, 0.5, 0.24, 3], [0.64, 0.22, 0.2, 3], [0.24, 0.38, 0.62, 3], [0.28, 0.5, 0.42, 2], [0.52, 0.24, 0.46, 2], [0.86, 0.8, 0.66, 2]],
};
function pick(r, list) {
  const tot = list.reduce((a, c) => a + c[3], 0);
  let x = r() * tot;
  for (const c of list) { x -= c[3]; if (x <= 0) return c; }
  return list[0];
}

export function buildCrowd(scene, { density = 1 } = {}) {
  const r = mulberry(4242);
  const mats = [], colors = [], phases = [], zones = [];
  const rows = seatRows();
  const tierOf = Object.fromEntries(TIERS.map((t) => [t.key, t]));
  for (const row of rows) {
    const t = tierOf[row.tier];
    const s = row.sFront - (t.run * 0.5);
    const per = Math.PI * (3 * (semiA(s) + semiB(s)) - Math.sqrt((3 * semiA(s) + semiB(s)) * (semiA(s) + 3 * semiB(s))));
    const spacing = (row.tier === 'podium' ? 0.95 : 0.45) / density;
    const n = Math.floor(per / spacing);
    const f = widthFactor(row.sFront);
    for (let i = 0; i < n; i++) {
      const arc = ((i + r() * 0.3) / n) * PERIM;
      const k = ((Math.round(arc / BAY_W) % BAYS) + BAYS) % BAYS;
      const x = k * BAY_W - arc + (k === 0 && arc > PERIM / 2 ? PERIM : 0);
      const lx = Math.abs(x);
      if (hasAisle(t, k) && lx < (1.1 * f) / 2 + 0.25 * f) continue;
      if (hasVom(t, k) && row.i < 4 && lx < (2.4 * f) / 2 + 0.45 * f) continue;
      if ((k === 20 || k === 60) && row.tier === 'podium' && lx < 6.8 * widthFactor(51)) continue;
      if (r() > (row.tier === 'ligneis' ? 0.9 : 0.94)) continue;
      const th = thetaAt(arc);
      const m = placeMatrix(s + (r() - 0.5) * 0.08, th, row.y, 0.92 + r() * 0.14, Math.PI + (r() - 0.5) * 0.4);
      mats.push(m);
      let c = pick(r, PALETTE[row.tier]);
      // 近卫军：皇帝包厢两侧的讲台层
      if (row.tier === 'podium' && (k === 19 || k === 21)) c = [0.62, 0.16, 0.14];
      const v = 0.78 + r() * 0.2;
      colors.push(c[0] * v, c[1] * v, c[2] * v);
      phases.push(r());
      zones.push(th / (Math.PI * 2));
    }
  }
  const count = mats.length;
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0.0 }, uFocus: { value: 0 }, uFocusAmt: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aArm; attribute float aSkin; attribute float aHair; attribute float aPhase; attribute float aZone;
        uniform float uTime; uniform float uExcite; uniform float uFocus; uniform float uFocusAmt;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = aPhase;
        // 关注方向附近的观众更激动
        float dz = abs(fract(aZone - uFocus + 0.5) - 0.5);
        float ex = clamp(uExcite + uFocusAmt * (1.0 - smoothstep(0.0, 0.18, dz)), 0.0, 1.0);
        float thr = fract(ph * 7.31);
        float act = smoothstep(thr * 0.85 + 0.05, thr * 0.85 + 0.2, ex);
        float bounce = 0.5 + 0.5 * sin(uTime * (5.0 + ph * 3.0) + ph * 40.0);
        float stand = act * (0.75 + 0.25 * bounce);
        transformed.y += stand * 0.24 * (1.0 - step(transformed.y, -0.1) * 0.6);
        // 举手：绕肩（y=0.68）向前上方旋转
        float raise = aArm * act * (1.9 + 0.7 * bounce) + aArm * 0.15 * sin(uTime * 0.6 + ph * 20.0);
        float side = sign(transformed.x);
        vec3 p = transformed - vec3(0.0, 0.68 + stand * 0.24, 0.0);
        float ca = cos(-raise), sa = sin(-raise);
        p = vec3(p.x + side * aArm * act * 0.05, p.y * ca - p.z * sa, p.y * sa + p.z * ca);
        transformed = mix(transformed, p + vec3(0.0, 0.68 + stand * 0.24, 0.0), aArm);
        // 平时轻微摆动
        transformed.x += sin(uTime * 0.8 + ph * 31.0) * 0.012 * step(0.3, transformed.y);
        transformed.z += sin(uTime * 0.53 + ph * 17.0) * 0.01 * step(0.3, transformed.y);`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec3 skinC = mix(vec3(0.74, 0.54, 0.4), vec3(0.42, 0.28, 0.19), fract(aPhase * 13.7));
        vec3 hairC = mix(vec3(0.09, 0.07, 0.05), vec3(0.3, 0.22, 0.14), fract(aPhase * 5.3));
        vColor.rgb = mix(vColor.rgb, skinC, clamp(aSkin, 0.0, 1.0));
        vColor.rgb = mix(vColor.rgb, hairC, aHair);`);
  };
  const lodGeo = [figureGeometry(false), figureGeometry(true)];
  const meshes = lodGeo.map((g, li) => {
    const mesh = new THREE.InstancedMesh(g, material, count);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, mats[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colors), 3);
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
    g.setAttribute('aZone', new THREE.InstancedBufferAttribute(new Float32Array(zones), 1));
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'crowd:' + (li ? 'lo' : 'hi');
    mesh.visible = li === 0;
    scene.add(mesh);
    return mesh;
  });
  let excite = 0.05, target = 0.05, burst = 0;
  return {
    count,
    meshes,
    uniforms,
    tris: (lodGeo[0].attributes.position.count / 3) * count,
    /** 情绪：level 0..1 持续，cheer(amount) 瞬间爆发 */
    setMood(level) { target = level; },
    cheer(amount = 1, focusTheta = null) {
      burst = Math.max(burst, amount);
      if (focusTheta !== null) { uniforms.uFocus.value = focusTheta / (Math.PI * 2); uniforms.uFocusAmt.value = 0.5; }
    },
    get excite() { return excite + burst; },
    setVisible(v) { meshes.forEach((m) => (m.userData.hidden = !v)); },
    update(t, dt, camera) {
      excite += (target - excite) * Math.min(1, dt * 1.5);
      burst *= Math.exp(-dt * 0.45);
      uniforms.uTime.value = t;
      uniforms.uExcite.value = Math.min(1, excite + burst);
      uniforms.uFocusAmt.value *= Math.exp(-dt * 0.3);
      const far = camera.position.length() > 220;
      meshes[0].visible = !meshes[0].userData.hidden && !far;
      meshes[1].visible = !meshes[1].userData.hidden && far;
    },
  };
}
