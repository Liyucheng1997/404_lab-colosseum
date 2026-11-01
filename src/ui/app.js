// 交互界面：视角、导览漫游、节目单（开场游行/斗兽/午间/角斗/海战）、入座观赛、标签、点击讲解、漫步、小地图、现场音效
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { VIEWS, TOUR } from './views.js';
import { createGuide, entryFor, ENTRIES } from './guide.js';
import { createAudio } from './audio.js';
import { createShow, PROGRAMS, PAIRS } from '../actors/show.js';
import { OUTER, ARENA, BAYS, TOP } from '../config.js';
import { ringP, locate, arcAt, BAY_W, semiA, semiB } from '../core/ellipse.js';
import { TIERS, hasVom, widthFactor } from '../model/cavea.js';
import { LANDMARKS_OUT, terrainHeight } from '../model/surroundings.js';
import { HYPO_DEPTH } from '../model/arena.js';

const $ = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// 入座观赛：各区一个代表座位（θ 取西南方向），视线对准竞技场中心
const SEATS = [
  { name: '皇帝包厢', s: 52.2, y: 5.9, th: Math.PI / 2, guide: '皇帝包厢' },
  { name: '元老席', s: 50.6, y: 5.75, th: 2.35, guide: '讲台层元老席' },
  { name: '骑士席', s: 44.0, y: 10.4, th: 2.2, guide: '第一区骑士席' },
  { name: '平民席', s: 30.5, y: 19.2, th: 2.5, guide: '第二区平民席' },
  { name: '顶层木座', s: 10.5, y: 37.0, th: 2.3, guide: '顶层木座' },
];

export function initUI({ scene, camera, controls, renderer, world, env }) {
  const hud = document.getElementById('hud');
  hud.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = STYLE;
  document.head.appendChild(css);
  const audio = createAudio();
  const guide = createGuide({ hud });
  guide.onPlayState((p) => audio.duck(p));
  const startAudio = () => { audio.start(); };
  addEventListener('pointerdown', startAudio, { capture: true });
  addEventListener('keydown', startAudio, { capture: true });

  // ---------- 节目 ----------
  const banner = $(`<div class="stagebar hidden"><div class="st"><b></b><span></span></div><label><input type="checkbox" class="follow" checked> 跟随镜头</label><button class="stop">停止节目</button></div>`);
  hud.appendChild(banner);
  let followCam = true;
  banner.querySelector('.follow').onchange = (e) => { followCam = e.target.checked; };
  banner.querySelector('.stop').onclick = () => { show.stop(); banner.classList.add('hidden'); };
  let narrateOn = true;
  const show = createShow({
    scene, world, audio,
    onEvent: (ev) => {
      if (ev.type === 'stage') {
        if (!ev.title) return;
        banner.classList.remove('hidden');
        banner.querySelector('b').textContent = ev.title;
        banner.querySelector('span').textContent = ev.sub || '';
      }
      if (ev.type === 'guide' && narrateOn) guide.open(ev.name, { play: true });
      if (ev.type === 'end') { banner.classList.add('hidden'); refreshProgramButtons(); }
    },
  });
  window.__show = show;

  // ---------- 标签 ----------
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(innerWidth, innerHeight);
  labelRenderer.domElement.className = 'labels';
  document.body.appendChild(labelRenderer.domElement);
  const labels = [];
  for (const lm of world.landmarks) {
    const el = $(`<div class="lbl${(lm.rank ?? 1) >= 2 ? ' major' : ''}">${lm.name}</div>`);
    const obj = new CSS2DObject(el);
    obj.position.set(...lm.pos);
    obj.userData = { lm, rank: lm.rank ?? 1, w: lm.name.length * 14 + 16 };
    el.addEventListener('click', (e) => { e.stopPropagation(); focusOn(lm.name, lm.pos); });
    scene.add(obj);
    labels.push(obj);
  }
  let showLabels = true;

  // ---------- 面板 ----------
  const panel = $(`<div class="panel">
    <div class="brand"><b>罗马斗兽场</b><span>AMPHITHEATRVM FLAVIVM · A.D. LXXX</span></div>
    <button class="panel-toggle" aria-expanded="true">收起面板</button>
    <div id="panel-body">
      <div class="sec">寻找讲解</div>
      <input class="search" type="search" placeholder="搜索：拱门、皇帝、鱼网斗士…" autocomplete="off">
      <div class="results"></div>
      <div class="sec">节目单 <span class="hint">公元八十年 · 落成百日庆典</span></div>
      <div class="progs"></div>
      <div class="pairs"></div>
      <div class="sec">入座观赛</div>
      <div class="seats"></div>
      <div class="sec">视角</div>
      <div class="views"></div>
      <div class="sec">漫游</div>
      <div class="row"><button data-act="tour">导览漫游</button><button data-act="walk">漫步模式</button><button data-act="orbit">环绕</button></div>
      <div class="sec">显示</div>
      <label class="chk"><input type="checkbox" data-opt="velum" checked> 遮阳天篷（展开）</label>
      <label class="chk"><input type="checkbox" data-opt="hypo"> 揭开地板看地下室</label>
      <label class="chk"><input type="checkbox" data-opt="crowd" checked> 五万观众</label>
      <label class="chk"><input type="checkbox" data-opt="labels" checked> 名称标签</label>
      <label class="chk"><input type="checkbox" data-opt="narrate" checked> 节目自动讲解</label>
      <label class="chk"><input type="checkbox" data-opt="sound" checked> 现场音效</label>
      <input type="range" min="0" max="100" value="70" data-opt="vol" class="slider" aria-label="音量">
      <label class="chk"><input type="checkbox" data-opt="ao"> 环境光遮蔽（较耗性能）</label>
      <div class="sec">时辰 <span class="val" id="sunv"></span></div>
      <input type="range" min="0" max="100" value="58" data-opt="sun" class="slider">
      <div class="foot">按 1:1 尺寸复原：外轮廓 188 × 156 m，高 48.4 m，80 座拱门<br>${(world.stats.tris / 1e6).toFixed(1)}M 三角面 · ${world.stats.spectators.toLocaleString()} 名观众<br>讲解配音：F5-TTS（人工老龙凤）</div>
    </div>
  </div>`);
  hud.appendChild(panel);
  panel.querySelector('[data-opt=ao]').checked = new URLSearchParams(location.search).get('ao') === '1';
  const vbox = panel.querySelector('.views');
  for (const [k, v] of Object.entries(VIEWS)) {
    const b = $(`<button>${v.name}</button>`);
    b.onclick = () => { stopTour(); stopWalk(); controls.autoRotate = false; if (k === 'hypogeum') setHypo(true); flyTo(v.cam, v.tgt); };
    vbox.appendChild(b);
  }
  const sbox = panel.querySelector('.seats');
  for (const s of SEATS) {
    const b = $(`<button>${s.name}</button>`);
    b.onclick = () => sitAt(s);
    sbox.appendChild(b);
  }
  const pbox = panel.querySelector('.progs'), pairBox = panel.querySelector('.pairs');
  const progBtns = new Map();
  for (const p of PROGRAMS) {
    const b = $(`<button class="prog">${p.name}</button>`);
    b.onclick = () => runProgram(p.key);
    pbox.appendChild(b);
    progBtns.set(p.key, b);
  }
  for (const p of PAIRS) {
    const b = $(`<button class="pair" title="角斗士对决">${p.name}</button>`);
    b.onclick = () => runProgram('munera', { pair: p.key });
    pairBox.appendChild(b);
  }
  function refreshProgramButtons() { for (const [k, b] of progBtns) b.classList.toggle('on', show.running === k); }
  function runProgram(key, opt) {
    stopTour(); stopWalk(); guide.close();
    audio.start();
    if (key !== 'naumachia' && world.arena.hypOpen && key !== 'venatio') { /* 保持用户选择 */ }
    show.play(key, opt);
    refreshProgramButtons();
    // 默认把镜头放到皇帝包厢上方视角
    if (!walk) flyTo([-14, 24, 40], [0, 0, 0], 2.5);
    if (innerWidth <= 640) setPanelCollapsed(true);
  }

  // 搜索讲解条目
  const search = panel.querySelector('.search'), results = panel.querySelector('.results');
  function doSearch() {
    const q = search.value.trim().toLowerCase();
    results.replaceChildren();
    if (!q) return;
    const m = ENTRIES.filter((e) => [e.name, ...(e.aliases || [])].some((s) => s.toLowerCase().includes(q)));
    for (const e of m.slice(0, 12)) {
      const b = document.createElement('button');
      b.textContent = e.name;
      b.onclick = () => { focusOn(e.name); if (innerWidth <= 640) setPanelCollapsed(true); };
      results.appendChild(b);
    }
    if (!m.length) results.appendChild($(`<div class="none">没有找到，试试“拱门”“狮子”</div>`));
  }
  search.addEventListener('input', doSearch);
  search.addEventListener('keydown', (e) => { if (e.isComposing) return; if (e.key === 'Enter') results.querySelector('button')?.click(); if (e.key === 'Escape') { search.value = ''; doSearch(); search.blur(); } });
  const toggle = panel.querySelector('.panel-toggle');
  function setPanelCollapsed(c) { panel.classList.toggle('collapsed', c); toggle.textContent = c ? '展开面板' : '收起面板'; panel.querySelector('#panel-body').hidden = c; }
  toggle.onclick = () => setPanelCollapsed(!panel.classList.contains('collapsed'));
  setPanelCollapsed(innerWidth <= 640);
  const help = $(`<div class="help">左键旋转 · 右键平移 · 滚轮缩放 · 点击建筑或人物听讲解</div>`);
  hud.appendChild(help);

  // ---------- 小地图 ----------
  const mm = document.createElement('canvas');
  mm.className = 'minimap';
  const MW = 200, RANGE = 300;
  mm.width = MW * 2; mm.height = MW * 2; mm.style.width = MW + 'px'; mm.style.height = MW + 'px';
  hud.appendChild(mm);
  const msc = (MW * 2) / (RANGE * 2);
  const P = (x, z) => [(x + RANGE) * msc, (z + RANGE) * msc];
  const base = document.createElement('canvas'); base.width = base.height = MW * 2;
  {
    const g = base.getContext('2d');
    g.fillStyle = '#e6dcc4'; g.fillRect(0, 0, base.width, base.height);
    const ell = (s, fill, stroke) => { g.beginPath(); for (let i = 0; i <= 128; i++) { const p = ringP(s, (i / 128) * Math.PI * 2); const [a, b] = P(p.x, p.z); i ? g.lineTo(a, b) : g.moveTo(a, b); } if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    ell(-38, '#d5ccb4'); ell(0, '#cdb88f', '#8e2b1e'); ell(14.6, '#bfa77a'); ell(53, '#e2c79a', '#8e2b1e');
    g.fillStyle = '#8e2b1e'; g.font = 'bold 20px serif'; g.textAlign = 'center';
    const mark = (x, z, t) => { const [a, b] = P(x, z); g.beginPath(); g.arc(a, b, 6, 0, 7); g.fill(); g.fillText(t, a, b - 12); };
    mark(LANDMARKS_OUT.meta.pos[0], LANDMARKS_OUT.meta.pos[2], '汗水泉');
    mark(LANDMARKS_OUT.colossus.pos[0], LANDMARKS_OUT.colossus.pos[2], '巨像');
    mark(LANDMARKS_OUT.ludus.pos[0], LANDMARKS_OUT.ludus.pos[2], '角斗士学校');
    g.fillStyle = '#5a4630'; g.font = '18px serif';
    g.fillText('北', MW, 22); const [ix, iz] = P(0, 60); g.fillText('皇帝', ix, iz + 22);
  }
  const mmg = mm.getContext('2d');
  mm.onclick = (e) => {
    stopTour(); stopWalk(); controls.autoRotate = false;
    const r = mm.getBoundingClientRect();
    const x = ((e.clientX - r.left) * mm.width) / r.width / msc - RANGE, z = ((e.clientY - r.top) * mm.height) / r.height / msc - RANGE;
    const off = camera.position.clone().sub(controls.target);
    flyTo([x + off.x, Math.max(off.y, 30), z + off.z], [x, 2, z]);
  };

  // ---------- 相机 ----------
  let fly = null;
  function flyTo(cam, tgt, dur = 2.2) {
    stopWalk();
    fly = { t: 0, dur, c0: camera.position.clone(), t0: controls.target.clone(), c1: new THREE.Vector3(...cam), t1: new THREE.Vector3(...tgt) };
  }
  function sitAt(s) {
    stopTour(); stopWalk(); controls.autoRotate = false;
    const p = ringP(s.s, s.th);
    flyTo([p.x, s.y + 1.15, p.z], [0, 1.5, 0], 2.6);
    guide.open(s.guide, { play: false });
  }
  /** 飞往并讲解某个条目 */
  function focusOn(name, pos) {
    stopTour(); controls.autoRotate = false;
    const e = entryFor(name);
    const key = e ? e.name : name;
    const st = TOUR.find((t) => t.guide === key);
    if (st) { if (st.hypogeum) setHypo(true); flyTo(st.cam, st.tgt); }
    else if (pos) { const [x, y, z] = pos; const dir = camera.position.clone().sub(controls.target).setY(0).normalize(); const d = Math.max(40, y * 2); flyTo([x + dir.x * d, y + d * 0.45, z + dir.z * d], [x, y * 0.6, z]); }
    guide.open(key);
  }
  // 导览漫游
  let tourId = 0, touring = false;
  const tourBtn = panel.querySelector('[data-act=tour]');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function startTour() {
    show.stop(); guide.close(); controls.autoRotate = false;
    const id = ++tourId; touring = true; tourBtn.textContent = '停止导览';
    for (const s of TOUR) {
      if (id !== tourId) return;
      setHypo(!!s.hypogeum);
      flyTo(s.cam, s.tgt, s.dur || 5);
      await sleep((s.dur || 5) * 1000);
      if (id !== tourId) return;
      await guide.playName(s.guide);
      if (id !== tourId) return;
      await sleep(1000);
    }
    if (id === tourId) stopTour();
  }
  function stopTour() { tourId++; if (touring) { fly = null; guide.close(); } touring = false; tourBtn.textContent = '导览漫游'; }

  // ---------- 漫步 ----------
  let walk = null;
  const keys = new Set();
  const groundAt = (x, z) => {
    const { s } = locate(x, z);
    if (s > 53) return world.arena.hypOpen && z < 0 ? -HYPO_DEPTH : (world.arena.water.visible ? world.arena.water.position.y : 0);
    if (s > -2.8) return s > 0 ? 0 : s > -1.4 ? -0.25 + 0.25 : -0.25;
    return terrainHeight(x, z);
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { stopWalk(); stopTour(); guide.close(); return; }
    if (e.target instanceof Element && e.target.closest('input, textarea, select, button')) return;
    if (walk && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); if (walk) walk.drag = null; });
  function startWalk() {
    fly = null; stopTour(); controls.autoRotate = false; keys.clear();
    walk = { pos: new THREE.Vector3(-112, 1.2, 8), yaw: Math.PI / 2, pitch: 0.08, drag: null };
    controls.enabled = false;
    help.textContent = 'W/S 前后 · A/D 左右 · 按住左键拖动转向 · Shift 快走 · Esc 退出';
    panel.querySelector('[data-act=walk]').textContent = '退出漫步';
  }
  function stopWalk() {
    if (!walk) return;
    const dir = new THREE.Vector3(Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
    controls.target.copy(walk.pos).addScaledVector(dir, 15);
    controls.enabled = true; walk = null;
    help.textContent = '左键旋转 · 右键平移 · 滚轮缩放 · 点击建筑或人物听讲解';
    panel.querySelector('[data-act=walk]').textContent = '漫步模式';
  }

  // ---------- 点击拾取 ----------
  const proxies = buildProxies(world);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const act = show.pick(ray.ray);
    const hits = ray.intersectObjects(proxies.list.filter((m) => m.userData.active()), false);
    const h = hits[0];
    if (act && (!h || act.dist < h.distance + 0.5) && act.actor.guide) { guide.open(act.actor.guide); return; }
    if (!h) return;
    const name = proxies.classify(h);
    if (name) guide.open(name);
  }
  controls.addEventListener('start', () => { fly = null; if (touring) stopTour(); });
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY, performance.now(), e.button]; if (walk) walk.drag = [e.clientX, e.clientY]; });
  addEventListener('pointerup', (e) => {
    if (walk) walk.drag = null;
    if (!down || e.target !== renderer.domElement) return;
    const [x, y, t, btn] = down; down = null;
    if (btn !== 0 || Math.hypot(e.clientX - x, e.clientY - y) > 5 || performance.now() - t > 400) return;
    pickAt(e.clientX, e.clientY);
  });
  addEventListener('pointermove', (e) => {
    if (!walk || !walk.drag) return;
    walk.yaw += (e.clientX - walk.drag[0]) * 0.004;
    walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - walk.drag[1]) * 0.003, -1.2, 1.2);
    walk.drag = [e.clientX, e.clientY];
  });

  // ---------- 选项 ----------
  const fog = scene.fog;
  function setHypo(on) { world.arena.setHypogeum(on); panel.querySelector('[data-opt=hypo]').checked = on; }
  panel.addEventListener('click', (e) => {
    const act = e.target.dataset?.act;
    if (act === 'tour') (touring ? stopTour() : startTour());
    if (act === 'walk') (walk ? stopWalk() : startWalk());
    if (act === 'orbit') { stopTour(); stopWalk(); fly = null; controls.autoRotate = !controls.autoRotate; controls.autoRotateSpeed = 0.4; }
  });
  panel.addEventListener('input', (e) => {
    const o = e.target.dataset?.opt;
    const v = e.target.checked;
    if (o === 'velum') world.velarium.setTarget(v ? 1 : 0);
    if (o === 'hypo') world.arena.setHypogeum(v);
    if (o === 'crowd') world.crowd.setVisible(v);
    if (o === 'labels') { showLabels = v; labelRenderer.domElement.style.display = v ? '' : 'none'; }
    if (o === 'narrate') narrateOn = v;
    if (o === 'sound') audio.setEnabled(v);
    if (o === 'vol') audio.setVolume(+e.target.value / 100);
    if (o === 'ao') window.__setAO?.(v);
    if (o === 'sun') setSun(+e.target.value / 100);
  });
  const sunv = panel.querySelector('#sunv');
  let sunTimer = null;
  function setSun(t, rebuild = false) {
    const az = 100 + t * 160, el = 6 + Math.sin(Math.PI * t) * 58;
    env.setSun?.(az, el, rebuild);
    clearTimeout(sunTimer); sunTimer = setTimeout(() => env.setSun?.(az, el, true), 250);
    const hh = 6 + t * 13;
    // 罗马计时：日出起算，白昼分十二时辰
    const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    const hora = Math.max(1, Math.min(12, Math.floor((hh - 6) / (13 / 12)) + 1));
    sunv.textContent = `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.round((hh % 1) * 60)).padStart(2, '0')} · 第${CN[hora - 1]}时辰`;
  }
  setSun(0.58, true);

  // ---------- 每帧 ----------
  const v = new THREE.Vector3();
  return function update(dt) {
    show.update(dt);
    audio.setCrowd(Math.min(1, 0.22 + world.crowd.excite * 0.8));
    if (fly) {
      fly.t += dt / fly.dur;
      const k = ease(Math.min(1, fly.t));
      const lift = Math.sin(Math.PI * k) * Math.min(80, fly.c0.distanceTo(fly.c1) * 0.2);
      camera.position.lerpVectors(fly.c0, fly.c1, k).y += lift;
      controls.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.t >= 1) fly = null;
    } else if (show.running && followCam && !walk) {
      // 转播式跟随：机位不动，镜头转向场上焦点
      controls.target.lerp(show.focus, Math.min(1, dt * 1.2));
    }
    if (walk) {
      const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 12 : 4) * dt;
      const f = new THREE.Vector3(Math.sin(walk.yaw), 0, -Math.cos(walk.yaw)), r = new THREE.Vector3(-f.z, 0, f.x);
      if (keys.has('KeyW') || keys.has('ArrowUp')) walk.pos.addScaledVector(f, sp);
      if (keys.has('KeyS') || keys.has('ArrowDown')) walk.pos.addScaledVector(f, -sp);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) walk.pos.addScaledVector(r, -sp);
      if (keys.has('KeyD') || keys.has('ArrowRight')) walk.pos.addScaledVector(r, sp);
      const gy = groundAt(walk.pos.x, walk.pos.z) + 1.7;
      walk.pos.y += (gy - walk.pos.y) * Math.min(1, dt * 6);
      camera.position.copy(walk.pos);
      v.set(walk.pos.x + f.x * Math.cos(walk.pitch), walk.pos.y + Math.sin(walk.pitch), walk.pos.z + f.z * Math.cos(walk.pitch));
      camera.lookAt(v); controls.target.copy(v);
    }
    // 标签显隐与避让
    if (showLabels) {
      const cand = [];
      for (const o of labels) {
        const d = o.position.distanceTo(camera.position), r = o.userData.rank;
        const lim = r >= 2 ? 1600 : r === 1 ? 260 : 150;
        if (d > lim) { o.visible = false; continue; }
        v.copy(o.position).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { o.visible = false; continue; }
        cand.push({ o, d, x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight });
      }
      cand.sort((a, b) => b.o.userData.rank - a.o.userData.rank || a.d - b.d);
      const placed = [];
      for (const c of cand) {
        const w = c.o.userData.w, bb = [c.x - w / 2 - 3, c.y - 26, c.x + w / 2 + 3, c.y + 2];
        if (placed.some((p) => !(bb[2] < p[0] || bb[0] > p[2] || bb[3] < p[1] || bb[1] > p[3]))) { c.o.visible = false; continue; }
        placed.push(bb); c.o.visible = true;
      }
    }
    labelRenderer.render(scene, camera);
    // 小地图
    mmg.drawImage(base, 0, 0);
    const [cx, cz] = P(camera.position.x, camera.position.z), [tx, tz] = P(controls.target.x, controls.target.z);
    mmg.strokeStyle = '#1d4f91'; mmg.lineWidth = 3;
    mmg.beginPath(); mmg.moveTo(cx, cz); mmg.lineTo(tx, tz); mmg.stroke();
    mmg.fillStyle = '#1d4f91'; mmg.beginPath(); mmg.arc(cx, cz, 7, 0, Math.PI * 2); mmg.fill();
    if (show.running) { const [fx, fz] = P(show.focus.x, show.focus.z); mmg.fillStyle = '#c0392b'; mmg.beginPath(); mmg.arc(fx, fz, 5, 0, 7); mmg.fill(); }
  };
}

/** 拾取代理：外墙、看台、竞技场地面、天篷、周边地标；classify(hit) → 讲解条目名 */
function buildProxies(world) {
  const list = [];
  const side = THREE.DoubleSide;
  const m = new THREE.MeshBasicMaterial({ side });
  const add = (geo, kind, active = () => true) => { const o = new THREE.Mesh(geo, m); o.userData = { kind, active }; o.updateMatrixWorld(); list.push(o); return o; };
  // 外墙：椭圆柱面
  add(new THREE.CylinderGeometry(1, 1, TOP, 160, 1, true).scale(OUTER.A, 1, OUTER.B).translate(0, TOP / 2, 0), 'facade');
  // 看台：按截面放样的椭圆锥面
  const prof = [[53, 4], [49.3, 5.2], [48.3, 6.4], [38.2, 12.7], [37.2, 13.9], [25.7, 21.9], [24.6, 23.1], [16, 29.8], [15, 32], [7.2, 38.2], [2, 46.6]];
  const pos = [];
  const N = 160;
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
    const [s0, y0] = prof[i], [s1, y1] = prof[i + 1];
    const p00 = ringP(s0, a0), p01 = ringP(s0, a1), p10 = ringP(s1, a0), p11 = ringP(s1, a1);
    pos.push(p00.x, y0, p00.z, p10.x, y1, p10.z, p11.x, y1, p11.z, p00.x, y0, p00.z, p11.x, y1, p11.z, p01.x, y0, p01.z);
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  add(cg, 'cavea');
  // 护墙面（竞技场一侧）
  add(new THREE.CylinderGeometry(1, 1, 4, 120, 1, true).scale(ARENA.A, 1, ARENA.B).translate(0, 2, 0), 'podiumwall');
  // 竞技场地面 / 水面
  add(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(ARENA.A, 1, ARENA.B).translate(0, 0.05, 0), 'arena');
  add(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(ARENA.A, 1, ARENA.B).translate(0, -HYPO_DEPTH + 0.1, 0), 'hypo', () => world.arena.hypOpen);
  // 天篷
  const vp = [];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
    const o0 = ringP(-0.4, a0), o1 = ringP(-0.4, a1), i0 = ringP(47.5, a0), i1 = ringP(47.5, a1);
    vp.push(o0.x, 56, o0.z, i0.x, 48, i0.z, i1.x, 48, i1.z, o0.x, 56, o0.z, i1.x, 48, i1.z, o1.x, 56, o1.z);
  }
  const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  add(vg, 'velum', () => world.velarium.group.visible && world.velarium.deploy > 0.5);
  // 周边
  const ob = (name, x, z, w, h, d, y0) => add(new THREE.BoxGeometry(w, h, d).translate(x, (y0 ?? terrainHeight(x, z)) + h / 2, z), 'out:' + name);
  ob('尼禄巨像', LANDMARKS_OUT.colossus.pos[0], LANDMARKS_OUT.colossus.pos[2], 16, 46, 14);
  ob('汗水泉', LANDMARKS_OUT.meta.pos[0], LANDMARKS_OUT.meta.pos[2], 17, 18, 17);
  ob('大角斗士学校', LANDMARKS_OUT.ludus.pos[0], LANDMARKS_OUT.ludus.pos[2], 110, 12, 90);
  add(new THREE.RingGeometry(1, 1.25, 96).rotateX(-Math.PI / 2).scale(semiA(-15.5), 1, semiB(-15.5)).translate(0, 0.9, 0), 'cippi');
  const tierAt = (s) => (s > 49.3 ? TIERS[0] : s > 38.2 ? TIERS[1] : s > 25.7 ? TIERS[2] : s > 16 ? TIERS[3] : TIERS[4]);
  function classify(h) {
    const kind = h.object.userData.kind;
    const p = h.point;
    if (kind.startsWith('out:')) return kind.slice(4);
    if (kind === 'cippi') return '广场界石';
    if (kind === 'velum') return '遮阳天篷';
    if (kind === 'hypo') return liftNear(p) ? '升降机' : '地下室';
    if (kind === 'arena') {
      if (world.arena.water.visible) return '海战表演';
      if (world.arena.hypOpen && p.z < 0) return '地下室';
      return liftNear(p) ? '升降机' : '竞技场';
    }
    const { s, th } = locate(p.x, p.z);
    const arc = arcAt(th);
    const k = ((Math.round(arc / BAY_W) % BAYS) + BAYS) % BAYS;
    const lx = Math.abs(k * BAY_W - arc + (k === 0 && arc > BAY_W * 40 ? BAY_W * BAYS : 0));
    if (kind === 'podiumwall') {
      if (k === 0) return '死亡之门'; if (k === 40) return '凯旋之门';
      if (k === 20 && lx < 6) return '皇帝包厢'; if (k === 60 && lx < 6) return '主办官包厢';
      return '讲台层元老席';
    }
    if (kind === 'facade') {
      if (p.y < 10.5) {
        if (k === 0) return '死亡之门'; if (k === 40) return '凯旋之门'; if (k === 20) return '皇帝包厢'; if (k === 60) return '主办官包厢';
        return lx < 2.1 && p.y < 7 ? '环形拱廊' : '编号拱门';
      }
      if (p.y < 33.95) return lx < 1.6 && ((p.y > 12 && p.y < 15) || (p.y > 24 && p.y < 26.8)) ? '拱门雕像' : '四层叠柱式外立面';
      return '外墙顶层';
    }
    if (kind === 'cavea') {
      if ((k === 20 || k === 60) && s > 48 && lx < 7) return k === 20 ? '皇帝包厢' : '主办官包厢';
      const t = tierAt(s);
      if (t.key !== 'podium' && hasVom(t, k) && lx < (2.6 * widthFactor(t.walk[1])) / 2 && s > t.walk[1] - t.run * 4) return '观众出入口';
      if (s < 7.2) return '顶层柱廊';
      return t.name;
    }
    return null;
  }
  function liftNear(p) { return world.arena.lifts.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < 1.6); }
  return { list, classify };
}

addEventListener('resize', () => { const l = document.querySelector('.labels'); if (l) { l.style.width = innerWidth + 'px'; l.style.height = innerHeight + 'px'; } });

const STYLE = `
.labels { position: fixed; inset: 0; pointer-events: none; }
.lbl { padding: 1px 7px; font-size: 12px; color: #fbeccb; background: rgba(110, 30, 20, .8); border: 1px solid rgba(232, 194, 122, .55); border-radius: 3px; white-space: nowrap; pointer-events: auto; cursor: pointer; transform: translateY(-6px); }
.lbl.major { font-size: 14px; font-weight: 600; background: rgba(142, 43, 30, .92); }
.lbl:hover { background: #b8862b; color: #fff; }
.panel { position: fixed; left: 14px; top: 14px; width: 236px; max-height: calc(100dvh - 52px); overflow-y: auto; padding: 12px 12px 10px; background: rgba(248, 241, 226, .92); backdrop-filter: blur(6px); border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.2); font-size: 13px; z-index: 5; }
.brand b { display: block; font-size: 25px; letter-spacing: 6px; color: #8e2b1e; font-family: "STKaiti", "KaiTi", serif; }
.brand span { font-size: 9.5px; letter-spacing: 1.5px; color: #8a7350; font-family: "Times New Roman", serif; }
.panel-toggle { display: block; margin-top: 8px; }
.sec { margin: 11px 0 5px; font-size: 11px; color: #8a7350; letter-spacing: 2px; }
.sec .val, .sec .hint { float: right; letter-spacing: 0; color: #5a4630; }
.sec .hint { font-size: 10px; color: #a08a68; }
.panel button { border: 1px solid #c9a96a; background: #fffaf0; color: #5a2a14; border-radius: 4px; padding: 3px 7px; font-size: 12px; cursor: pointer; margin: 0 2px 3px 0; }
.panel button:hover, .panel button.on { background: #8e2b1e; color: #fbeccb; border-color: #8e2b1e; }
.panel button:focus-visible, .search:focus-visible { outline: 2px solid #8e2b1e; outline-offset: 2px; }
.progs button.prog { min-width: 70px; }
.pairs { margin-top: 2px; display: grid; gap: 3px; }
.pairs button { text-align: left; font-size: 11.5px; margin: 0; }
.search { box-sizing: border-box; width: 100%; min-height: 32px; border: 1px solid #c9a96a; background: #fffaf0; border-radius: 4px; padding: 5px 8px; font: inherit; }
.results { display: flex; flex-wrap: wrap; margin-top: 4px; }
.results .none { font-size: 11px; color: #8a7350; }
.row { display: flex; gap: 2px; }
.chk { display: block; margin: 3px 0; cursor: pointer; }
.slider { width: 100%; accent-color: #8e2b1e; }
.foot { margin-top: 10px; font-size: 10px; color: #8a7350; line-height: 1.6; }
.help { position: fixed; right: 14px; bottom: 12px; font-size: 11px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.7); z-index: 5; }
.minimap { position: fixed; right: 14px; top: 14px; border-radius: 50%; box-shadow: 0 6px 24px rgba(0,0,0,.25); cursor: crosshair; z-index: 5; border: 3px solid rgba(248, 241, 226, .9); }
.stagebar { position: fixed; left: 50%; top: 14px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: rgba(60, 20, 14, .86); color: #f6e3b4; border-radius: 8px; z-index: 6; box-shadow: 0 6px 20px rgba(0,0,0,.3); max-width: calc(100vw - 520px); }
.stagebar.hidden { display: none; }
.stagebar .st b { font-size: 16px; letter-spacing: 3px; margin-right: 10px; font-family: "STKaiti", "KaiTi", serif; }
.stagebar .st span { font-size: 12px; opacity: .85; }
.stagebar label { font-size: 12px; white-space: nowrap; cursor: pointer; }
.stagebar button { border: 1px solid #e8c27a; background: transparent; color: #f6e3b4; border-radius: 4px; padding: 3px 9px; cursor: pointer; white-space: nowrap; }
.stagebar button:hover { background: #e8c27a; color: #3a1a10; }
@media (max-width: 900px) { .stagebar { max-width: calc(100vw - 40px); top: auto; bottom: 14px; flex-wrap: wrap; } }
@media (max-width: 640px) {
  .panel { left: 8px; top: 8px; width: min(236px, calc(100vw - 48px)); max-height: calc(100dvh - 88px); }
  .panel.collapsed { width: 140px; }
  .panel button { min-height: 32px; }
  .minimap { right: 8px; top: 8px; width: 96px !important; height: 96px !important; }
  .help { left: 12px; right: 12px; bottom: 10px; font-size: 10px; text-align: center; }
}
`;
