// 全场景总装：斗兽场本体（外立面 + 看台）、竞技场与地下室、天篷、观众、周边环境；地标与拾取代理
import * as THREE from 'three';
import { Batcher } from '../core/batcher.js';
import { buildFacade } from './facade.js';
import { buildCavea, TIERS } from './cavea.js';
import { buildArena } from './arena.js';
import { buildVelarium } from './velarium.js';
import { buildSurroundings, LANDMARKS_OUT, terrainHeight } from './surroundings.js';
import { buildCrowd } from '../actors/crowd.js';
import { ringP, semiA, semiB } from '../core/ellipse.js';
import { TOP } from '../config.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function buildWorld(scene, { onProgress = () => {}, lite = false } = {}) {
  const stats = {};
  onProgress('外立面：四层柱式与八十座拱门', 0.05); await tick();
  const b = new Batcher('colosseum');
  buildFacade(b);
  onProgress('看台：元老席、骑士席、平民席与顶层木座', 0.3); await tick();
  buildCavea(b);
  b.build(scene);
  stats.structureTris = b.tris;
  onProgress('竞技场与地下室', 0.5); await tick();
  const arena = buildArena(scene);
  onProgress('遮阳天篷与两百四十根桅杆', 0.58); await tick();
  const velarium = buildVelarium(scene);
  onProgress('五万观众入场', 0.66); await tick();
  const crowd = buildCrowd(scene, { density: lite ? 0.45 : 1 });
  stats.spectators = crowd.count;
  onProgress('周边：巨像、汗水泉、角斗士学校与罗马城', 0.8); await tick();
  const sur = buildSurroundings(scene);
  stats.tris = b.tris + sur.tris + crowd.tris;
  onProgress('完成', 1); await tick();

  // ---- 地标（标签） ----
  const landmarks = [
    { name: '凯旋之门', pos: [-semiA(0) - 2, 12, 0] },
    { name: '死亡之门', pos: [semiA(0) + 2, 12, 0] },
    { name: '皇帝包厢', pos: [0, 12.5, 51.5] },
    { name: '主办官包厢', pos: [0, 12, -51.5] },
    { name: '竞技场', pos: [0, 4, 0], rank: 1 },
    { name: '讲台层元老席', pos: [-36, 7, -31], rank: 0 },
    { name: '第一区骑士席', pos: [-42, 12, -36], rank: 0 },
    { name: '第二区平民席', pos: [-55, 22, -45], rank: 0 },
    { name: '顶层木座', pos: [-66, 39, -56], rank: 0 },
    { name: '顶层柱廊', pos: [66, 47, 54], rank: 0 },
    { name: '遮阳天篷', pos: [30, 56, -55], rank: 0 },
    { name: '编号拱门', pos: [ringP(-1, 2.2).x, 9, ringP(-1, 2.2).z], rank: 0 },
    { name: '外墙顶层', pos: [ringP(-1, 1.4).x, 47, ringP(-1, 1.4).z], rank: 0 },
    { name: '罗马斗兽场', pos: [0, TOP + 16, 0], rank: 2 },
  ];
  for (const k of Object.keys(LANDMARKS_OUT)) {
    const l = LANDMARKS_OUT[k];
    const y = terrainHeight(l.pos[0], l.pos[2]);
    landmarks.push({ name: l.name, pos: [l.pos[0], y + (k === 'colossus' ? 42 : k === 'meta' ? 20 : 14), l.pos[2]], rank: 2 });
  }
  landmarks.push({ name: '广场界石', pos: [ringP(-18, 4.4).x, 3, ringP(-18, 4.4).z], rank: 0 });
  return { arena, velarium, crowd, sur, landmarks, stats, TIERS };
}
