// 合并器：按 材质 + 分块（象限）收集几何，最后合并成少量 Mesh；重复构件走 InstancedMesh
import * as THREE from 'three';
import { merge } from './geom.js';
import { mat } from './materials.js';

export class Batcher {
  constructor(name = 'batch') { this.name = name; this.groups = new Map(); this.inst = new Map(); this.tris = 0; }
  /** 分块：按 θ 象限把大环拆开，便于视锥剔除 */
  add(matKey, geo, chunk = 0) {
    if (!geo) return;
    const k = matKey + '|' + chunk;
    if (!this.groups.has(k)) this.groups.set(k, []);
    this.groups.get(k).push(geo);
  }
  /** 实例：proto = [{mat, geo}]，m = Matrix4 */
  place(protoKey, protoFn, m) {
    if (!this.inst.has(protoKey)) this.inst.set(protoKey, { parts: protoFn(), mats: [] });
    this.inst.get(protoKey).mats.push(m.clone());
  }
  build(parent, { cast = true, receive = true } = {}) {
    const root = new THREE.Group();
    root.name = this.name;
    for (const [k, list] of this.groups) {
      const [mk] = k.split('|');
      // 分批合并，防止单个缓冲过大
      let cur = [], n = 0;
      const flush = () => {
        if (!cur.length) return;
        const g = merge(cur);
        cur = []; n = 0;
        if (!g) return;
        const mesh = new THREE.Mesh(g, mat(mk));
        mesh.name = this.name + ':' + k;
        mesh.castShadow = cast && !['canvas', 'water', 'net', 'dark'].includes(mk);
        mesh.receiveShadow = receive;
        this.tris += g.attributes.position.count / 3;
        root.add(mesh);
      };
      for (const g of list) {
        cur.push(g);
        n += g.attributes.position.count;
        if (n > 1.5e6) flush();
      }
      flush();
    }
    for (const [k, { parts, mats }] of this.inst) {
      for (const p of parts) {
        const im = new THREE.InstancedMesh(p.geo, mat(p.mat), mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = cast; im.receiveShadow = receive;
        im.name = this.name + ':I:' + k;
        im.computeBoundingSphere();
        this.tris += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3 * mats.length;
        root.add(im);
      }
    }
    parent.add(root);
    return root;
  }
}
