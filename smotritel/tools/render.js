#!/usr/bin/env node
/* Покадровый рендер серии через headless Chromium (Playwright).

   node tools/render.js ep01 --stills 3.5,12,40      кадры-превью в build/ep01/stills
   node tools/render.js ep01 --cues                  только выгрузить build/ep01/cues.json (звуковые метки)
   node tools/render.js ep01                         все кадры -> build/ep01/frames/f_000001.jpg …
   node tools/render.js ep01 --range 76-105          перерисовать только кусок (секунды)
   опции: --workers 4  --scale 0.5 (для превью)  --quality 92
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const ep = args.find(a => !a.startsWith('--')) || 'ep01';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const BUILD = path.join(ROOT, 'build', ep);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(srv));
  });
}

async function openPage(browser, port, scale) {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.on('console', m => { if (['warning', 'error'].includes(m.type())) console.log(`[page ${m.type()}]`, m.text()); });
  page.on('pageerror', e => console.log('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/engine/stage.html?ep=${ep}`);
  await page.waitForFunction('window.E && window.E.ready', null, { timeout: 60000 });
  return page;
}

(async () => {
  const srv = await serve(); const port = srv.address().port;
  const timing = JSON.parse(fs.readFileSync(path.join(BUILD, 'timing.json'), 'utf8'));
  const fps = timing.fps || 30;
  const launch = () => chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'] });

  if (opt('stills') || opt('cues')) {
    const browser = await launch();
    const page = await openPage(browser, port, parseFloat(opt('scale', '0.5')));
    fs.writeFileSync(path.join(BUILD, 'cues.json'), JSON.stringify(await page.evaluate('E.cues'), null, 1));
    if (opt('stills')) {
      const dir = path.join(BUILD, 'stills'); fs.mkdirSync(dir, { recursive: true });
      for (const s of String(opt('stills')).split(',')) {
        const t = parseFloat(s);
        await page.evaluate(t => E.seek(t), t);
        const f = path.join(dir, `t_${t.toFixed(2).padStart(7, '0')}.png`);
        await page.locator('#stage').screenshot({ path: f });
        console.log(f);
      }
    }
    await browser.close(); srv.close(); return;
  }

  // полный рендер
  const dir = path.join(BUILD, 'frames'); fs.mkdirSync(dir, { recursive: true });
  let f0 = 0, f1 = Math.ceil(timing.duration * fps);
  if (opt('range')) { const [a, b] = String(opt('range')).split('-').map(Number); f0 = Math.floor(a * fps); f1 = Math.min(f1, Math.ceil(b * fps)); }
  const workers = parseInt(opt('workers', '4'), 10), quality = parseInt(opt('quality', '92'), 10);
  let next = f0, done = 0; const total = f1 - f0, t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async () => {
    const browser = await launch();
    const page = await openPage(browser, port, 1);
    const stage = page.locator('#stage');
    for (;;) {
      const i = next++; if (i >= f1) break;
      await page.evaluate(t => E.seek(t), i / fps);
      await stage.screenshot({ path: path.join(dir, `f_${String(i + 1).padStart(6, '0')}.jpg`), type: 'jpeg', quality });
      if (++done % 150 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${total} кадров  ${(done / el).toFixed(1)} к/с  осталось ~${Math.round((total - done) / (done / el))} c`);
      }
    }
    await browser.close();
  }));
  const browser = await launch(); const page = await openPage(browser, port, 1);
  fs.writeFileSync(path.join(BUILD, 'cues.json'), JSON.stringify(await page.evaluate('E.cues'), null, 1));
  await browser.close();
  console.log(`готово: ${total} кадров за ${((Date.now() - t0) / 1000).toFixed(0)} c`);
  srv.close();
})().catch(e => { console.error(e); process.exit(1); });
