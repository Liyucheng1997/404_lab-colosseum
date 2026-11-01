// 无头截图工具（供开发与子代理自检使用）
// 用法：
//   node scripts/shot.mjs --page "catalog.html?t=roof" --out shots/roof.png [--w 1400 --h 900] [--cam x,y,z --tgt x,y,z] [--wait 800]
//   node scripts/shot.mjs --shots shots/plan.json      （JSON 数组：[{page, out, cam?, tgt?, w?, h?}]，同一 page 只加载一次）
// 输出：截图 PNG；控制台错误与统计信息打印到 stdout。
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { opt[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; }

let shots;
if (opt.shots) shots = JSON.parse(fs.readFileSync(path.resolve(ROOT, opt.shots), 'utf8'));
else shots = [{ page: opt.page || 'index.html', out: opt.out || 'shots/shot.png', cam: opt.cam, tgt: opt.tgt, w: opt.w, h: opt.h }];

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5900 + Math.floor(Math.random() * 900), strictPort: false, hmr: false }, clearScreen: false });
await server.listen();
const base = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-driver-bug-workarounds', '--no-sandbox'],
  protocolTimeout: 600000,
});
const timeout = +(opt.timeout || 240000);
let page = null, loaded = null, failed = false;
try {
  for (const s of shots) {
    const w = +(s.w || opt.w || 1400), h = +(s.h || opt.h || 900);
    const pg = s.page || opt.page || 'index.html';
    if (!page || loaded !== pg || s.reload) {
      if (page) await page.close();
      page = await browser.newPage();
      page.on('console', async (m) => { const t = m.type(); if (t === 'error' || t === 'warning' || opt.verbose) { const vals = await Promise.all(m.args().map((a) => a.evaluate((v) => (v instanceof Error ? v.stack : String(v))).catch(() => '?'))); console.log(`[${t}] ${vals.join(' ') || m.text()}`); } });
      page.on('pageerror', (e) => console.log('[pageerror]', e.message));
      await page.setViewport({ width: w, height: h });
      const sep = pg.includes('?') ? '&' : '?';
      let url = base + pg;
      const extra = [];
      if (s.cam) extra.push('cam=' + s.cam);
      if (s.tgt) extra.push('tgt=' + s.tgt);
      extra.push('shot=1');
      url += sep + extra.join('&');
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForFunction('window.__ready === true', { timeout, polling: 200 });
      const err = await page.evaluate(() => window.__error);
      if (err) { console.log('[build error]', err); failed = true; }
      const stats = await page.evaluate(() => window.__stats);
      console.log(`loaded ${pg} in ${Date.now() - t0}ms`, stats ? JSON.stringify(stats) : '');
      const gl = await page.evaluate(() => { try { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch (e) { return 'err'; } });
      if (opt.verbose) console.log('GL:', gl);
      loaded = pg;
    } else if (s.cam && s.tgt) {
      await page.setViewport({ width: w, height: h });
      await page.evaluate((c, t) => window.__setView(c.split(',').map(Number), t.split(',').map(Number)), s.cam, s.tgt);
    }
    await new Promise((r) => setTimeout(r, +(s.wait || opt.wait || 600)));
    // 可选：模拟点击（如 {"click":[x,y]} 或 {"clickText":"中轴漫游"}），点击后再等待
    if (s.click) { await page.mouse.click(s.click[0], s.click[1]); await new Promise((r) => setTimeout(r, +(s.afterClick || 2500))); }
    if (s.clickText) {
      await page.evaluate((t) => { const el = [...document.querySelectorAll('button,.lbl')].find((e) => e.textContent.trim() === t); if (el) el.click(); }, s.clickText);
      await new Promise((r) => setTimeout(r, +(s.afterClick || 2500)));
    }
    if (s.eval || opt.eval) { const res = await page.evaluate(s.eval || opt.eval); console.log('eval:', typeof res === 'string' ? res : JSON.stringify(res)); }
    const out = path.resolve(ROOT, s.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    const perf = await page.evaluate(() => window.__fps ? { fps: +window.__fps.toFixed(1), calls: window.__drawCalls, frameTris: window.__frameTris } : null);
    console.log('saved', path.relative(ROOT, out), perf ? JSON.stringify(perf) : '');
  }
} catch (e) {
  console.log('[shot error]', e.message);
  failed = true;
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
