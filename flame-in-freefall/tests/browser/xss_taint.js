// Taint test: every text value in the data gets an HTML payload. If any page code writes data into the
// DOM without escaping, the payload becomes a real element (and its onerror handler runs).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, webdir] = process.argv.slice(2);
  const PAY = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
  const src = fs.readFileSync(webdir + '/data.js', 'utf8');
  const head = src.slice(0, src.indexOf('window.FLAME = '));
  const data = JSON.parse(src.slice(src.indexOf('window.FLAME = ') + 15).trim().replace(/;$/, ''));
  let tainted = 0;
  const KEEP = new Set(['url', 'doi', 'acc', 'id', 'i', 'k', 'r', 'ps', 'kind', 'pillar', 'family', 'fuel_class', 'role', 'src', 'key', 'material_id', 'outcome', 'based_on', 'go', 'lic']);
  const LISTS = new Set(['record_ids', 'tags', 'next', 'members', 'pillars', 'm']);
  const walk = (o, key) => {
    if (typeof o === 'string') { if (KEEP.has(key) || /^https?:/.test(o) || o.length < 3) return o; tainted++; return o + PAY; }
    if (Array.isArray(o)) return o.map(v => walk(v, key));
    if (o && typeof o === 'object') {
      const out = {};
      for (const k of Object.keys(o)) {
        const idList = LISTS.has(k) || (k === 'sources' && Array.isArray(o[k]) && typeof o[k][0] === 'string');
        out[k] = idList ? o[k] : walk(o[k], k);
      }
      return out;
    }
    return o;
  };
  const evil = head + 'window.FLAME = ' + JSON.stringify(walk(data, '')) + ';\n';
  const b = await chromium.launch();
  const report = [];
  for (const [name, vp] of [['desktop', { width: 1366, height: 860 }], ['phone', { width: 390, height: 800 }]]) {
    const p = await b.newPage({ viewport: vp });
    const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
    await p.route('**/data.js*', r => r.fulfill({ contentType: 'application/javascript', body: evil }));
    await p.route('**/api/ask', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'Server text ' + PAY, mode: 'claude', supported: true, sources: [{ title: 'Title ' + PAY, url: 'https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/' }] }) }));
    const check = async where => {
      const r = await p.evaluate(() => ({ ran: window.__xss || 0, els: document.querySelectorAll('img[src="x"]').length }));
      if (r.ran || r.els) report.push(`${name} · ${where}: payload became HTML (${r.els} elements, handler ran ${r.ran} times)`);
      return r;
    };
    const go = async v => { await p.evaluate(v => { location.hash = v; }, v); await p.waitForTimeout(300); };
    const quiet = pr => pr.catch(() => {});
    await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(700); await check('briefing');
    for (const el of await p.$$('.cabin-panel button')) await quiet(el.click());
    await quiet(p.locator('.cabin-panel details summary').first().click()); await check('briefing cabin panel');
    await go('mission');
    for (const cb of await p.$$('#mc_mats input')) await quiet(cb.check());
    for (const g of ['0', 'moon', 'mars']) await quiet(p.click(`#mc_g button[data-g="${g}"]`));
    for (const a of ['co2', 'n2', 'he']) await quiet(p.selectOption('#mc_agent', a));
    for (let i = 1; i <= 5; i++) await quiet(p.click(`#mcpresets button:nth-of-type(${i})`));
    await check('mission check');
    await go('evidence');
    for (let i = 1; i <= 4; i++) await quiet(p.click(`#atmchips button:nth-of-type(${i})`));
    await p.waitForTimeout(150);
    for (const el of (await p.$$('#chart .bub')).slice(0, 400)) await quiet(el.focus());
    await check('evidence map tooltips');
    await quiet(p.click('#viewbtn')); await check('evidence table view'); await quiet(p.click('#viewbtn'));
    await go('findings');
    for (const d of await p.$$('details.f summary')) await quiet(d.click());
    for (const pl of ['prevention', 'detection', 'suppression', 'all']) await quiet(p.click(`#pillarchips button[data-p="${pl}"]`));
    await check('findings');
    await go('lab');
    for (let i = 1; i <= 4; i++) await quiet(p.click(`#ppresets button:nth-of-type(${i})`));
    await check('lab');
    await go('archive');
    const accs = await p.$$eval('#invtable tr.row', r => r.map(x => x.dataset.acc));
    for (const a of accs) { await quiet(p.click(`#invtable tr.row[data-acc="${a}"] td:nth-child(2)`)); await p.waitForTimeout(25); }
    await check('archive row details');
    for (const a of accs.slice(0, 3)) await quiet(p.check(`#invtable input[data-cmp="${a}"]`));
    await p.waitForTimeout(150); await check('archive compare');
    for (const h of ['station', 'craft', 'orbit', 'moon', 'mars']) await quiet(p.click(`#invhab button[data-v="${h}"]`));
    await quiet(p.fill('#invq', PAY)); await p.waitForTimeout(150); await check('archive search box with payload'); await quiet(p.fill('#invq', ''));
    await go('lessons'); await check('lessons'); await go('method'); await check('method');
    await go('ask');
    await p.fill('#askq', 'What caused the 1997 fire aboard Mir?'); await p.click('#askform button[type=submit]'); await p.waitForTimeout(400); await check('ask: checked answer');
    await quiet(p.click('#ask-more')); await p.waitForTimeout(500); await check('ask: server reply carrying a payload');
    await p.fill('#askq', 'zzz ' + PAY); await p.click('#askform button[type=submit]'); await p.waitForTimeout(500); await check('ask: question carrying a payload');
    await go('brief');
    await quiet(p.click('#cosmo-toggle')); await p.waitForTimeout(300);
    await quiet(p.fill('#cosmo-input', 'How does gravity affect flame shape? ' + PAY)); await p.keyboard.press('Enter'); await p.waitForTimeout(500); await check('cosmo conversation');
    await p.keyboard.press('Escape');
    await quiet(p.click('.cover-tour [data-tour-start]'));
    for (let i = 0; i < 7; i++) { await p.waitForTimeout(250); await quiet(p.click('#tour-next')); }
    await check('tour');
    // address-bar vectors
    for (const h of ['#' + encodeURIComponent(PAY), '#constructor', '#__proto__', '#toString', '#hasOwnProperty']) {
      await p.goto(url + h, { waitUntil: 'load' }); await p.waitForTimeout(350);
      const vis = await p.evaluate(() => [...document.querySelectorAll('.page')].filter(x => !x.hidden).map(x => x.id).join(','));
      if (vis !== 'v-brief') report.push(`${name} · link ${h.slice(0, 22)}: page shows "${vis || 'nothing'}" instead of the briefing`);
      await check('link ' + h.slice(0, 22));
    }
    await p.goto(url + '?cabin=' + encodeURIComponent(PAY) + '#evidence', { waitUntil: 'load' }); await p.waitForTimeout(400); await check('link with ?cabin= payload');
    if (errs.length) report.push(`${name} · script errors while tainted: ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
    await p.close();
  }
  console.log(`tainted ${tainted} text values`);
  console.log(report.length ? report.join('\n') : 'no payload reached the DOM as HTML; all links fell back to the briefing');
  await b.close();
})();
