/* СМОТРИТЕЛЬ · серия 1 «Наследство» — раскадровка.
   Времена берутся из озвучки: c.T('h2') — начало реплики, c.Wd('h2','долг') — момент слова.
   Все координаты — в кадре 1080×1920. */
(function () {
  'use strict';
  const { ease, clamp } = E;
  const RUB = '&nbsp;₽';

  // маленький маяк-иконка
  const beacon = (lit) => `
    <g>
      ${lit ? '<circle cx="0" cy="-104" r="170" fill="url(#bcGlow)"/>' : ''}
      <polygon points="-40,150 -27,-60 27,-60 40,150" fill="#F7F1E6"/>
      <polygon points="-37.5,110 -35,70 35,70 37.5,110" fill="#D9463B"/><polygon points="-32.5,30 -30,-10 30,-10 32.5,30" fill="#D9463B"/>
      <polygon points="8,-60 27,-60 40,150 12,150" fill="#1b1f2c" opacity=".13"/>
      <path d="M -11 150 v -34 a 11 11 0 0 1 22 0 v 34 z" fill="#1F5560"/>
      <rect x="-40" y="-70" width="80" height="12" rx="4" fill="#2A3342"/>
      <rect x="-22" y="-124" width="44" height="54" fill="${lit ? '#FFF0A6' : '#C4E8F4'}" stroke="#2A3342" stroke-width="5"/>
      <path d="M 0 -124 V -70" stroke="#2A3342" stroke-width="4"/>
      <path d="M -30 -124 Q -26 -160 0 -166 Q 26 -160 30 -124 Z" fill="#B23A30"/><circle cx="0" cy="-170" r="6" fill="#2A3342"/>
      <rect x="-50" y="146" width="100" height="14" rx="4" fill="#8D8478"/>
    </g>`;
  const GLOW = `<radialGradient id="bcGlow"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".9"/><stop offset=".4" stop-color="#FFD866" stop-opacity=".35"/><stop offset="1" stop-color="#FFD866" stop-opacity="0"/></radialGradient>`;
  const heart = `<svg width="34" height="30" viewBox="0 0 34 30"><path d="M17 29 C 3 19 0 12 0 8 A 8 8 0 0 1 17 5 A 8 8 0 0 1 34 8 C 34 12 31 19 17 29 Z" fill="#E5484D"/></svg>`;
  const fmt = v => Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ');

  // =====================================================================
  //  ГЛОБАЛЬНЫЙ СЛОЙ: виньетка, HUD «МАЯК · ДЕНЬ 1», счётчик долга
  // =====================================================================
  E.global(g => {
    g.ui.appendChild(E.h('<div style="position:absolute;inset:0;background:radial-gradient(ellipse 88% 76% at 50% 47%, rgba(0,0,0,0) 52%, rgba(4,6,14,.42) 100%)"></div>'));
    const sc = id => E.timing.scenes.find(s => s.id === id);
    const hud = E.h(`<div class="anc"><div class="hud"><svg width="34" height="60" viewBox="-52 -180 104 345" style="margin-right:-2px">${beacon(false)}</svg><span>МАЯК · ДЕНЬ</span><span class="num">1</span></div></div>`);
    g.ui.appendChild(hud);
    const H = g.nd(hud, { x: 540, y: 196, o: 0 });
    const tOn = g.T('a3') - 0.15, ch = sc('chapter'), sl = sc('sleep'), cho = sc('choice');
    H.set(tOn, { o: 1, y: 60, s: 0.7 }).to(tOn, 0.5, { y: 196, s: 1 }, ease.back)
      .to(ch.start - 0.25, 0.2, { o: 0 }).to(sl.start + 0.25, 0.3, { o: 1 }).to(cho.start - 0.25, 0.2, { o: 0 });
    g.sfx('ding', tOn + 0.05, 0.9);
    const chip = E.h(`<div class="anc"><div class="chip">долг <i>1 800 000${RUB}</i><span class="dot"></span>осталось <b>30 дней</b></div></div>`);
    g.ui.appendChild(chip);
    const C = g.nd(chip, { x: 540, y: 286, o: 0 });
    const tc = g.Wd('n4', 'тридцать');
    C.set(tc, { o: 1, s: 0.5 }).to(tc, 0.4, { s: 1 }, ease.back)
      .to(ch.start - 0.25, 0.2, { o: 0 }).to(sl.start + 0.25, 0.3, { o: 1 }).to(cho.start - 0.25, 0.2, { o: 0 });
  });

  // =====================================================================
  //  0. КРЮЧОК: маяк, долг, 30 дней, свет
  // =====================================================================
  E.scene({
    id: 'hook', build(c) {
      const set = A.set.lighthouse('hk', 'night');
      c.art(set.svg + set.front, set.defs);
      const L = set.bind(c);
      c.music('hook', 0); c.amb('night', 0, c.dur, 0.7);
      c.cam.set(0, { x: 690, y: 650, s: 1.55 }).to(0, c.T('h4'), { x: 660, y: 700, s: 1.38 }, ease.lin)
        .to(c.T('h4'), 1.4, { x: 700, y: 640, s: 1.5 }, ease.io2).to(c.Wd('h4', 'свет'), 3.2, { x: 620, y: 760, s: 1.22 }, ease.out3);
      const out1 = c.T('h4') - 0.12;
      c.label('Тебе достался маяк', { x: 500, y: 330, at: c.T('h1') - 0.1, color: 'amber', rot: -3, size: 56, out: out1 });
      // долг
      const tD = c.Wd('h2', 'долг');
      const debt = c.label(`долг <span id="hkDebt" style="font-size:1.5em;letter-spacing:0">0</span>${RUB}`, { x: 470, y: 1120, at: tD, color: 'red', rot: -2, size: 54, anim: 'stamp', sfx: 'impact', out: out1 });
      c.counter(c.q('#hkDebt'), { from: 0, to: 1800000, t0: c.Wd('h2', 'Миллион'), d: 1.25 });
      c.label('30 дней', { x: 330, y: 1330, at: c.Wd('h3', 'тридцать'), color: 'navy', rot: 3, size: 66, out: out1 });
      c.label('и маяк заберёт банк', { x: 520, y: 1470, at: c.Wd('h3', 'заберёт'), color: 'white', rot: -2, size: 46, out: out1 });
      // свет
      const tL = c.Wd('h4', 'свет') - 0.05;
      c.label('Сегодня ночью', { x: 360, y: 400, at: c.Wd('h4', 'сегодня'), color: 'navy', rot: -3, size: 54 });
      c.sfx('riser', tL - 1.5, 0.9); c.sfx('click', tL, 1);
      L.lampOn(tL, 5.2);
      const fl = E.h('<div style="position:absolute;inset:0;background:#FFF3C0"></div>'); c.ui.appendChild(fl);
      c.nd(fl, { o: 0 }).set(tL, { o: 0.75 }).to(tL, 0.5, { o: 0 }, ease.out2);
      c.label('загорится свет', { x: 420, y: 540, at: tL + 0.05, color: 'amber', rot: 2, size: 60, anim: 'drop' });
      c.label('отключён 15 лет назад', { x: 520, y: 1380, at: c.Wd('h4', 'отключили'), color: 'red', rot: -2, size: 50 });
    },
  });

  // =====================================================================
  //  1. ПРАВИЛА: решают комментарии
  // =====================================================================
  E.scene({
    id: 'rules', enter: 'fade', build(c) {
      A.set.bokeh(c, { seed: 4 });
      c.music('light', 0);
      const ov = c.card('<div class="over" style="font-size:34px">интерактивный сериал</div>', { x: 540, y: 400, at: 0.25, cls: 'plain', anim: 'pop', sfx: false });
      c.label('решаешь ты', { x: 540, y: 550, at: c.Wd('r1', 'решаешь'), color: 'amber', rot: -3, size: 92, anim: 'stamp', sfx: 'ding' });
      // буквы-варианты
      const tV = c.Wd('r2', 'выбор');
      [['А', '#2D6CDF'], ['Б', '#F28C28'], ['В', '#E5484D']].forEach(([l, col], i) => {
        const n = c.card(`<div class="let" style="width:170px;height:170px;border-radius:50%;background:${col};display:grid;place-items:center;color:#fff;font-size:96px;font-weight:900;border:8px solid #fff;box-sizing:border-box">${l}</div>`,
          { x: 300 + i * 240, y: 820, at: tV - 0.25 + i * 0.16, cls: 'plain', anim: 'pop', sfx: 'pop' });
        n.fn((lt, st) => { st.y += Math.sin(lt * 2.4 + i * 1.3) * 7; });
      });
      // комментарии и лайки
      const tC = c.Wd('r2', 'Какой') - 0.15;
      const cm = (y, ava, col, txt, id, at, likes) => {
        const n = c.card(`<div class="comment"><div class="ava" style="background:${col}">${ava}</div><div><div class="src">комментарий</div><div class="txt">${txt}</div></div><div class="likes">${heart}<br><span id="${id}">0</span></div></div>`,
          { x: 540, y, at, anim: y % 2 ? 'left' : 'right' });
        c.counter(c.q('#' + id), { from: 0, to: likes, t0: at + 0.3, d: 1.7, sfx: false });
        return n;
      };
      cm(1080, 'К', '#2D6CDF', 'Б! Тут без вариантов', 'rl1', tC, 2481);
      cm(1250, 'М', '#F28C28', 'А, и не спорьте', 'rl2', tC + 0.3, 964);
      cm(1420, 'Д', '#7B4B7A', 'только В, я серьёзно', 'rl3', tC + 0.6, 312);
      const tW = c.Wd('r2', 'так');
      const win = c.card('<div style="width:848px;height:150px;border:9px solid #FFC83A;border-radius:40px;box-sizing:border-box"></div>', { x: 540, y: 1080, at: tW - 0.1, cls: 'plain', anim: 'pop', sfx: 'ding' });
      c.label('так и будет', { x: 540, y: 1600, at: tW, color: 'green', rot: -2, size: 70, anim: 'stamp', sfx: false });
    },
  });

  // =====================================================================
  //  2. ЗАСТАВКА
  // =====================================================================
  E.scene({
    id: 'title', enter: 'dip', build(c) {
      A.set.bokeh(c, { seed: 8, rays: true, rayY: 700, a: '#070B18', b: '#1D2E63' });
      c.music('title', 0); c.sfx('horn', 0.15, 0.9);
      const ic = E.h(`<div class="anc"><svg width="420" height="560" viewBox="-190 -300 380 500" style="position:absolute;left:-210px;top:-300px;overflow:visible"><defs>${GLOW}</defs>${beacon(true)}</svg></div>`);
      c.ui.appendChild(ic);
      c.nd(ic, { x: 540, y: 640, o: 0, s: 1.1 }).set(0.2, { o: 1, s: 0.5 }).to(0.2, 0.6, { s: 1.1 }, ease.back);
      c.card('<div class="over" style="font-size:32px">интерактивный сериал</div>', { x: 540, y: 960, at: 0.45, cls: 'plain', anim: 'pop', sfx: false });
      const tt = c.card('<div class="title-xl" style="font-size:106px">СМОТРИТЕЛЬ</div>', { x: 540, y: 1070, at: c.T('t1') - 0.05, cls: 'plain', anim: 'none', sfx: 'impact' });
      tt.set(c.T('t1') - 0.05, { s: 1.6 }).to(c.T('t1') - 0.05, 0.42, { s: 1 }, ease.out5);
      const ln = E.h('<div class="anc"><div style="position:absolute;left:-150px;top:0;width:300px;height:10px;border-radius:5px;background:#FFB627"></div></div>'); c.ui.appendChild(ln);
      c.nd(ln, { x: 540, y: 1156, o: 0, sx: 0 }).set(c.Wd('t1', 'Серия') - 0.1, { o: 1 }).to(c.Wd('t1', 'Серия') - 0.1, 0.4, { sx: 1 });
      c.label('серия 1 · «Наследство»', { x: 540, y: 1250, at: c.Wd('t1', 'Серия'), color: 'red', rot: -2, size: 50 });
    },
  });

  // =====================================================================
  //  3. ГОРОД: сокращение, звонок нотариуса
  // =====================================================================
  E.scene({
    id: 'city', enter: 'dip', build(c) {
      const set = A.set.room('ct'), hero = A.person('hero', 'ctHero');
      c.art(set.svg + hero.svg + set.front, set.defs);
      set.bind(c);
      const H = hero.bind(c, { x: 410, y: 1750, s: 1.2, face: 'sad' });
      H.heldR.innerHTML = A.prop.phone(76, -214, 6);
      c.music('light', 0); c.amb('city', 0, c.dur, 0.8);
      c.cam.set(0, { x: 540, y: 960, s: 1.08 }).to(0, c.dur, { s: 1.0 }, ease.lin);
      const o1 = c.T('c3') - 0.55;
      c.label('26 лет', { x: 300, y: 430, at: c.Wd('c1', 'двадцать'), color: 'navy', rot: -3, size: 60, out: c.T('c2') - 0.1 });
      c.label('сократили', { x: 610, y: 600, at: c.Wd('c1', 'сократили'), color: 'red', rot: 3, size: 70, anim: 'stamp', out: c.T('c2') - 0.1 });
      // карта
      const bank = c.card(`<div class="cap">на карте</div><div class="big"><span id="ctBal">41 300</span>${RUB}</div>
        <div class="row" id="ctRent" style="margin-top:14px"><span class="k">аренда</span><span class="v neg">через 7 дней</span></div>`, { x: 540, y: 620, w: 700, at: c.Wd('c2', 'карте') - 0.15, out: o1 });
      c.reveal(c.q('#ctRent'), c.Wd('c2', 'комнату'), { sfx: 'tick' });
      H.face(c.Wd('c2', 'комнату'), 'worry');
      // звонок
      const tR = c.T('c3') - 0.45;
      c.sfx('phone', tR, 1);
      H.face(tR, 'wow'); H.raise('R', tR + 0.15, 0.4, 138); H.look(tR + 0.1, 0.3, 0.7);
      const call = c.card(`<div style="display:flex;flex-direction:column;align-items:center;gap:18px;color:#fff">
          <div style="font-size:26px;font-weight:800;letter-spacing:.12em;color:#8FA0C8">ВХОДЯЩИЙ ВЫЗОВ</div>
          <div style="width:150px;height:150px;border-radius:50%;background:#2B3A63;display:grid;place-items:center;font-size:84px;font-weight:900;color:#8FA0C8">?</div>
          <div style="font-size:50px;font-weight:800">Неизвестный номер</div>
          <div style="font-size:34px;font-weight:700;color:#8FA0C8">+7 (815) ··· ·· ··</div>
          <div style="display:flex;gap:150px;margin-top:10px"><div style="width:104px;height:104px;border-radius:50%;background:#E5484D"></div><div id="ctAcc" style="width:104px;height:104px;border-radius:50%;background:#23A566"></div></div></div>`,
        { x: 540, y: 690, w: 720, at: tR, out: c.T('c4') - 0.12, style: 'background:#111A33;padding:44px 40px;border:6px solid #2B3A63', sfx: false });
      call.fn((lt, st) => { if (lt > tR && lt < c.T('c4') - 0.3) st.r += Math.sin(lt * 46) * 1.6 * (Math.sin(lt * 5.5) > -0.2 ? 1 : 0); });
      c.label('незнакомый номер', { x: 540, y: 1060, at: c.Wd('c3', 'незнакомый'), color: 'navy', rot: -2, size: 46, out: c.T('c4') - 0.12 });
      c.sfx('tick', c.T('c4') - 0.2, 1);
      // нотариус в трубке
      const bb = (txt, a, b) => c.bubble(txt, { x: 560, y: 640, w: 800, at: a, out: b, tail: 'bl', who: 'нотариус · по телефону', whoColor: '#5C7191', size: 46 });
      bb('«Вы внук Захара Ильича?»', c.T('c4'), c.Wd('c4', 'Примите') - 0.1);
      bb('«Примите соболезнования»', c.Wd('c4', 'Примите'), c.Wd('c4', 'Он') - 0.1);
      bb('«Он оставил вам… маяк»', c.Wd('c4', 'Он'), c.T('c5') - 0.15);
      H.look(c.T('c4'), 0.3, 0).face(c.T('c4'), 'neutral').face(c.Wd('c4', 'соболезнования'), 'sad').face(c.Wd('c4', 'маяк') + 0.1, 'wow');
      c.label('маяк?!', { x: 600, y: 900, at: c.Wd('c4', 'маяк') + 0.25, color: 'amber', rot: 4, size: 84, anim: 'stamp', sfx: 'ding', out: c.T('c5') + 0.5 });
      H.raise('R', c.T('c5') - 0.1, 0.5, 0, ease.io2).face(c.T('c5'), 'think');
      c.label('видел деда 2 раза в жизни', { x: 540, y: 520, at: c.Wd('c5', 'видел'), color: 'navy', rot: -2, size: 46 });
      c.label('выбирать не из чего', { x: 540, y: 670, at: c.Wd('c5', 'выбирать'), color: 'red', rot: 2, size: 52 });
      H.face(c.Wd('c5', 'выбирать'), 'tight');
    },
  });

  // =====================================================================
  //  4. ДОРОГА
  // =====================================================================
  E.scene({
    id: 'road', enter: 'pushL', build(c) {
      const set = A.set.road('rd');
      c.art(set.svg, set.defs);
      const R = set.bind(c);
      c.amb('busride', 0, c.dur, 0.9); c.sfx('bus', 0.05, 0.7);
      R.bus.set(0, { x: 380 }).to(0, c.dur, { x: 600 }, ease.lin);
      // маршрут
      const rt = c.card(`<svg width="860" height="250" viewBox="0 0 860 250">
          <path id="rdPath" d="M 90 150 C 250 40, 400 230, 560 120 S 720 70 770 110" fill="none" stroke="#C9CED8" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 24"/>
          <path id="rdDone" d="M 90 150 C 250 40, 400 230, 560 120 S 720 70 770 110" fill="none" stroke="#2D6CDF" stroke-width="10" stroke-linecap="round"/>
          <circle cx="90" cy="150" r="20" fill="#152238"/><circle cx="90" cy="150" r="8" fill="#fff"/>
          <text x="90" y="210" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="26" fill="#6f7687" letter-spacing="2">ГОРОД</text>
          <g transform="translate(770 96) scale(.36)">${beacon(false)}</g>
          <text x="742" y="210" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="26" fill="#152238" letter-spacing="2">СИЗЫЙ МЫС</text>
          <circle id="rdDot" r="17" fill="#FFB627" stroke="#fff" stroke-width="6"/></svg>`, { x: 540, y: 560, at: 0.15, style: 'padding:26px 30px 16px', anim: 'up' });
      const path = c.q('#rdPath'), done = c.q('#rdDone'), dot = c.q('#rdDot'), len = 800;
      c.track(lt => {
        const total = path.getTotalLength(), k = ease.io2(clamp((lt - 0.3) / (c.dur - 0.9)));
        const pt = path.getPointAtLength(total * k);
        dot.setAttribute('cx', pt.x.toFixed(1)); dot.setAttribute('cy', pt.y.toFixed(1));
        done.setAttribute('stroke-dasharray', `${(total * k).toFixed(1)} ${total}`);
      });
      c.label('14 часов', { x: 540, y: 330, at: c.Wd('v1', 'Четырнадцать'), color: 'navy', rot: -3, size: 76 });
      c.label(`билет −3 800${RUB}`, { x: 300, y: 850, at: c.Wd('v1', 'автобусе'), color: 'white', rot: 2, size: 44 });
      c.label('конечная', { x: 750, y: 965, at: c.Wd('v2', 'Конечная'), color: 'red', rot: -3, size: 56 });
      c.label('дальше — только море', { x: 540, y: 1100, at: c.Wd('v2', 'Дальше'), color: 'teal', rot: 2, size: 54 });
    },
  });

  // =====================================================================
  //  5. ПРИЕЗД: вот он
  // =====================================================================
  E.scene({
    id: 'arrival', enter: 'fade', build(c) {
      const set = A.set.lighthouse('ar', 'day'), hero = A.person('hero', 'arHero');
      const ruler = `<g id="arRuler" stroke="#152238" stroke-width="7" stroke-linecap="round" fill="none"><path id="arRl" d="M 610 1195 V 318"/><path d="M 590 1195 H 630 M 590 318 H 630"/></g>`;
      c.art(set.svg + ruler + hero.svg + set.front, set.defs);
      const L = set.bind(c), H = hero.bind(c, { x: -160, y: 1740, s: 1.2, face: 'neutral' });
      c.music('title', 0); c.sfx('gulls', 0.5, 0.8);
      c.amb('sea', 0, E.timing.scenes.find(s => s.id === 'nyura').end - c.start, 0.9);   // море звучит до конца вечера
      c.cam.set(0, { x: 770, y: 560, s: 1.75 }).to(0.15, 2.3, { x: 540, y: 960, s: 1 }, ease.io3).to(c.T('a3'), c.dur - c.T('a3'), { s: 1.05, x: 520, y: 980 }, ease.io2);
      H.walk(0.5, 2.6, -160, 320, { rate: 2.2, ease: ease.out2 });
      H.look(1.2, 0.5, 0.9).face(c.T('a1'), 'wow');
      // линейка
      const rl = c.q('#arRl'), RL = 877; rl.setAttribute('stroke-dasharray', RL); const rg = c.$('#arRuler', { o: 0 });
      const tM = c.Wd('a1', 'Тридцать') - 0.1; rg.set(tM, { o: 1 }).to(c.T('a3') - 0.1, 0.2, { o: 0 });
      c.track(lt => rl.setAttribute('stroke-dashoffset', (RL * (1 - ease.out3(clamp((lt - tM) / 0.7)))).toFixed(1)));
      const o = c.T('a3') - 0.12;
      c.label('32 метра', { x: 360, y: 470, at: c.Wd('a1', 'Тридцать'), color: 'navy', rot: -3, size: 70, out: o });
      c.label('построен в 1958', { x: 330, y: 630, at: c.Wd('a2', 'Построен'), color: 'white', rot: 2, size: 46, out: o });
      c.label('отключён в 2009', { x: 350, y: 770, at: c.Wd('a2', 'Отключён'), color: 'red', rot: -2, size: 48, out: o });
      c.label('теперь — твой', { x: 480, y: 640, at: c.Wd('a3', 'Теперь'), color: 'amber', rot: -3, size: 76, anim: 'stamp', sfx: false });
      H.face(c.T('a3'), 'smile').look(c.T('a3'), 0.4, 0.3);
    },
  });

  // =====================================================================
  //  6. НОТАРИУС: ключи и кредит
  // =====================================================================
  E.scene({
    id: 'notary', build(c) {
      const set = A.set.lighthouse('nt', 'day'), hero = A.person('hero', 'ntHero'), no = A.person('notary', 'ntNo');
      const keys = `<g id="ntKeys">${A.prop.keys(0, 0)}</g>`;
      c.art(set.svg + no.svg + hero.svg + keys + set.front, set.defs);
      set.bind(c);
      const H = hero.bind(c, { x: 300, y: 1750, s: 1.15, face: 'neutral' }), N = no.bind(c, { x: 720, y: 1750, s: 1.12, face: 'neutral' });
      N.heldR.innerHTML = A.prop.folder(84, -150);
      H.look(0, 0, 0.8); N.look(0, 0, -0.8);
      c.cam.set(0, { x: 520, y: 1000, s: 1.06 }).to(0, c.dur, { s: 1.0, x: 540, y: 960 }, ease.lin);
      // ключи летят в руку
      const tK = c.Wd('n1', 'отдаёт');
      N.raise('L', tK - 0.15, 0.3, 70); N.raise('L', tK + 0.6, 0.4, 0, ease.io2);
      H.raise('R', tK + 0.1, 0.35, 62); H.raise('R', c.Wd('n1', 'И'), 0.5, 0, ease.io2);
      const K = c.$('#ntKeys', { x: 498, y: 1440, o: 0, s: 1.1 });
      K.set(tK + 0.1, { o: 1 }).to(tK + 0.25, 0.4, { x: 522, y: 1458 }, ease.io2).to(c.Wd('n1', 'И') - 0.05, 0.25, { o: 0, y: 1540 });
      K.fn((lt, st) => { st.r = Math.sin(lt * 14) * 12; });
      c.sfx('keys', tK + 0.1, 1);
      c.label('ключи от маяка', { x: 400, y: 480, at: c.Wd('n1', 'ключи'), color: 'amber', rot: -3, size: 56, out: c.Wd('n1', 'бумагу') - 0.3 });
      H.face(tK + 0.3, 'smile');
      // договор
      const tP = c.Wd('n1', 'ещё');
      c.sfx('paper', tP, 1);
      const doc = c.card(`<div class="cap" style="display:flex;justify-content:space-between"><span>кредитный договор</span><span style="color:#E5484D">банк</span></div>
        <div class="row" id="ntR1" style="margin-top:10px"><span class="k">заёмщик</span><span class="v">Захар Ильич</span></div>
        <div class="row" id="ntR2"><span class="k">сумма</span><span class="v neg"><span id="ntSum">0</span>${RUB}</span></div>
        <div class="row" id="ntR3"><span class="k">залог</span><span class="v">маяк</span></div>
        <div class="row" id="ntR4"><span class="k">вернуть за</span><span class="v neg">30 дней</span></div>`, { x: 540, y: 690, w: 780, at: tP, rot: -1.5, sfx: false });
      c.reveal(c.q('#ntR1'), c.Wd('n2', 'дед'), { sfx: 'tick' });
      c.reveal(c.q('#ntR2'), c.Wd('n2', 'Миллион') - 0.1, { sfx: 'tick' });
      c.counter(c.q('#ntSum'), { from: 0, to: 1800000, t0: c.Wd('n2', 'Миллион'), d: 1.0 });
      c.reveal(c.q('#ntR3'), c.Wd('n2', 'залог'), { sfx: 'tick' });
      c.reveal(c.q('#ntR4'), c.Wd('n4', 'тридцать') - 0.1, { sfx: 'tick' });
      c.music('tension', c.T('n2') - 0.2);
      H.face(c.T('n2'), 'neutral').face(c.Wd('n2', 'Миллион') + 0.2, 'wow').face(c.T('n3'), 'worry').face(c.Wd('n4', 'маяк'), 'sad');
      c.label('куда ушли деньги?', { x: 540, y: 1040, at: c.Wd('n3', 'Куда'), color: 'navy', rot: -2, size: 58, out: c.T('n4') - 0.1 });
      c.label('иначе маяк — банку', { x: 540, y: 1040, at: c.Wd('n4', 'маяк'), color: 'red', rot: 2, size: 58, anim: 'stamp', sfx: 'impact', gain: 0.7 });
    },
  });

  // =====================================================================
  //  7. ЛЯДОВ: предложение
  // =====================================================================
  E.scene({
    id: 'lyadov', build(c) {
      const set = A.set.lighthouse('ly', 'day'), hero = A.person('hero', 'lyHero'), no = A.person('notary', 'lyNo'), ly = A.person('lyadov', 'lyLy');
      c.art(set.svg + no.svg + A.prop.suv('lyCar') + ly.svg + hero.svg + set.front, set.defs);
      set.bind(c);
      const H = hero.bind(c, { x: 270, y: 1750, s: 1.15, face: 'sad' });
      const N = no.bind(c, { x: 720, y: 1750, s: 1.12 });
      const Y = ly.bind(c, { x: 800, y: 1760, s: 1.16, face: 'grin', o: 0 });
      N.heldR.innerHTML = A.prop.folder(84, -150); N.look(0, 0, 0.8);
      c.cam.set(0, { x: 560, y: 1000, s: 1.04 }).to(0, c.dur, { s: 1.0, x: 540, y: 960 }, ease.lin);
      H.look(0, 0, 0.8);
      // нотариус уходит, джип подъезжает
      N.walk(0.3, 2.5, 720, 1300, { rate: 2.3, ease: ease.in2 });
      const tCar = c.Wd('d1', 'подъезжает') - 0.5;
      const car = c.$('#lyCar', { x: 1600, y: 1800, s: 1.05 });
      car.set(tCar, { x: 1600 }).to(tCar, 1.5, { x: 905 }, ease.out3);
      c.sfx('car', tCar - 0.3, 1, 0.5);
      const whl = [...c.root.querySelectorAll('#lyCar .whl')], carb = c.q('#lyCar .carb');
      c.track(lt => {
        const x = car.val('x', lt); whl.forEach(w => w.setAttribute('transform', `rotate(${((x - 905) / 62 * 57.3).toFixed(1)})`));
        const k = clamp((lt - tCar - 1.35) / 0.5); carb.setAttribute('transform', `rotate(${(k > 0 && k < 1 ? -Math.sin(k * Math.PI) * 1.4 : 0).toFixed(2)})`);
      });
      c.label('белый джип', { x: 600, y: 620, at: c.Wd('d1', 'белый'), color: 'white', rot: -3, size: 56, out: c.T('d2') - 0.1 });
      H.face(tCar + 0.6, 'neutral');
      // выходит Лядов
      const tY = c.T('d2') - 0.25;
      c.sfx('door', tY, 0.9, 0.4);
      Y.root.set(tY, { o: 1 }); Y.walk(tY, tY + 1.2, 800, 610, { rate: 2.0, ease: ease.out2 }); Y.look(tY, 0, -0.8);
      const o2 = c.T('d3') - 0.15;
      c.label('Глеб Лядов', { x: 560, y: 470, at: c.Wd('d2', 'Глеб'), color: 'navy', rot: -2, size: 64, out: o2 });
      c.label('строит на берегу отель', { x: 560, y: 600, at: c.Wd('d2', 'Строит'), color: 'teal', rot: 2, size: 42, out: o2 });
      c.label('как старому другу', { x: 560, y: 740, at: c.Wd('d2', 'как'), color: 'amber', rot: -2, size: 50, out: o2 });
      Y.raise('L', c.Wd('d2', 'Улыбается'), 0.4, 150); Y.raise('L', c.T('d2', 1) + 0.1, 0.4, 0, ease.io2);
      Y.armL.fn((lt, st) => { if (lt > c.Wd('d2', 'Улыбается') + 0.3 && lt < c.T('d2', 1)) st.r += Math.sin(lt * 13) * 10; });
      H.face(c.Wd('d2', 'Улыбается'), 'think');
      // предложение
      const bb = (txt, a, b) => c.bubble(txt, { x: 560, y: 600, w: 820, at: a, out: b, tail: 'bc', who: 'Лядов', whoColor: '#9A6B3F', size: 46 });
      bb('«Соболезную. Давай по-простому»', c.T('d3'), c.Wd('d3', 'Я') - 0.1);
      bb('«Я закрываю твой долг и даю пятьсот тысяч сверху. А&nbsp;маяк — мне»', c.Wd('d3', 'Я'), c.T('d4') - 0.12);
      Y.talk(c.T('d3'), c.T('d3', 1)).face(c.T('d3'), 'sly').face(c.Wd('d3', 'Я'), 'grin');
      Y.raise('L', c.Wd('d3', 'закрываю'), 0.35, 60); Y.raise('L', c.Wd('d3', 'А') - 0.1, 0.3, 0, ease.io2);
      Y.raise('R', c.Wd('d3', 'маяк') - 0.1, 0.35, 150); Y.raise('R', c.T('d4'), 0.4, 0, ease.io2);
      c.label('долг закрыт', { x: 340, y: 930, at: c.Wd('d3', 'долг'), color: 'green', rot: -3, size: 54, out: c.T('d4') - 0.12 });
      c.label(`+500 000${RUB}`, { x: 660, y: 1050, at: c.Wd('d3', 'пятьсот'), color: 'amber', rot: 3, size: 80, anim: 'stamp', sfx: 'cash', out: c.T('d5') - 0.12 });
      H.face(c.Wd('d3', 'пятьсот') + 0.2, 'wow');
      c.label('столько ты зарабатывал за год', { x: 540, y: 620, at: c.Wd('d4', 'Столько'), color: 'navy', rot: -2, size: 44, out: c.T('d5') - 0.12 });
      // срок
      bb('«Думай до утра. В девять привезу договор»', c.T('d5'), c.T('d6') - 0.3);
      Y.talk(c.T('d5'), c.T('d5', 1)).face(c.T('d5'), 'sly');
      c.label('до 9:00', { x: 560, y: 950, at: c.Wd('d5', 'девять'), color: 'red', rot: -3, size: 96, anim: 'stamp', sfx: 'tick', out: c.T('d6') - 0.2 });
      H.face(c.T('d5'), 'worry');
      // уезжает; вопрос
      const tGo = c.T('d6') - 0.25;
      Y.look(tGo, 0.2, 0.8); Y.walk(tGo, tGo + 1.0, 610, 820, { rate: 2.1, ease: ease.in2 }); Y.root.to(tGo + 0.95, 0.1, { o: 0 });
      car.to(tGo + 1.3, 1.7, { x: 1700 }, ease.in3); c.sfx('door', tGo + 1.0, 0.7, 0.4);
      H.face(c.T('d6'), 'think').look(c.Wd('d6', 'Зачем'), 0.5, 0.6);
      c.label('зачем ему маяк?', { x: 500, y: 680, at: c.Wd('d6', 'Зачем'), color: 'amber', rot: -3, size: 66, anim: 'stamp', sfx: 'ding' });
      c.ring({ x: 770, y: 458, r: 120, at: c.Wd('d6', 'ржавый') });
      c.label('не светит с 2009', { x: 420, y: 830, at: c.Wd('d6', 'который'), color: 'navy', rot: 2, size: 46 });
    },
  });

  // =====================================================================
  //  8. БАБА НЮРА
  // =====================================================================
  E.scene({
    id: 'nyura', enter: 'fade', build(c) {
      const set = A.set.lighthouse('ny', 'eve'), hero = A.person('hero', 'nyHero'), ny = A.person('nyura', 'nyNy');
      c.art(set.svg + `<g filter="url(#nytint)">${ny.svg}${hero.svg}</g>` + set.front, set.defs);
      set.bind(c);
      const H = hero.bind(c, { x: 300, y: 1750, s: 1.15, face: 'think' }), N = ny.bind(c, { x: 1300, y: 1755, s: 1.12, face: 'smile' });
      N.front.innerHTML = A.prop.bowl(0, -214);
      N.armL.set(0, { r: -24 }); N.armR.set(0, { r: 24 });
      c.music('light', 0);
      H.look(0, 0, 0.8); N.look(0, 0, -0.8);
      N.walk(0.3, 2.5, 1300, 700, { rate: 1.9, ease: ease.out2 });
      const o = c.Wd('b1', 'И') - 0.1;
      c.label('баба Нюра', { x: 560, y: 470, at: c.Wd('b1', 'баба'), color: 'navy', rot: -2, size: 64, out: o });
      c.label('соседка', { x: 760, y: 590, at: c.Wd('b1', 'баба') + 0.3, color: 'teal', rot: 3, size: 40, out: o });
      c.label('пирожки с треской', { x: 520, y: 730, at: c.Wd('b1', 'пирожки'), color: 'amber', rot: -2, size: 52, out: o });
      H.face(c.Wd('b1', 'пирожки'), 'smile');
      // «говорит тихо» — наезд камеры
      const tQ = c.Wd('b1', 'И');
      c.cam.to(tQ, 1.0, { x: 500, y: 1200, s: 1.28 }, ease.io3);
      N.face(tQ, 'hush'); N.upper.to(tQ, 0.6, { r: -5 }, ease.io2); H.face(tQ + 0.3, 'neutral');
      c.label('тихо:', { x: 540, y: 420, at: c.Wd('b1', 'тихо'), color: 'white', rot: -2, size: 50, out: c.T('b2') - 0.1 });
      const bb = (txt, a, b) => c.bubble(txt, { x: 540, y: 560, w: 800, at: a, out: b, tail: 'br', who: 'баба Нюра', whoColor: '#C4453A', size: 48 });
      bb('«Захар не продал. И ты не продавай»', c.T('b2'), c.Wd('b2', 'Он') - 0.1);
      bb('«Он там что-то прятал»', c.Wd('b2', 'Он'), null);
      N.talk(c.T('b2'), c.T('b2', 1)); N.face(c.T('b2', 1), 'worry');
      c.label('не продавай', { x: 330, y: 735, at: c.Wd('b2', 'продавай'), color: 'red', rot: -3, size: 60 });
      c.label('что-то прятал', { x: 650, y: 845, at: c.Wd('b2', 'прятал'), color: 'navy', rot: 3, size: 64, anim: 'stamp', sfx: 'impact', gain: 0.6 });
      H.face(c.Wd('b2', 'прятал'), 'wow');
    },
  });

  // =====================================================================
  //  9. ВАХТЕННЫЙ ЖУРНАЛ
  // =====================================================================
  E.scene({
    id: 'journal', enter: 'dip', build(c) {
      const ded = A.person('ded', 'jrDed');
      const set = A.set.cabin('jr', 'eve', ded.svg), hero = A.person('hero', 'jrHero');
      c.art(set.svg + `<g filter="url(#jrtint)">${hero.svg}</g>` + set.front, set.defs);
      const Cb = set.bind(c); Cb.clock(() => 22 + 40 / 60);
      const D = ded.bind(c, { x: 0, y: 0, s: 1, face: 'neutral' }); D.breathe = false; D.shadow.b.o = 0;
      const H = hero.bind(c, { x: 330, y: 1760, s: 1.15, face: 'tired' });
      c.music('night', 0); c.amb('room', 0, c.dur, 1);
      c.cam.set(0, { x: 540, y: 960, s: 1.0 }).to(0, c.T('j2'), { x: 600, y: 1040, s: 1.12 }, ease.io2);
      c.label('дом смотрителя', { x: 520, y: 400, at: c.Wd('j1', 'доме'), color: 'navy', rot: -2, size: 56, out: c.T('j2') - 0.25 });
      const tB = c.Wd('j1', 'вахтенный');
      H.look(tB - 0.5, 0.4, 0.9).face(tB, 'neutral');
      c.ring({ x: 716, y: 1160, r: 105, at: tB - 0.1, out: c.T('j2') - 0.25, layer: c.world });
      c.label('вахтенный журнал деда', { x: 620, y: 960, at: tB, color: 'amber', rot: 2, size: 46, out: c.T('j2') - 0.25 });
      // раскрытый журнал
      const tO = c.T('j2') - 0.3;
      const dim = E.h('<div style="position:absolute;inset:0;background:#070a14"></div>'); c.ui.appendChild(dim);
      c.nd(dim, { o: 0 }).to(tO, 0.4, { o: 0.72 });
      c.sfx('paper', tO, 1);
      const ink = 'color:#1F3A7A', old = 'color:#56679A;opacity:.85';
      const book = c.card(`
        <div style="position:relative;width:960px;height:720px;background:#22405E;border-radius:26px;box-shadow:0 30px 70px rgba(0,0,0,.55)">
          <div style="position:absolute;left:18px;top:18px;width:462px;height:684px;background:#F6EED9 repeating-linear-gradient(transparent 0 68px,#C3CEE4 68px 71px);border-radius:14px 0 0 14px;overflow:hidden">
            <div style="height:66px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 22px 8px;font-size:21px;font-weight:800;letter-spacing:.12em;color:#8B7A5A"><span>ВАХТЕННЫЙ ЖУРНАЛ</span><span>стр. 211</span></div>
            <div class="hand" style="padding:0 20px;font-size:55px;line-height:71px;white-space:nowrap">
              <div style="${old}">21.10 · 03:12 — двое.</div>
              <div style="${old}">Шли без огней.</div>
              <div style="${old}">25.10 · 03:12 — опять.</div>
              <div style="${old}">Мироныч видел.</div>
              <div style="${ink}"><span id="jrE1">28.10 · 03:12</span></div>
              <div style="${ink}"><span id="jrE2">Опять пришли.</span></div>
              <div style="${ink};position:relative;display:inline-block"><span id="jrE3">Свет не выключать.</span><div id="jrUl" style="position:absolute;left:0;bottom:8px;height:7px;width:100%;background:#E5484D;border-radius:4px;transform-origin:0 50%"></div></div>
            </div>
          </div>
          <div style="position:absolute;left:480px;top:18px;width:462px;height:684px;background:#EFE6CF repeating-linear-gradient(transparent 0 68px,#CBD4E6 68px 71px);border-radius:0 14px 14px 0"></div>
          <svg style="position:absolute;left:480px;top:18px" width="120" height="684" viewBox="0 0 120 684"><polygon points="0,0 58,0 44,40 70,92 40,150 76,214 46,270 82,338 50,404 74,466 42,530 66,598 48,640 60,684 0,684" fill="#FBF5E4"/><polyline points="58,0 44,40 70,92 40,150 76,214 46,270 82,338 50,404 74,466 42,530 66,598 48,640 60,684" fill="none" stroke="#C9BFA4" stroke-width="3"/></svg>
          <div style="position:absolute;left:474px;top:18px;width:12px;height:684px;background:linear-gradient(90deg,rgba(0,0,0,.22),rgba(0,0,0,0))"></div>
        </div>`, { x: 540, y: 960, at: tO, cls: 'plain', anim: 'up', rot: -1.5, sfx: false });
      c.label('за день до смерти', { x: 540, y: 430, at: c.Wd('j2', 'день'), color: 'red', rot: -2, size: 58, out: c.T('j4') - 0.15 });
      const rev = (id, at) => { const n = c.nd(c.q(id), { o: 0 }); n.set(at, { o: 1 }); c.sfx('type', at, 1); };
      rev('#jrE1', c.Wd('j3', 'Три') - 0.05); rev('#jrE2', c.Wd('j3', 'Опять') - 0.05); rev('#jrE3', c.Wd('j3', 'Свет') - 0.05);
      c.nd(c.q('#jrUl'), { sx: 0 }).to(c.Wd('j3', 'выключать'), 0.5, { sx: 1 }, ease.out3);
      const tT = c.Wd('j4', 'страница');
      c.ring({ x: 592, y: 1000, r: 120, at: tT - 0.1 });
      c.label('страница вырвана', { x: 600, y: 1440, at: c.Wd('j4', 'вырвана'), color: 'red', rot: 2, size: 62, anim: 'stamp', sfx: 'impact', gain: 0.7 });
    },
  });

  // =====================================================================
  //  10. ГЛАВА: НОЧЬ ПЕРВАЯ
  // =====================================================================
  E.scene({
    id: 'chapter', enter: 'dip', build(c) {
      A.set.bokeh(c, { seed: 15, rays: true, rayY: 900, a: '#04060E', b: '#101A3C', glow: '255,170,70', n: 10 });
      c.music('none', 0); c.sfx('impact', 0.45, 1);
      c.card('<div class="over" style="font-size:44px">ночь первая</div>', { x: 540, y: 800, at: 0.35, cls: 'plain', anim: 'pop', sfx: false });
      const t = c.card('<div class="title-xl" style="font-size:210px;letter-spacing:.02em">03:12</div>', { x: 540, y: 980, at: 0.5, cls: 'plain', anim: 'none', sfx: false });
      t.set(0.5, { s: 1.5 }).to(0.5, 0.5, { s: 1 }, ease.out5);
    },
  });

  // =====================================================================
  //  11. СОН: 3:11 → 3:12 → щелчок
  // =====================================================================
  E.scene({
    id: 'sleep', enter: 'dip', build(c) {
      const ded = A.person('ded', 'slDed');
      const set = A.set.cabin('sl', 'night', ded.svg);
      const sleeper = `<g filter="url(#sltint)" id="slHero">
          <rect x="88" y="1318" width="180" height="92" rx="34" fill="#F4F1EA"/>
          <g id="slBl"><path d="M 232 1420 Q 240 1340 330 1338 L 500 1344 Q 548 1350 548 1410 L 548 1470 L 232 1470 Z" fill="#B5533F"/><path d="M 300 1340 V 1470 M 380 1342 V 1470 M 460 1344 V 1470 M 232 1404 H 548" stroke="#8E3F30" stroke-width="6" opacity=".7"/></g>
          <g transform="translate(196 1372) rotate(-14)"><circle r="62" fill="#FFF7EE" stroke="#20232E" stroke-width="4"/>
            <path d="M -62 -8 Q -66 -66 0 -66 Q 62 -66 62 -14 Q 30 -40 -10 -34 Q -44 -30 -62 -8 Z" fill="#3B2A22"/>
            <g id="slEyes"><path d="M -32 2 Q -22 9 -12 2 M 12 2 Q 22 9 32 2" stroke="#20232E" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>
            <g id="slEyesO" opacity="0"><circle cx="-22" cy="0" r="9" fill="#20232E"/><circle cx="22" cy="0" r="9" fill="#20232E"/><circle cx="-19" cy="-3" r="2.6" fill="#fff"/><circle cx="25" cy="-3" r="2.6" fill="#fff"/><path d="M -34 -20 h 24 M 10 -20 h 24" stroke="#20232E" stroke-width="5" stroke-linecap="round"/></g>
            <ellipse id="slM" cx="0" cy="28" rx="6" ry="5" fill="#20232E"/></g></g>`;
      c.art(set.svg + sleeper + set.front, set.defs);
      const Cb = set.bind(c); const D = ded.bind(c, { x: 0, y: 0, s: 1 }); D.breathe = false; D.shadow.b.o = 0;
      const t12 = c.Wd('m3', 'Три'), tCl = c.Wd('m4', 'Щелчок');
      Cb.clock(lt => 3 + (lt < t12 ? 11 : 12) / 60);
      c.music('night', 0); c.amb('room', 0, tCl, 1); c.amb('lamp', tCl, c.dur, 0.9);
      c.cam.set(0, { x: 420, y: 1160, s: 1.25 }).to(0, tCl, { x: 500, y: 1080, s: 1.12 }, ease.lin).to(tCl, 0.5, { x: 540, y: 960, s: 1.0 }, ease.out3);
      // сопение
      const bl = c.$('#slBl', {}, { px: 390, py: 1470 }); bl.fn((lt, st) => { if (lt < tCl) st.sy *= 1 + 0.035 * Math.sin(lt * 1.9); });
      ['z', 'z', 'Z'].forEach((ch, i) => {
        const z = E.h(`<div class="anc"><div style="position:absolute;transform:translate(-50%,-50%);font-family:Unbounded;font-weight:900;font-size:${38 + i * 14}px;color:#C9D6FF">${ch}</div></div>`); c.ui.appendChild(z);
        const n = c.nd(z, { x: 0, y: 0, o: 0 });
        n.fn((lt, st) => { const k = ((lt * 0.5 + i * 0.33) % 1); st.x = 330 + k * 120 + i * 10; st.y = 1150 - k * 190; st.o = lt < tCl - 0.05 ? Math.sin(k * Math.PI) * 0.85 : 0; st.r = Math.sin(lt * 2 + i) * 10; });
      });
      // часы
      const clk = c.card('<div style="font-family:Unbounded;font-weight:900;font-size:128px;color:#FFB627;letter-spacing:.02em" id="slClk">03:11</div>', { x: 690, y: 1010, at: c.Wd('m2', 'Три') - 0.1, style: 'background:#0C1226;border:7px solid #fff;padding:22px 44px 26px;border-radius:36px', anim: 'pop', sfx: 'tick' });
      c.swap(c.q('#slClk'), [[0, '03:11'], [t12, '03:12']]);
      clk.to(t12, 0.09, { s: 1.22 }, ease.out2).to(t12 + 0.09, 0.3, { s: 1 }, ease.back).to(tCl + 1.3, 0.2, { o: 0, s: 0.9 });
      c.sfx('tick', t12, 1.4); c.sfx('heartbeat', t12 + 0.25, 0.8);
      // щелчок и свет
      c.sfx('click', tCl, 1.2);
      c.label('щелчок', { x: 330, y: 560, at: tCl, color: 'white', rot: -3, size: 76, anim: 'stamp', sfx: false });
      const eC = c.$('#slEyes'), eO = c.$('#slEyesO', { o: 0 });
      eC.set(tCl + 0.18, { o: 0 }); eO.set(tCl + 0.18, { o: 1 });
      const m = c.q('#slM'); c.track(lt => { m.setAttribute('ry', lt > tCl + 0.18 ? 9 : 5); m.setAttribute('rx', lt > tCl + 0.18 ? 8 : 6); });
      Cb.sweep(c.Wd('m4', 'по') - 0.1, 3.4);
      c.label('по стене ползёт свет', { x: 560, y: 720, at: c.Wd('m4', 'ползёт'), color: 'amber', rot: 2, size: 54 });
    },
  });

  // =====================================================================
  //  12. НОЧЬ: маяк горит, с моря отвечают, дверь открыта
  // =====================================================================
  E.scene({
    id: 'night', enter: 'flash', build(c) {
      const set = A.set.lighthouse('ni', 'night'), hero = A.person('hero', 'niHero');
      c.art(set.svg + `<g filter="url(#nitint)">${hero.svg}</g>` + set.front, set.defs);
      const L = set.bind(c), H = hero.bind(c, { x: 372, y: 1240, s: 0.42, face: 'wow' });
      c.music('hook', 0); c.amb('night', 0, c.dur, 0.9); c.amb('lamp', 0, c.dur, 0.7);
      L.lampOn(-3, 5.2);
      // выбегает
      H.walk(0.25, 1.95, 372, 350, { rate: 3.6, ease: ease.lin });
      H.root.to(0.25, 1.7, { y: 1750, s: 1.15 }, ease.in2);
      H.look(1.9, 0.3, 0.9);
      c.cam.set(0, { x: 540, y: 960, s: 1.0 });
      const o1 = c.T('x3') - 0.15;
      c.label('маяк горит', { x: 420, y: 470, at: c.Wd('x1', 'Маяк'), color: 'amber', rot: -3, size: 72, anim: 'stamp', sfx: 'impact', gain: 0.7, out: o1 });
      c.label('15 лет', { x: 290, y: 650, at: c.Wd('x2', 'пятнадцать'), color: 'navy', rot: 3, size: 66, out: o1 });
      c.label('как отключён от сети', { x: 400, y: 790, at: c.Wd('x2', 'отключён'), color: 'red', rot: -2, size: 46, out: o1 });
      // море отвечает
      const tS = c.T('x3') - 0.1;
      c.cam.to(tS, 1.0, { x: 560, y: 1010, s: 1.6 }, ease.io3);
      H.look(tS, 0.4, -0.9);
      const o2 = c.T('x4') - 0.2;
      c.label('с моря отвечают', { x: 540, y: 480, at: c.Wd('x3', 'моря'), color: 'blue', rot: -2, size: 60, out: o2 });
      const f1 = c.Wd('x3', 'Три'), f2 = c.Wd('x3', 'Ещё');
      L.flashes([f1, f1 + 0.3, f1 + 0.6, f2, f2 + 0.3, f2 + 0.6]);
      c.label('три вспышки', { x: 330, y: 640, at: c.Wd('x3', 'вспышки'), color: 'amber', rot: 3, size: 54, out: o2 });
      c.label('пауза', { x: 560, y: 740, at: c.Wd('x3', 'Пауза'), color: 'navy', rot: -3, size: 44, out: o2 });
      c.label('ещё три', { x: 780, y: 640, at: c.Wd('x3', 'Ещё'), color: 'amber', rot: -2, size: 54, out: o2 });
      // дверь
      const tD = c.T('x4') - 0.15;
      c.cam.to(tD, 1.0, { x: 770, y: 1080, s: 1.75 }, ease.io3);
      c.label('дверь в башню', { x: 540, y: 480, at: c.Wd('x4', 'дверь'), color: 'navy', rot: -2, size: 66 });
      c.ring({ x: 540, y: 1078, r: 150, at: c.Wd('x4', 'башню') + 0.25 });
      c.label('вечером закрыл на ключ', { x: 540, y: 640, at: c.Wd('x4', 'закрыл'), color: 'white', rot: 2, size: 46 });
      const tOp = c.Wd('x4', 'Сейчас');
      L.doorOpen(tOp + 0.1); c.sfx('swell', tOp - 0.4, 0.9);
      c.label('открыта', { x: 560, y: 1330, at: c.Wd('x4', 'открыта'), color: 'red', rot: -3, size: 100, anim: 'stamp', sfx: 'impact' });
      c.sfx('heartbeat', c.T('x4', 1) + 0.1, 1); c.sfx('heartbeat', c.T('x4', 1) + 0.75, 1);
    },
  });

  // =====================================================================
  //  13. ТВОЙ ХОД
  // =====================================================================
  E.scene({
    id: 'choice', enter: 'dip', build(c) {
      A.set.bokeh(c, { seed: 23, a: '#070B1A', b: '#1A2858' });
      c.music('choice', 0);
      c.card('<div class="over" style="font-size:36px">что делаем?</div>', { x: 540, y: 262, at: 0.3, cls: 'plain', anim: 'pop', sfx: false });
      const tt = c.card('<div class="title-xl" style="font-size:128px">ТВОЙ ХОД</div>', { x: 540, y: 390, at: c.T('q1'), cls: 'plain', anim: 'none', sfx: 'impact' });
      tt.set(c.T('q1'), { s: 1.6 }).to(c.T('q1'), 0.4, { s: 1 }, ease.out5);
      const opt = (i, l, col, t1, t2, at, tl) => {
        const n = c.card(`<div class="opt"><div class="let" style="background:${col}">${l}</div><div><div class="tt">${t1}</div><div class="sub">${t2}</div></div></div>`,
          { x: 540, y: 640 + i * 232, at, anim: 'right', sfx: 'whoosh' });
        n.to(tl, 0.1, { s: 1.07 }, ease.out2).to(tl + 0.1, 0.35, { s: 1 }, ease.back);
        c.sfx('ding', tl, 0.7);
        return n;
      };
      opt(0, 'А', '#2D6CDF', 'Подняться в башню', 'узнать, кто включил свет', c.T('q2') - 0.15, c.Wd('q2', 'А'));
      opt(1, 'Б', '#F28C28', 'Спуститься к воде', 'узнать, кто отвечает с моря', c.T('q3') - 0.15, c.Wd('q3', 'Бэ'));
      opt(2, 'В', '#E5484D', 'Запереться до утра', 'а в 9:00 взять деньги и уехать', c.T('q4') - 0.15, c.Wd('q4', 'Вэ'));
      const tW = c.Wd('q5', 'Пиши');
      const w = c.label('пиши букву в комментариях', { x: 540, y: 1312, at: tW, color: 'red', rot: -2, size: 43, anim: 'stamp', sfx: 'ding' });
      w.fn((lt, st) => { if (lt > tW + 0.4) st.s *= 1 + 0.03 * Math.sin((lt - tW) * 5.5); });
      const tI = c.Wd('q6', 'если') - 0.1;
      c.card(`<div style="display:flex;align-items:center;gap:26px;color:#fff">
          <svg width="76" height="96" viewBox="0 0 76 96" style="flex:none"><path d="M38 4 C 18 4 6 18 6 36 C 6 50 16 56 20 68 L 56 68 C 60 56 70 50 70 36 C 70 18 58 4 38 4 Z" fill="#FFB627"/><rect x="22" y="72" width="32" height="8" rx="4" fill="#C9CED8"/><rect x="25" y="83" width="26" height="8" rx="4" fill="#C9CED8"/></svg>
          <div><div style="font-size:38px;font-weight:800;line-height:1.16">Знаешь, как маяку заработать первые деньги?</div><div style="font-size:30px;font-weight:700;color:#FFB627;margin-top:6px">пиши — лучшую идею возьму в серию 2</div></div></div>`,
        { x: 540, y: 1470, w: 940, at: tI, style: 'background:rgba(16,24,48,.92);border:5px solid #33426E;padding:26px 32px', anim: 'up' });
    },
  });

  // =====================================================================
  //  14. ФИНАЛЬНАЯ ПЛАШКА
  // =====================================================================
  E.scene({
    id: 'end', enter: 'fade', build(c) {
      const set = A.set.lighthouse('en', 'night');
      c.art(set.svg + set.front, set.defs);
      const L = set.bind(c); L.lampOn(-2, 5.2);
      c.cam.set(0, { x: 600, y: 800, s: 1.25 }).to(0, c.dur, { s: 1.15 }, ease.lin);
      const dim = E.h('<div style="position:absolute;inset:0;background:rgba(5,8,18,.66)"></div>'); c.ui.appendChild(dim);
      c.music('title', 0);
      c.card('<div style="font-size:36px;font-weight:700;color:#C9D2EA;white-space:nowrap">что будет дальше — решаете вы</div>', { x: 540, y: 700, at: 0.2, cls: 'plain', anim: 'pop', sfx: false });
      const tt = c.card('<div class="title-xl" style="font-size:104px">СМОТРИТЕЛЬ</div>', { x: 540, y: 830, at: 0.35, cls: 'plain', anim: 'none', sfx: 'horn' });
      tt.set(0.35, { s: 1.3 }).to(0.35, 0.5, { s: 1 }, ease.out5);
      const ln = E.h('<div class="anc"><div style="position:absolute;left:-150px;top:0;width:300px;height:10px;border-radius:5px;background:#FFB627"></div></div>'); c.ui.appendChild(ln);
      c.nd(ln, { x: 540, y: 916, o: 0, sx: 0 }).set(0.6, { o: 1 }).to(0.6, 0.4, { sx: 1 });
      c.label('маяк · день 1', { x: 540, y: 1030, at: 0.9, color: 'navy', rot: -2, size: 54 });
      c.label(`долг 1 800 000${RUB} · 30 дней`, { x: 540, y: 1150, at: 1.2, color: 'red', rot: 2, size: 44 });
      c.card('<div class="over" style="font-size:32px">сезон 1 · серия 1</div>', { x: 540, y: 1270, at: 1.5, cls: 'plain', anim: 'pop', sfx: false });
    },
  });
})();
