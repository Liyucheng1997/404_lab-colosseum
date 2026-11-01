// 语音导览：讲解卡（逐句高亮、播放/暂停、拖动进度、自动讲解开关），配音为 F5-TTS（人工老龙凤，与故宫项目同一音色）
// 讲解词：src/data/guide/*.json（[{name, aliases, tier, sub, text}]），配音清单：src/data/guide/audio.json
const files = import.meta.glob('../data/guide/*.json', { eager: true, import: 'default' });
const AUDIO = files['../data/guide/audio.json'] || {};
export const ENTRIES = Object.entries(files).filter(([k]) => !k.endsWith('/audio.json')).flatMap(([, v]) => (Array.isArray(v) ? v : []));
const INDEX = new Map();
for (const e of ENTRIES) { INDEX.set(e.name, e); for (const a of e.aliases || []) if (!INDEX.has(a)) INDEX.set(a, e); }

export function entryFor(name) { return name ? INDEX.get(name) || null : null; }
export function audioUrl(name) {
  const e = entryFor(name);
  const a = e && AUDIO[e.name];
  return a ? `${import.meta.env.BASE_URL}audio/guide/${a.file}` : null;
}
export function audioDur(name) { const e = entryFor(name); return (e && AUDIO[e.name]?.dur) || 0; }

const STYLE = `
.guide { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(640px, calc(100vw - 32px)); max-height: 44vh; display: flex; flex-direction: column;
  background: rgba(248, 241, 226, .96); border-left: 5px solid #8e2b1e; border-radius: 10px; box-shadow: 0 10px 34px rgba(0,0,0,.3); z-index: 6; font-size: 14px; color: #3a2a1a; }
.guide.hidden { display: none; }
.guide .hd { display: flex; align-items: baseline; gap: 10px; padding: 12px 16px 4px; }
.guide .t { font-size: 22px; font-weight: 700; color: #8e2b1e; letter-spacing: 3px; font-family: "STKaiti", "KaiTi", serif; }
.guide .s { font-size: 12px; color: #8a7350; flex: 1; }
.guide .x { border: 0; background: none; font-size: 20px; color: #8a7350; cursor: pointer; padding: 0 2px; }
.guide .d { padding: 2px 16px 10px; line-height: 1.85; overflow-y: auto; text-align: justify; }
.guide .d .cur { background: rgba(200, 155, 60, .32); border-radius: 3px; }
.guide .bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px 12px; border-top: 1px solid rgba(142, 43, 30, .12); }
.guide .play { width: 34px; height: 34px; border-radius: 50%; border: 0; background: #8e2b1e; color: #fbeccb; font-size: 14px; cursor: pointer; flex: none; }
.guide .play:disabled { background: #c9b79a; cursor: default; }
.guide .prog { flex: 1; height: 4px; background: rgba(142, 43, 30, .15); border-radius: 2px; cursor: pointer; position: relative; }
.guide .prog i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: #b8862b; border-radius: 2px; }
.guide .tm { font-size: 11px; color: #8a7350; min-width: 74px; text-align: right; }
.guide label { font-size: 12px; color: #8a7350; cursor: pointer; white-space: nowrap; }
@media (max-width: 640px) {
  .guide { bottom: 40px; max-height: 42dvh; }
  .guide .hd { flex-wrap: wrap; gap: 4px; }
  .guide .t { font-size: 18px; letter-spacing: 2px; }
  .guide .s { font-size: 11px; }
  .guide .bar { gap: 6px; padding: 8px 10px; }
  .guide label { font-size: 11px; }
}`;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 返回 { open(name), close(), playName(name) → Promise（讲完 resolve）, playing, onPlayState(fn) } */
export function createGuide({ hud }) {
  const css = document.createElement('style');
  css.textContent = STYLE;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.className = 'guide hidden';
  el.innerHTML = `<div class="hd"><div class="t"></div><div class="s"></div><button class="x" title="关闭">×</button></div>
    <div class="d"></div>
    <div class="bar"><button class="play" title="播放讲解">▶</button><div class="prog"><i></i></div><div class="tm"></div>
    <label><input type="checkbox" class="auto" checked> 自动讲解</label></div>`;
  hud.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const audio = new Audio();
  audio.preload = 'auto';
  let playbackId = 0, autoPlay = true;
  const listeners = [];
  const emit = () => listeners.forEach((f) => f(!audio.paused && !!audio.getAttribute('src')));
  try { autoPlay = localStorage.getItem('col_guide_auto') !== '0'; } catch (e) { /* 忽略 */ }
  $('.auto').checked = autoPlay;
  $('.auto').onchange = (e) => { autoPlay = e.target.checked; try { localStorage.setItem('col_guide_auto', autoPlay ? '1' : '0'); } catch (err) { /* 忽略 */ } };
  $('.x').onclick = () => close();
  function playAudio() {
    const id = playbackId;
    audio.play().catch(() => { if (id !== playbackId) return; $('.tm').textContent = '点击 ▶ 播放讲解'; finish(); });
  }
  $('.play').onclick = () => { if (!audio.getAttribute('src')) return; if (audio.paused) playAudio(); else audio.pause(); };
  $('.prog').onclick = (e) => {
    if (!audio.getAttribute('src') || !Number.isFinite(audio.duration) || !audio.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
  };
  let sentences = [];
  audio.addEventListener('play', () => { $('.play').textContent = '❚❚'; emit(); });
  audio.addEventListener('pause', () => { $('.play').textContent = '▶'; emit(); });
  audio.addEventListener('timeupdate', () => {
    if (!audio.getAttribute('src')) return;
    const d = audio.duration || 0, t = audio.currentTime;
    $('.prog i').style.width = d ? `${(t / d) * 100}%` : '0';
    $('.tm').textContent = d ? `${fmt(t)} / ${fmt(d)}` : '';
    if (d && sentences.length) {
      const total = sentences.reduce((a, s) => a + s.len, 0);
      let acc = 0, cur = 0;
      const k = (t / d) * total;
      for (let i = 0; i < sentences.length; i++) { acc += sentences[i].len; if (k <= acc) { cur = i; break; } }
      sentences.forEach((s, i) => s.el.classList.toggle('cur', i === cur && !audio.paused));
    }
  });
  let endResolve = null, endTimer = null;
  function finish() {
    clearTimeout(endTimer); endTimer = null;
    sentences.forEach((s) => s.el.classList.remove('cur'));
    if (endResolve) { const r = endResolve; endResolve = null; r(); }
    emit();
  }
  audio.addEventListener('ended', finish);
  audio.addEventListener('error', () => { if (!audio.getAttribute('src') || !audio.error) return; $('.tm').textContent = '音频暂不可用'; finish(); });

  function render(title, sub, text) {
    $('.t').textContent = title;
    $('.s').textContent = sub || '';
    const d = $('.d');
    d.innerHTML = '';
    sentences = [];
    for (const s of (text || '').match(/[^。！？]+[。！？]?/g) || []) {
      const span = document.createElement('span');
      span.textContent = s;
      d.appendChild(span);
      sentences.push({ el: span, len: s.length });
    }
    d.scrollTop = 0;
    el.classList.remove('hidden');
  }
  let current = null;
  function open(name, { play = autoPlay, fallback = '' } = {}) {
    playbackId++;
    const e = entryFor(name);
    audio.pause();
    finish();
    $('.prog i').style.width = '0';
    current = e;
    if (!e) {
      render(name, '', fallback || '（暂无讲解）');
      audio.removeAttribute('src');
      $('.play').disabled = true; $('.tm').textContent = '';
      return null;
    }
    render(e.name, e.sub, e.text);
    const url = audioUrl(e.name);
    $('.play').disabled = !url;
    $('.tm').textContent = url ? '' : '暂无配音';
    if (url) { audio.src = url; if (play) playAudio(); } else audio.removeAttribute('src');
    return e;
  }
  function close() { playbackId++; audio.pause(); el.classList.add('hidden'); current = null; finish(); }
  function playName(name) {
    const e = open(name, { play: true });
    return new Promise((r) => {
      endResolve = r;
      const dur = audioDur(name);
      const readMs = Math.max(3000, ((e?.text || '').length / 5) * 1000);
      endTimer = setTimeout(finish, dur ? dur * 1000 + 15000 : readMs);
    });
  }
  return {
    open, close, playName, entryFor,
    get current() { return current; },
    get playing() { return !audio.paused && !!audio.getAttribute('src'); },
    get visible() { return !el.classList.contains('hidden'); },
    onPlayState(f) { listeners.push(f); },
    el,
  };
}
