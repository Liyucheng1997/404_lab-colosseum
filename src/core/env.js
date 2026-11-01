// 渲染环境：渲染器、天空、日光、阴影、环境光照
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { setEnvMap } from './materials.js';
import { SUN } from '../config.js';

export function createRenderer(parent = document.body, { preserveDrawingBuffer = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  parent.appendChild(renderer.domElement);
  return renderer;
}

/** 天空 + 太阳 + 半球光 + 环境贴图 */
export function createEnvironment(renderer, scene, { shadowRadius = 140, sun = SUN } = {}) {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.skyGain = { value: 0.5 };
  sky.material.fragmentShader = 'uniform float skyGain;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyGain, 1.0 );');
  u.turbidity.value = 3.2;
  u.rayleigh.value = 1.0;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  const sunDir = new THREE.Vector3();
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.scale.setScalar(1000);
  envScene.add(sky2);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a7a62 }));
  ground.position.y = -1;
  envScene.add(ground);
  let envRT = null;
  function rebuildEnv() {
    for (const k of Object.keys(u)) if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
    setEnvMap(envRT.texture);
  }

  const hemi = new THREE.HemisphereLight(0xd6e4ff, 0x9a8668, 0.6);
  scene.add(hemi);
  const light = new THREE.DirectionalLight(0xfff0d8, 3.2);
  light.castShadow = true;
  light.shadow.mapSize.set(4096, 4096);
  light.shadow.bias = -0.0003;
  light.shadow.normalBias = 0.05;
  const cam = light.shadow.camera;
  cam.near = 1; cam.far = 2400;
  scene.add(light, light.target);
  scene.fog = new THREE.FogExp2(0xcdd3d4, 0.00034);

  let lastTarget = new THREE.Vector3(), lastRadius = shadowRadius;
  function updateShadowFocus(target, radius = shadowRadius) {
    lastTarget.copy(target); lastRadius = radius;
    light.target.position.copy(target);
    light.position.copy(target).addScaledVector(sunDir, 900);
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.updateProjectionMatrix();
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
  }
  function setSun(azimuthDeg, elevationDeg, rebuild = true) {
    const ph = THREE.MathUtils.degToRad(90 - elevationDeg), th = THREE.MathUtils.degToRad(azimuthDeg);
    sunDir.set(Math.sin(th) * Math.sin(ph), Math.cos(ph), -Math.cos(th) * Math.sin(ph));
    u.sunPosition.value.copy(sunDir);
    const low = THREE.MathUtils.clamp(1 - elevationDeg / 35, 0, 1);
    light.color.setRGB(1, 0.94 - 0.22 * low, 0.84 - 0.38 * low);
    light.intensity = 0.7 + 1.8 * Math.min(1, Math.max(0, elevationDeg) / 25);
    hemi.intensity = 0.18 + 0.2 * Math.min(1, Math.max(0, elevationDeg) / 30);
    updateShadowFocus(lastTarget, lastRadius);
    if (rebuild) rebuildEnv();
  }
  setSun(sun.azimuthDeg, sun.elevationDeg);
  return { sky, sun: light, hemi, sunDir, updateShadowFocus, setSun };
}
