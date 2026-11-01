// 现场音效（WebAudio 程序合成，无外部音频）：人群底噪与欢呼、号角、水力风琴、兵器撞击、猛兽吼叫、大象长鸣、水声
export function createAudio() {
  let ctx = null, master = null, duckG = null, enabled = true, volume = 0.7, started = false;
  let crowdBed = null, crowdLevel = 0.25, organ = null, waterNode = null;
  const noiseBuf = () => {
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
        d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
      }
    }
    return b;
  };
  let NB = null;
  function noise(loop = true) { const s = ctx.createBufferSource(); s.buffer = NB; s.loop = loop; s.loopStart = Math.random() * 3; return s; }

  function start() {
    if (started) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    started = true;
    NB = noiseBuf();
    master = ctx.createGain(); master.gain.value = enabled ? volume : 0;
    duckG = ctx.createGain(); duckG.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    duckG.connect(master); master.connect(comp); comp.connect(ctx.destination);
    // 人群底噪：两段带通噪声 + 随机起伏
    const src = noise();
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 0.7;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1400; f2.Q.value = 1.2;
    const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.18;
    const bedG = ctx.createGain(); bedG.gain.value = 0;
    src.connect(f1); src.connect(f2); f1.connect(g1); f2.connect(g2); g1.connect(bedG); g2.connect(bedG); bedG.connect(duckG);
    src.start();
    crowdBed = bedG;
    const wobble = () => {
      if (!ctx) return;
      const lv = crowdLevel * (0.75 + Math.random() * 0.5);
      bedG.gain.setTargetAtTime(lv * 0.9, ctx.currentTime, 0.35);
      setTimeout(wobble, 250 + Math.random() * 400);
    };
    wobble();
  }
  const now = () => ctx.currentTime;
  const out = () => duckG;
  function env(g, t0, a, peak, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }

  /** 欢呼：带通噪声“人声”共振峰 + 起伏 */
  function cheer(amount = 1, dur = 3.2) {
    if (!ctx || !enabled) return;
    const t = now();
    for (const [f, q, k] of [[700, 1.4, 1], [1250, 1.8, 0.7], [2500, 2.5, 0.35]]) {
      const s = noise(false), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f * (0.9 + Math.random() * 0.2); bp.Q.value = q;
      bp.frequency.linearRampToValueAtTime(f * 1.15, t + dur * 0.4);
      env(g, t, 0.25, 0.9 * amount * k, dur);
      s.connect(bp); bp.connect(g); g.connect(out());
      s.start(t); s.stop(t + dur + 0.6);
    }
  }
  function gasp() { if (!ctx || !enabled) return; const t = now(); const s = noise(false), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.frequency.exponentialRampToValueAtTime(400, t + 1.2); bp.Q.value = 1.2; env(g, t, 0.08, 0.8, 1.2); s.connect(bp); bp.connect(g); g.connect(out()); s.start(t); s.stop(t + 1.5); }
  /** 号角齐鸣：长直号 + 弯号 */
  function fanfare() {
    if (!ctx || !enabled) return;
    const notes = [[196, 0, 0.5], [262, 0.5, 0.4], [330, 0.9, 0.4], [392, 1.3, 1.2], [330, 2.6, 0.35], [392, 2.95, 1.6]];
    const t0 = now() + 0.05;
    for (const [f, s, d] of notes) for (const det of [0, 3, -4]) {
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      vib.frequency.value = 5.5; vg.gain.value = 3; vib.connect(vg); vg.connect(o.frequency);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t0 + s); lp.frequency.linearRampToValueAtTime(2200, t0 + s + 0.08); lp.frequency.linearRampToValueAtTime(1400, t0 + s + d);
      g.gain.setValueAtTime(0, t0 + s); g.gain.linearRampToValueAtTime(0.09, t0 + s + 0.05); g.gain.setValueAtTime(0.08, t0 + s + d - 0.05); g.gain.linearRampToValueAtTime(0, t0 + s + d + 0.1);
      o.connect(lp); lp.connect(g); g.connect(out());
      o.start(t0 + s); vib.start(t0 + s); o.stop(t0 + s + d + 0.2); vib.stop(t0 + s + d + 0.2);
    }
  }
  /** 水力风琴：循环的和弦旋律，比赛中持续演奏 */
  function setOrgan(on, tempo = 1) {
    if (!ctx) return;
    if (!on) { if (organ) { organ.g.gain.setTargetAtTime(0, now(), 0.4); clearInterval(organ.timer); const o = organ; setTimeout(() => o.oscs.forEach((x) => x.stop()), 1500); organ = null; } return; }
    if (organ) { organ.tempo = tempo; return; }
    const g = ctx.createGain(); g.gain.value = 0; g.connect(out());
    g.gain.setTargetAtTime(enabled ? 0.05 : 0, now(), 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(g);
    const voices = [0, 1, 2, 3].map(() => { const o = ctx.createOscillator(); o.type = 'square'; const vg = ctx.createGain(); vg.gain.value = 0.25; o.connect(vg); vg.connect(lp); o.start(); return o; });
    const prog = [[147, 220, 294, 370], [165, 247, 330, 392], [131, 196, 262, 330], [147, 220, 294, 440], [196, 247, 294, 392], [175, 220, 262, 349]];
    let i = 0;
    organ = { g, oscs: voices, tempo };
    const stepF = () => { const ch = prog[i++ % prog.length]; voices.forEach((o, k) => o.frequency.setTargetAtTime(ch[k] * (k === 3 && i % 2 ? 1.122 : 1), now(), 0.02)); };
    stepF();
    organ.timer = setInterval(stepF, 900 / tempo);
  }
  /** 兵器撞击 */
  function clash(power = 1) {
    if (!ctx || !enabled) return;
    const t = now();
    const s = noise(false), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 1800; env(g, t, 0.003, 0.5 * power, 0.12);
    s.connect(hp); hp.connect(g); g.connect(out()); s.start(t); s.stop(t + 0.3);
    for (const f of [2100, 3370, 5230]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = f * (0.95 + Math.random() * 0.1); env(og, t, 0.002, 0.06 * power, 0.45);
      o.connect(og); og.connect(out()); o.start(t); o.stop(t + 0.5);
    }
  }
  /** 木盾/肉体闷击 */
  function thud() { if (!ctx || !enabled) return; const t = now(); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.15); env(g, t, 0.005, 0.4, 0.2); o.connect(g); g.connect(out()); o.start(t); o.stop(t + 0.3); }
  /** 猛兽吼叫：kind = lion | bear | bull */
  function roar(kind = 'lion') {
    if (!ctx || !enabled) return;
    const t = now(), d = kind === 'bull' ? 1.1 : 1.6;
    const base = kind === 'bear' ? 70 : kind === 'bull' ? 110 : 95;
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(base * 1.3, t); o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.3); o.frequency.exponentialRampToValueAtTime(base * 0.7, t + d);
    lp.type = 'lowpass'; lp.frequency.value = kind === 'bull' ? 900 : 700; lp.Q.value = 3;
    env(g, t, 0.15, 0.35, d);
    const s = noise(false), bp = ctx.createBiquadFilter(), ng = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8; env(ng, t, 0.1, 0.3, d);
    o.connect(lp); lp.connect(g); g.connect(out()); s.connect(bp); bp.connect(ng); ng.connect(out());
    o.start(t); o.stop(t + d + 0.2); s.start(t); s.stop(t + d + 0.2);
  }
  function trumpet() {
    if (!ctx || !enabled) return;
    const t = now();
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(720, t + 0.25); o.frequency.linearRampToValueAtTime(560, t + 1.4);
    vib.frequency.value = 18; vg.gain.value = 25; vib.connect(vg); vg.connect(o.frequency);
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
    env(g, t, 0.06, 0.35, 1.4);
    o.connect(bp); bp.connect(g); g.connect(out()); o.start(t); vib.start(t); o.stop(t + 1.6); vib.stop(t + 1.6);
  }
  function splash() { if (!ctx || !enabled) return; const t = now(); const s = noise(false), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 1400; env(g, t, 0.02, 0.6, 1.4); s.connect(lp); lp.connect(g); g.connect(out()); s.start(t); s.stop(t + 1.6); }
  function setWater(on) {
    if (!ctx) return;
    if (on && !waterNode) { const s = noise(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 650; g.gain.value = 0; s.connect(lp); lp.connect(g); g.connect(out()); s.start(); g.gain.setTargetAtTime(0.25, now(), 1); waterNode = { s, g }; }
    if (!on && waterNode) { waterNode.g.gain.setTargetAtTime(0, now(), 0.6); const w = waterNode; setTimeout(() => w.s.stop(), 2500); waterNode = null; }
  }
  function creak() { if (!ctx || !enabled) return; const t = now(); const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(48, t + 2.5); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 6; env(g, t, 0.2, 0.08, 2.5); o.connect(bp); bp.connect(g); g.connect(out()); o.start(t); o.stop(t + 3); }

  return {
    start, cheer, gasp, fanfare, setOrgan, clash, thud, roar, trumpet, splash, setWater, creak,
    get started() { return started; },
    setCrowd(level) { crowdLevel = level; },
    setEnabled(on) { enabled = on; if (master) master.gain.setTargetAtTime(on ? volume : 0, now(), 0.2); if (!on) setOrgan(false); },
    setVolume(v) { volume = v; if (master && enabled) master.gain.setTargetAtTime(v, now(), 0.1); },
    duck(on) { if (duckG) duckG.gain.setTargetAtTime(on ? 0.32 : 1, now(), 0.3); },
    get enabled() { return enabled; },
  };
}
