// 罗马斗兽场三维复原 — 主程序
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createRenderer, createEnvironment } from './core/env.js';
import { buildWorld } from './model/world.js';
import { VIEWS } from './ui/views.js';

const q = new URLSearchParams(location.search);
const vec = (s) => (s ? s.split(',').map(Number) : null);
const isShot = q.has('shot');

const renderer = createRenderer(document.body, { preserveDrawingBuffer: isShot });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.3, 9000);
const env = createEnvironment(renderer, scene, {});
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !isShot;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.497;
controls.minDistance = 2;
controls.maxDistance = 1800;

let composer = null, gtao = null;
function setupComposer() {
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, w, h);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.8;
  gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 1.6, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
}
let aoOn = q.get('ao') === '1';
if (aoOn) setupComposer();
window.__setAO = (on) => { aoOn = on; if (on && !composer) setupComposer(); };

function setView(cam, tgt) {
  camera.position.set(...cam);
  controls.target.set(...tgt);
  controls.update();
}
const v0 = VIEWS[q.get('view') || 'overview'] || VIEWS.overview;
setView(vec(q.get('cam')) || v0.cam, vec(q.get('tgt')) || v0.tgt);
window.__setView = setView;
window.__scene = scene;

const bar = document.getElementById('bar'), stage = document.getElementById('stage');
let world = null, uiUpdate = null;
buildWorld(scene, { lite: q.has('lite'), onProgress: (s, p) => { stage.textContent = s; bar.style.width = `${(p * 100).toFixed(0)}%`; } })
  .then(async (w) => {
    world = w;
    if (q.has('hypo')) w.arena.setHypogeum(true);
    if (q.get('velum') === '0') w.velarium.setVisible(false);
    if (q.has('furl')) { w.velarium.setTarget(0); for (let i = 0; i < 200; i++) w.velarium.update(0.1); }
    window.__world = w;
    window.__stats = { ...w.stats };
    console.log('world', JSON.stringify(window.__stats));
    document.getElementById('loading').style.opacity = 0;
    setTimeout(() => document.getElementById('loading')?.remove(), 700);
    if (!isShot || q.get('ui') === '1') {
      try {
        const m = await import('./ui/app.js');
        uiUpdate = m.initUI({ scene, camera, controls, renderer, world: w, env, setView });
      } catch (e) { console.error('ui', e); window.__error = String(e.stack || e); }
    } else if (q.get('show')) {
      const { createShow } = await import('./actors/show.js');
      const show = createShow({ scene, world: w });
      show.play(q.get('show'), { skipTo: +(q.get('skip') || 0) });
      uiUpdate = (dt) => show.update(dt);
      window.__show = show;
    }
  })
  .catch((e) => { console.error(e); window.__error = String(e.stack || e); window.__ready = true; });

const clock = new THREE.Clock();
let frames = 0;
const ft = [];
let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  const t = clock.elapsedTime;
  if (controls.enabled) controls.update();
  const dist = camera.position.distanceTo(controls.target);
  env.updateShadowFocus(controls.target, THREE.MathUtils.clamp(dist * 0.9, 45, 260));
  if (world) {
    world.crowd.update(t, dt, camera);
    world.velarium.update(dt);
    world.arena.update(t);
    world.sur.update(t);
  }
  if (uiUpdate) uiUpdate(dt, t);
  if (aoOn && composer) composer.render(); else renderer.render(scene, camera);
  const now = performance.now();
  ft.push(now - lastT); lastT = now;
  if (ft.length > 60) ft.shift();
  window.__fps = 1000 / (ft.reduce((a, b) => a + b, 0) / ft.length);
  window.__drawCalls = renderer.info.render.calls;
  window.__frameTris = renderer.info.render.triangles;
  if (world && ++frames === 8) window.__ready = true;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setSize(innerWidth, innerHeight); gtao.setSize(innerWidth, innerHeight); }
});
