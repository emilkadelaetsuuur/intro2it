/* Декорации. Каждая функция возвращает { svg, defs, bind(ctx) }:
   svg — разметка фона, bind — оживляет его (облака, волны, чайки, свет). */
(function () {
  'use strict';
  const S = (A.set = {});
  const { rng, clamp, ease } = E;
  const cloud = (x, y, s, o) => `<g class="cloud" transform="translate(${x} ${y}) scale(${s})" opacity="${o || 0.95}" fill="#fff"><ellipse cx="0" cy="0" rx="96" ry="30"/><ellipse cx="-44" cy="-20" rx="44" ry="30"/><ellipse cx="14" cy="-34" rx="58" ry="42"/><ellipse cx="66" cy="-12" rx="40" ry="26"/></g>`;
  /** фильтр-тонировка (умножение цвета) для ночи/вечера */
  A.tint = (id, r, g, b) => `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0"/></filter>`;

  // =====================================================================
  //  МАЯК НА МЫСЕ — главная декорация сериала
  // =====================================================================
  const PAL = {
    day: { sky: ['#5DB9F0', '#A9DDF7', '#E4F6FD'], sea: ['#2491B5', '#58C2D2'], tint: null, cloud: 0.95 },
    eve: { sky: ['#4B5FA8', '#E98A6A', '#FFD79A'], sea: ['#34588F', '#E79C74'], tint: [0.96, 0.78, 0.66], cloud: 0.75 },
    night: { sky: ['#070C22', '#131F4A', '#26377A'], sea: ['#0B1434', '#1A2A63'], tint: [0.3, 0.36, 0.62], cloud: 0.16 },
  };
  S.lighthouse = function (p, mode) {
    const M = PAL[mode || 'day'], cx = 770, r = rng(7);
    const top = 530, bot = 1195, hw = y => 74 + (108 - 74) * (y - top) / (bot - top);
    let bands = '';
    for (let i = 0; i < 6; i++) {
      const y0 = top + (bot - top) * i / 6, y1 = top + (bot - top) * (i + 1) / 6;
      bands += `<polygon points="${cx - hw(y0)},${y0} ${cx + hw(y0)},${y0} ${cx + hw(y1)},${y1 + 0.5} ${cx - hw(y1)},${y1 + 0.5}" fill="${i % 2 ? '#F7F1E6' : '#D9463B'}"/>`;
    }
    let posts = ''; for (let x = cx - 100; x <= cx + 100; x += 25) posts += `M ${x} 464 V 512 `;
    let tufts = '', flowers = '';
    for (let i = 0; i < 70; i++) {
      const x = r() * 1080, y = 1240 + r() * 660, s = 0.7 + r() * 0.9;
      const onPath = x > 300 + (y - 1240) * -0.02 && x < 840 && y > 1300 && Math.abs(x - (560 + (1920 - y) * 0.2)) < 250 - (1920 - y) * 0.22;
      if (onPath) continue;
      tufts += `<path d="M ${x} ${y} l ${-7 * s} ${-18 * s} M ${x} ${y} l 0 ${-24 * s} M ${x} ${y} l ${8 * s} ${-17 * s}" />`;
      if (i % 5 === 0) flowers += `<circle cx="${x + 16}" cy="${y - 10}" r="${5 * s}" fill="${i % 2 ? '#FFE27A' : '#fff'}"/>`;
    }
    let stars = '';
    if (mode === 'night') for (let i = 0; i < 70; i++) stars += `<circle cx="${r() * 1080}" cy="${r() * 820}" r="${1.2 + r() * 2.2}" fill="#fff" opacity="${0.35 + r() * 0.6}"/>`;
    let waves = '';
    for (let i = 0; i < 16; i++) { const y = 990 + r() * 150, x = r() * 620, w = 30 + r() * 60; waves += `<path class="wv" data-i="${i}" d="M ${x} ${y} h ${w}" />`; }
    const defs = `
      <linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M.sky[0]}"/><stop offset=".62" stop-color="${M.sky[1]}"/><stop offset="1" stop-color="${M.sky[2]}"/></linearGradient>
      <linearGradient id="${p}sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M.sea[1]}"/><stop offset="1" stop-color="${M.sea[0]}"/></linearGradient>
      <linearGradient id="${p}gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A5C76B"/><stop offset=".45" stop-color="#86B258"/><stop offset="1" stop-color="#5F9147"/></linearGradient>
      <linearGradient id="${p}pth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EBDCB4"/><stop offset="1" stop-color="#D9C493"/></linearGradient>
      <radialGradient id="${p}glow"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".95"/><stop offset=".35" stop-color="#FFD866" stop-opacity=".45"/><stop offset="1" stop-color="#FFD866" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}sun"><stop offset="0" stop-color="#FFF7CF" stop-opacity="1"/><stop offset=".4" stop-color="#FFE9A0" stop-opacity=".5"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/></radialGradient>
      <linearGradient id="${p}beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF1A8" stop-opacity=".85"/><stop offset=".5" stop-color="#FFE27A" stop-opacity=".28"/><stop offset="1" stop-color="#FFE27A" stop-opacity="0"/></linearGradient>
      <linearGradient id="${p}fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1020" stop-opacity="0"/><stop offset="1" stop-color="#0b1020" stop-opacity=".34"/></linearGradient>
      ${M.tint ? A.tint(p + 'tint', ...M.tint) : ''}`;
    const sunmoon = mode === 'day'
      ? `<circle cx="215" cy="330" r="190" fill="url(#${p}sun)"/><circle cx="215" cy="330" r="62" fill="#FFF6C9"/>`
      : mode === 'eve'
        ? `<circle cx="250" cy="905" r="300" fill="url(#${p}sun)"/><circle cx="250" cy="905" r="88" fill="#FFE9A8"/>`
        : `<circle cx="230" cy="400" r="150" fill="url(#${p}sun)" opacity=".5"/><circle cx="230" cy="400" r="46" fill="#EEF2FF"/><circle cx="246" cy="388" r="40" fill="${M.sky[1]}"/>`;
    const lit = mode !== 'day';
    const svg = `
<g id="${p}set">
  <rect width="1080" height="1010" fill="url(#${p}sky)"/>
  ${stars}${sunmoon}
  <g id="${p}clouds">${cloud(120, 250, 1.25, M.cloud)}${cloud(620, 185, 0.9, M.cloud * 0.9)}${cloud(930, 420, 1.1, M.cloud * 0.85)}${cloud(380, 560, 0.8, M.cloud * 0.7)}</g>
  <path d="M 560 968 Q 700 905 860 928 Q 980 900 1080 915 L 1080 975 L 560 975 Z" fill="${mode === 'night' ? '#16224F' : mode === 'eve' ? '#6D5C8E' : '#7FB4CC'}"/>
  <rect y="965" width="1080" height="260" fill="url(#${p}sea)"/>
  <g id="${p}waves" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="${mode === 'night' ? 0.18 : 0.55}">${waves}</g>
  <g id="${p}boat" transform="translate(585 1004)" opacity="0"><circle r="70" fill="url(#${p}glow)"/><circle r="9" fill="#FFF6C4"/></g>
  <g ${M.tint ? `filter="url(#${p}tint)"` : ''}>
    <path d="M 0 1158 C 150 1128, 250 1092, 420 1080 S 820 1052, 1080 1040 L 1080 1920 L 0 1920 Z" fill="url(#${p}gr)"/>
    <path d="M 0 1158 C 150 1128, 250 1092, 420 1080 S 820 1052, 1080 1040 L 1080 1066 C 800 1078, 560 1094, 420 1106 S 150 1150, 0 1184 Z" fill="#C2DB8A" opacity=".55"/>
    <path d="M 290 1920 C 430 1640, 650 1420, 728 1196 L 812 1196 C 800 1420, 800 1660, 850 1920 Z" fill="url(#${p}pth)"/>
    <path d="M 676 1366 C 610 1318, 490 1262, 418 1216 L 372 1218 C 440 1300, 556 1402, 640 1452 Z" fill="url(#${p}pth)"/>
    <g stroke="#4F8140" stroke-width="5" stroke-linecap="round" fill="none" opacity=".8">${tufts}</g>${flowers}
    <!-- дом смотрителя -->
    <g id="${p}house">
      <rect x="378" y="900" width="44" height="80" fill="#B5533F"/><rect x="372" y="892" width="56" height="14" rx="4" fill="#8E3F30"/>
      <rect x="96" y="1004" width="374" height="210" fill="#F6EDD8"/>
      <rect x="360" y="1004" width="110" height="210" fill="#E6D9BD"/>
      <rect x="96" y="1196" width="374" height="20" fill="#A99C86"/>
      <polygon points="66,1014 283,884 500,1014" fill="#2E5A66"/><polygon points="283,884 500,1014 470,1014 283,902" fill="#244952"/>
      <rect x="66" y="1006" width="434" height="14" rx="5" fill="#244952"/>
      <rect x="132" y="1058" width="136" height="110" rx="6" fill="#fff"/>
      <rect id="${p}win" x="142" y="1068" width="116" height="90" fill="${lit ? '#FFD66B' : '#9FD5EA'}"/>
      <path d="M 200 1068 V 1158 M 142 1113 H 258" stroke="#fff" stroke-width="8"/>
      <rect x="108" y="1058" width="22" height="110" rx="4" fill="#2E7C86"/><rect x="270" y="1058" width="22" height="110" rx="4" fill="#2E7C86"/>
      <rect x="122" y="1168" width="156" height="12" rx="4" fill="#D8CBB0"/>
      <rect x="328" y="1078" width="92" height="138" rx="6" fill="#7A3A2E"/><rect x="336" y="1086" width="76" height="130" rx="4" fill="#9B4A3A"/>
      <rect x="352" y="1100" width="44" height="40" rx="4" fill="${lit ? '#FFD66B' : '#C9E4EE'}"/><circle cx="402" cy="1158" r="6" fill="#E8C15A"/>
      <rect x="316" y="1212" width="116" height="14" rx="4" fill="#C9BCA2"/>
      <g transform="translate(283 962)"><circle r="27" fill="#fff"/><circle r="27" fill="none" stroke="#D9463B" stroke-width="13" stroke-dasharray="21.2 21.2"/><circle r="13" fill="#F6EDD8"/></g>
    </g>
    <!-- башня -->
    <g id="${p}tower">
      <rect x="${cx - 124}" y="1186" width="248" height="26" rx="5" fill="#8D8478"/>
      ${bands}
      <polygon points="${cx + 22},${top} ${cx + 74},${top} ${cx + 108},${bot} ${cx + 30},${bot}" fill="#1b1f2c" opacity=".13"/>
      <polygon points="${cx - 74},${top} ${cx - 56},${top} ${cx - 82},${bot} ${cx - 108},${bot}" fill="#fff" opacity=".16"/>
      <g fill="#24364F"><path d="M ${cx - 14} 726 v -30 a 14 14 0 0 1 28 0 v 30 z"/><path d="M ${cx - 15} 948 v -32 a 15 15 0 0 1 30 0 v 32 z"/></g>
      <path d="M ${cx - 46} 1195 v -86 a 46 46 0 0 1 92 0 v 86 z" fill="#DCD4C4"/>
      <path d="M ${cx - 36} 1195 v -84 a 36 36 0 0 1 72 0 v 84 z" fill="#0B0F1A"/>
      <g id="${p}door"><path d="M ${cx - 36} 1195 v -84 a 36 36 0 0 1 72 0 v 84 z" fill="#1F5560"/><circle cx="${cx}" cy="1112" r="11" fill="#9FD5EA"/><circle cx="${cx + 22}" cy="1150" r="5" fill="#E8C15A"/><path d="M ${cx - 36} 1160 h 72" stroke="#17434c" stroke-width="5"/></g>
      <polygon points="${cx - 92},532 ${cx - 74},532 ${cx - 74},560" fill="#2A3342"/><polygon points="${cx + 92},532 ${cx + 74},532 ${cx + 74},560" fill="#2A3342"/>
      <rect x="${cx - 106}" y="510" width="212" height="24" rx="5" fill="#2A3342"/>
      <path d="${posts} M ${cx - 104} 464 H ${cx + 104}" stroke="#2A3342" stroke-width="5" stroke-linecap="round" fill="none"/>
      <rect x="${cx - 60}" y="404" width="120" height="108" fill="${mode === 'night' ? '#7C8FB0' : '#C4E8F4'}"/>
      <circle id="${p}lampoff" cx="${cx}" cy="458" r="24" fill="#8F9AA6"/>
      <path d="M ${cx - 30} 404 V 512 M ${cx} 404 V 512 M ${cx + 30} 404 V 512" stroke="#2A3342" stroke-width="5"/>
      <rect x="${cx - 60}" y="404" width="120" height="108" fill="none" stroke="#2A3342" stroke-width="7"/>
      <path d="M ${cx - 76} 404 Q ${cx - 70} 340 ${cx} 326 Q ${cx + 70} 340 ${cx + 76} 404 Z" fill="#B23A30"/>
      <path d="M ${cx + 10} 328 Q ${cx + 66} 344 ${cx + 76} 404 L ${cx + 40} 404 Q ${cx + 36} 350 ${cx + 10} 328 Z" fill="#8E2C25"/>
      <rect x="${cx - 82}" y="396" width="164" height="14" rx="5" fill="#7E261F"/>
      <path d="M ${cx} 312 V 276" stroke="#2A3342" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="318" r="10" fill="#2A3342"/>
    </g>
    <!-- указатель -->
    <g transform="translate(948 1318)"><rect x="-6" y="-8" width="12" height="120" rx="4" fill="#7A5A3C"/><g transform="rotate(-3)"><rect x="-96" y="-62" width="192" height="62" rx="8" fill="#F1E3C2"/><rect x="-96" y="-62" width="192" height="62" rx="8" fill="none" stroke="#7A5A3C" stroke-width="5"/><text x="0" y="-36" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="24" fill="#5A4026" letter-spacing="1.5">СИЗЫЙ МЫС</text><text x="0" y="-12" text-anchor="middle" font-family="Montserrat" font-weight="700" font-size="17" fill="#8A6B48" letter-spacing="2">МАЯК · 1958</text></g></g>
  </g>
  <!-- свет (поверх тонировки) -->
  <g id="${p}lights">
    ${lit ? `<circle cx="200" cy="1113" r="150" fill="url(#${p}glow)" opacity=".5"/><rect x="142" y="1068" width="116" height="90" fill="#FFE08A"/><path d="M 200 1068 V 1158 M 142 1113 H 258" stroke="#8a5a20" stroke-width="7" opacity=".7"/><rect x="352" y="1100" width="44" height="40" rx="4" fill="#FFE08A"/>` : ''}
    <g id="${p}lamp" opacity="0">
      <g id="${p}beamg" transform="translate(${cx} 458)"><polygon id="${p}beamR" points="0,-16 1300,-250 1300,250 0,16" fill="url(#${p}beam)"/></g>
      <circle cx="${cx}" cy="458" r="330" fill="url(#${p}glow)" opacity=".8"/>
      <circle id="${p}flare" cx="${cx}" cy="458" r="560" fill="url(#${p}glow)" opacity="0"/>
      <rect x="${cx - 56}" y="408" width="112" height="100" fill="#FFF0A6" opacity=".9"/>
      <circle cx="${cx}" cy="458" r="27" fill="#FFFBE0"/>
      <path d="M ${cx - 30} 404 V 512 M ${cx} 404 V 512 M ${cx + 30} 404 V 512" stroke="#5a4a20" stroke-width="5" opacity=".65"/>
    </g>
  </g>
  <g id="${p}gulls" fill="none" stroke="${mode === 'night' ? '#8FA0D0' : '#3A4458'}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="${mode === 'night' ? 0 : 0.9}">
    <g class="gull"><path class="wing" d="M -22 0 Q -11 -15 0 0 Q 11 -15 22 0"/></g><g class="gull"><path class="wing" d="M -22 0 Q -11 -15 0 0 Q 11 -15 22 0"/></g><g class="gull"><path class="wing" d="M -22 0 Q -11 -15 0 0 Q 11 -15 22 0"/></g>
  </g>
</g>`;
    const front = `<rect x="0" y="1500" width="1080" height="420" fill="url(#${p}fog)" pointer-events="none"/>`;

    function bind(c) {
      const L = { p, cx, lampY: 458 };
      const clouds = [...c.q(`#${p}clouds`).children];
      clouds.forEach((el, i) => {
        const m = /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/.exec(el.getAttribute('transform'));
        const x0 = +m[1], y0 = +m[2], s = +m[3];
        c.track(lt => { const x = ((x0 + (lt + c.start * 0.3) * (7 + i * 3) + 200) % 1480) - 200; el.setAttribute('transform', `translate(${x.toFixed(1)} ${y0}) scale(${s})`); });
      });
      const wv = [...c.root.querySelectorAll(`#${p}waves .wv`)];
      c.track(lt => wv.forEach((el, i) => el.setAttribute('transform', `translate(${(Math.sin(lt * 0.7 + i * 1.7) * 22).toFixed(1)} ${(Math.sin(lt * 1.1 + i) * 3).toFixed(1)})`)));
      const gulls = [...c.root.querySelectorAll(`#${p}gulls .gull`)];
      c.track(lt => gulls.forEach((el, i) => {
        const tt = lt + c.start + i * 3.7, x = ((tt * (46 + i * 14) + i * 420) % 1400) - 160, y = 300 + i * 150 + Math.sin(tt * 0.8 + i) * 40;
        const flap = 0.55 + 0.45 * Math.sin(tt * (7 + i));
        el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${0.9 + i * 0.25} ${((0.9 + i * 0.25) * flap).toFixed(3)})`);
      }));
      L.lamp = c.$(`#${p}lamp`, { o: 0 });
      L.door = c.$(`#${p}door`, {}, { px: cx - 36, py: 1150 });
      L.boat = c.$(`#${p}boat`, { x: 585, y: 1004, o: 0 });
      const beam = c.q(`#${p}beamg`), flare = c.q(`#${p}flare`);
      /** включить лампу в момент t (луч вращается) */
      L.lampOn = (t, period) => {
        L.lamp.set(t, { o: 0.3 }).to(t, 0.08, { o: 1 }).to(t + 0.1, 0.06, { o: 0.4 }).to(t + 0.2, 0.3, { o: 1 });
        const w = (2 * Math.PI) / (period || 5.2);
        c.track(lt => {
          const a = (lt - t) * w + 0.5, cs = Math.cos(a), sn = Math.sin(a);
          beam.setAttribute('transform', `translate(${cx} 458) scale(${cs.toFixed(4)} ${(0.55 + 0.45 * Math.abs(cs)).toFixed(3)})`);
          beam.setAttribute('opacity', (0.25 + 0.75 * Math.abs(cs)).toFixed(3));
          flare.setAttribute('opacity', (Math.pow(Math.max(0, sn), 10) * 0.9).toFixed(3));
        });
      };
      /** вспышки с моря: times — локальные секунды */
      L.flashes = times => {
        for (const t of times) { L.boat.set(t, { o: 1, s: 1.5 }).to(t + 0.02, 0.3, { o: 0, s: 0.8 }, ease.in2); c.sfx('flash', t, 1, -0.6); }
      };
      L.doorOpen = t => { L.door.to(t, 0.5, { sx: 0.3 }, ease.io2); };
      return L;
    }
    return { svg, defs, front, bind };
  };

  // =====================================================================
  //  ТЁМНЫЙ ФОН С БОКЕ — заставки, выбор, «правила»
  // =====================================================================
  S.bokeh = function (c, o) {
    o = Object.assign({ a: '#0A1022', b: '#1B2B5C', glow: '255,190,90', n: 16, rays: false }, o);
    const r = rng(o.seed || 11);
    const bg = E.h(`<div style="position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 42%, ${o.b} 0%, ${o.a} 72%)"></div>`);
    c.world.appendChild(bg);
    if (o.rays) {
      const ry = E.h(`<div style="position:absolute;left:-560px;top:${(o.rayY || 860) - 1100}px;width:2200px;height:2200px;border-radius:50%;background:repeating-conic-gradient(from 0deg, rgba(${o.glow},0.13) 0deg 6deg, rgba(${o.glow},0) 6deg 15deg);-webkit-mask-image:radial-gradient(closest-side, #000 8%, rgba(0,0,0,.5) 45%, transparent 78%);mask-image:radial-gradient(closest-side, #000 8%, rgba(0,0,0,.5) 45%, transparent 78%);transform-origin:50% 50%"></div>`);
      c.world.appendChild(ry);
      c.track(lt => { ry.style.transform = `rotate(${(lt * 5).toFixed(2)}deg)`; });
    }
    for (let i = 0; i < o.n; i++) {
      const sz = 120 + r() * 330, x = r() * 1080, y = r() * 1920, al = 0.08 + r() * 0.2, sp = 8 + r() * 22, ph = r() * 6.28;
      const d = E.h(`<div style="position:absolute;left:${-sz / 2}px;top:${-sz / 2}px;width:${sz}px;height:${sz}px;border-radius:50%;background:radial-gradient(circle, rgba(${o.glow},${al}) 0%, rgba(${o.glow},${al * 0.55}) 45%, rgba(${o.glow},0) 70%)"></div>`);
      c.world.appendChild(d);
      c.track(lt => { d.style.transform = `translate(${(x + Math.sin(lt * 0.21 + ph) * sp * 2).toFixed(1)}px,${(y - ((lt * sp) % 2200) + (y - lt * sp < -200 ? 2200 : 0)).toFixed(1)}px)`; });
    }
  };
})();

/* ---------- остальные декорации ---------- */
(function () {
  'use strict';
  const S = A.set, { rng, ease, clamp } = E;

  // =====================================================================
  //  СЪЁМНАЯ КОМНАТА В ГОРОДЕ
  // =====================================================================
  S.room = function (p) {
    const r = rng(3);
    let stripes = ''; for (let x = 45; x < 1080; x += 90) stripes += `<rect x="${x}" y="0" width="45" height="1560" fill="#BEC8D3"/>`;
    let planks = ''; for (let y = 1620; y < 1920; y += 70) planks += `<path d="M 0 ${y} H 1080" stroke="#8C6646" stroke-width="4"/>`;
    let blds = '';
    [[590, 620, 90], [690, 560, 110], [810, 650, 80], [895, 590, 100]].forEach(([x, y, w], i) => {
      blds += `<rect x="${x}" y="${y}" width="${w}" height="${900 - y}" fill="${i % 2 ? '#7E8EA3' : '#8D9CB0'}"/>`;
      for (let yy = y + 22; yy < 880; yy += 44) for (let xx = x + 14; xx < x + w - 20; xx += 30) if (r() > 0.35) blds += `<rect x="${xx}" y="${yy}" width="14" height="20" fill="${r() > 0.8 ? '#FFE08A' : '#A9B6C8'}"/>`;
    });
    let rain = ''; for (let i = 0; i < 26; i++) rain += `<path class="rn" data-x="${580 + r() * 380}" data-ph="${r()}" data-sp="${0.8 + r() * 0.7}" d="M 0 0 l -6 26" />`;
    let ribs = ''; for (let x = 612; x < 930; x += 36) ribs += `<rect x="${x}" y="960" width="26" height="150" rx="10" fill="#F2F4F7"/>`;
    const defs = `<linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FB1C6"/><stop offset="1" stop-color="#D5DCE5"/></linearGradient>
      <clipPath id="${p}wc"><rect x="578" y="448" width="404" height="452"/></clipPath>
      <radialGradient id="${p}lg"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".55"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient>
      <linearGradient id="${p}fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1020" stop-opacity="0"/><stop offset="1" stop-color="#0b1020" stop-opacity=".3"/></linearGradient>`;
    const svg = `
<g id="${p}set">
  <rect width="1080" height="1560" fill="#CAD3DD"/>${stripes}
  <rect y="1560" width="1080" height="360" fill="#A07855"/>${planks}
  <rect y="1540" width="1080" height="26" fill="#EEF1F5"/>
  <!-- окно -->
  <rect x="556" y="426" width="448" height="496" rx="10" fill="#F4F6F9"/>
  <rect x="578" y="448" width="404" height="452" fill="url(#${p}sky)"/>
  <g clip-path="url(#${p}wc)">${blds}<g id="${p}rain" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55">${rain}</g></g>
  <path d="M 780 448 V 900 M 578 660 H 982" stroke="#F4F6F9" stroke-width="16"/>
  <rect x="540" y="914" width="480" height="22" rx="6" fill="#E3E7EC"/>
  <path d="M 520 400 H 1040" stroke="#7A6A5A" stroke-width="10" stroke-linecap="round"/>
  <path d="M 536 404 Q 560 640 528 930 L 610 930 Q 640 640 596 404 Z" fill="#D8A93F"/><path d="M 558 404 Q 580 640 556 930" stroke="#BD8F2C" stroke-width="5" fill="none"/>
  ${ribs}<rect x="600" y="950" width="344" height="16" rx="6" fill="#DCE0E6"/>
  <!-- шкаф -->
  <rect x="60" y="640" width="290" height="910" rx="10" fill="#8A6248"/><rect x="76" y="660" width="122" height="874" rx="6" fill="#9C7152"/><rect x="212" y="660" width="122" height="874" rx="6" fill="#9C7152"/>
  <circle cx="186" cy="1110" r="9" fill="#E8C15A"/><circle cx="224" cy="1110" r="9" fill="#E8C15A"/>
  <rect x="96" y="560" width="210" height="82" rx="12" fill="#3F6C8C"/><rect x="170" y="546" width="62" height="18" rx="8" fill="#2E526B"/><path d="M 96 600 H 306" stroke="#2E526B" stroke-width="5"/>
  <!-- календарь -->
  <g transform="translate(446 610)"><rect x="-62" y="-80" width="124" height="160" rx="8" fill="#fff"/><rect x="-62" y="-80" width="124" height="40" rx="8" fill="#E5484D"/><g fill="#C9CED8">${[0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => `<rect x="${-46 + j * 25}" y="${-26 + i * 24}" width="16" height="14" rx="3"/>`).join('')).join('')}</g><circle cx="12" cy="29" r="15" fill="none" stroke="#E5484D" stroke-width="5"/></g>
  <!-- лампа -->
  <path d="M 300 0 V 250" stroke="#4A5060" stroke-width="5"/><path d="M 252 300 Q 300 220 348 300 Z" fill="#3E4558"/><circle cx="300" cy="306" r="17" fill="#FFE9A8"/><circle cx="300" cy="330" r="230" fill="url(#${p}lg)"/>
  <!-- коробка с вещами с работы -->
  <g transform="translate(850 1640)"><path d="M -86 -150 q -30 -70 20 -110 M -70 -150 q 30 -90 -8 -130 M -78 -150 q 46 -40 60 -100" stroke="#4E9A5B" stroke-width="12" fill="none" stroke-linecap="round"/>
    <rect x="-14" y="-190" width="52" height="60" rx="8" fill="#E9EDF2"/><path d="M 38 -176 q 26 4 0 34" stroke="#E9EDF2" stroke-width="9" fill="none"/>
    <rect x="-130" y="-140" width="260" height="170" fill="#C99A62"/><polygon points="-130,-140 -160,-176 -40,-176 0,-140" fill="#B88750"/><polygon points="130,-140 164,-172 50,-176 0,-140" fill="#D7AC76"/>
    <rect x="-20" y="-140" width="40" height="170" fill="#E2C08E" opacity=".7"/>
    <text x="0" y="-40" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="30" fill="#7A5A30" letter-spacing="2">С РАБОТЫ</text></g>
  <!-- матрас -->
  <rect x="0" y="1470" width="330" height="96" rx="20" fill="#E9EDF2"/><rect x="0" y="1440" width="250" height="70" rx="26" fill="#4E8C8C"/><rect x="14" y="1416" width="120" height="60" rx="24" fill="#fff"/>
</g>`;
    function bind(c) {
      const rn = [...c.root.querySelectorAll(`#${p}rain .rn`)];
      c.track(lt => rn.forEach(el => { const y = 440 + (((lt * +el.dataset.sp + +el.dataset.ph) % 1) * 480); el.setAttribute('transform', `translate(${el.dataset.x} ${y.toFixed(1)})`); }));
      return {};
    }
    return { svg, defs, front: `<rect x="0" y="1560" width="1080" height="360" fill="url(#${p}fog)"/>`, bind };
  };

  // =====================================================================
  //  ТРАССА ВДОЛЬ МОРЯ + АВТОБУС
  // =====================================================================
  S.road = function (p) {
    const r = rng(5);
    const rep = (fn, w) => fn(0) + fn(w);            // бесшовный повтор слоя
    const hills = o => `<path transform="translate(${o} 0)" d="M 0 980 Q 120 860 260 930 Q 400 820 560 920 Q 700 850 820 930 Q 960 880 1080 980 Z" fill="#8FB9D2"/>`;
    const near = o => `<path transform="translate(${o} 0)" d="M 0 1300 L 0 1210 Q 140 1150 300 1200 Q 470 1140 640 1196 Q 820 1150 960 1202 Q 1030 1180 1080 1210 L 1080 1300 Z" fill="#8FBE63"/>
      <g transform="translate(${o} 0)" fill="#6FA34C"><ellipse cx="180" cy="1218" rx="60" ry="30"/><ellipse cx="610" cy="1206" rx="80" ry="34"/><ellipse cx="900" cy="1214" rx="50" ry="26"/></g>`;
    let wv = ''; for (let i = 0; i < 14; i++) wv += `<path d="M ${r() * 1080} ${1010 + r() * 150} h ${30 + r() * 50}"/>`;
    const rail = o => { let s = ''; for (let x = 0; x < 1080; x += 180) s += `<rect x="${o + x}" y="1286" width="14" height="52" rx="3" fill="#C9CED6"/>`; return s + `<rect x="${o}" y="1292" width="1080" height="16" fill="#E9EDF2"/><rect x="${o}" y="1300" width="1080" height="5" fill="#B9C0CC"/>`; };
    const dash = o => { let s = ''; for (let x = 0; x < 1080; x += 216) s += `<rect x="${o + x}" y="1456" width="120" height="12" rx="4" fill="#F4F6F9"/>`; return s; };
    const tuft = o => { let s = '', q = rng(9); for (let i = 0; i < 18; i++) { const x = q() * 1080, y = 1640 + q() * 250; s += `<path d="M ${o + x} ${y} l -8 -22 M ${o + x} ${y} l 0 -30 M ${o + x} ${y} l 9 -20"/>`; } return s; };
    const pole = o => `<g transform="translate(${o} 0)"><rect x="300" y="1010" width="12" height="290" fill="#7A6A5A"/><rect x="268" y="1030" width="76" height="10" rx="4" fill="#7A6A5A"/></g>`;
    const win = (x, who) => `<g transform="translate(${x} -276)"><rect width="92" height="96" rx="12" fill="#BFE6F2"/>${who === 1 ? `<circle cx="46" cy="70" r="30" fill="#FFF7EE" stroke="#20232E" stroke-width="3"/><path d="M 15 64 Q 14 32 46 30 Q 78 32 77 64 Z" fill="#12908F"/><rect x="13" y="54" width="66" height="14" rx="6" fill="#0B6F70"/><circle cx="36" cy="78" r="3" fill="#20232E"/><circle cx="56" cy="78" r="3" fill="#20232E"/>` : who === 2 ? `<circle cx="46" cy="74" r="27" fill="#E7DCCB" stroke="#20232E" stroke-width="3"/><path d="M 19 66 Q 22 40 46 40 Q 70 40 73 66 Q 46 54 19 66 Z" fill="#6B5B55"/>` : ''}<path d="M 6 6 L 30 6 L 6 40 Z" fill="#fff" opacity=".35"/></g>`;
    const wheel = x => `<g class="whl" data-x="${x}"><circle r="54" fill="#1E222D"/><circle r="30" fill="#AEB6C2"/><circle r="10" fill="#1E222D"/><path d="M 0 -28 V 28 M -28 0 H 28" stroke="#6E7785" stroke-width="7"/></g>`;
    const defs = `<linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63BCF0"/><stop offset="1" stop-color="#E2F5FD"/></linearGradient>
      <linearGradient id="${p}sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58C2D2"/><stop offset="1" stop-color="#2491B5"/></linearGradient>
      <radialGradient id="${p}sun"><stop offset="0" stop-color="#FFF7CF"/><stop offset=".4" stop-color="#FFE9A0" stop-opacity=".5"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/></radialGradient>
      <linearGradient id="${p}fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1020" stop-opacity="0"/><stop offset="1" stop-color="#0b1020" stop-opacity=".3"/></linearGradient>`;
    const svg = `
<g id="${p}set">
  <rect width="1080" height="1000" fill="url(#${p}sky)"/>
  <circle cx="820" cy="380" r="200" fill="url(#${p}sun)"/><circle cx="820" cy="380" r="60" fill="#FFF6C9"/>
  <g id="${p}cl" fill="#fff" opacity=".95">${[[160, 300, 1.2], [560, 520, 0.8], [980, 230, 1], [1400, 420, 1.1], [1900, 280, 0.9]].map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="96" ry="30"/><ellipse cx="-44" cy="-20" rx="44" ry="30"/><ellipse cx="14" cy="-34" rx="58" ry="42"/><ellipse cx="66" cy="-12" rx="40" ry="26"/></g>`).join('')}</g>
  <g id="${p}far">${rep(hills, 1080)}</g>
  <rect y="975" width="1080" height="260" fill="url(#${p}sea)"/>
  <g id="${p}wv" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55">${wv}<g transform="translate(1080 0)">${wv}</g></g>
  <g id="${p}pole">${pole(0)}${pole(1080)}</g>
  <g id="${p}near">${rep(near, 1080)}</g>
  <rect y="1296" width="1080" height="340" fill="#4E5665"/><rect y="1296" width="1080" height="18" fill="#6A7282"/><rect y="1600" width="1080" height="14" fill="#E9EDF2" opacity=".8"/>
  <g id="${p}rail">${rail(0)}${rail(1080)}</g>
  <g id="${p}dash">${dash(0)}${dash(1080)}</g>
  <rect y="1630" width="1080" height="290" fill="#6F9E4A"/>
  <g id="${p}bus" transform="translate(520 1570)">
    <ellipse cx="0" cy="6" rx="390" ry="18" fill="#0b1020" opacity=".22"/>
    <g id="${p}puff" fill="#fff"></g>
    <g id="${p}busb">
      <path d="M -370 -70 L -370 -290 Q -370 -330 -330 -330 L 250 -330 Q 330 -330 352 -250 L 372 -170 Q 380 -150 380 -120 L 380 -70 Z" fill="#F4ECDA"/>
      <path d="M -370 -168 H 376 L 380 -120 H -370 Z" fill="#12908F"/>
      <path d="M -370 -120 H 380 V -70 H -370 Z" fill="#E4D8BE"/>
      ${win(-340, 0)}${win(-236, 2)}${win(-132, 0)}${win(-28, 1)}
      <rect x="86" y="-284" width="96" height="206" rx="10" fill="#D8CFBB"/><rect x="96" y="-274" width="34" height="186" rx="6" fill="#BFE6F2"/><rect x="138" y="-274" width="34" height="186" rx="6" fill="#BFE6F2"/>
      <path d="M 200 -276 L 262 -276 Q 312 -276 330 -220 L 344 -180 L 200 -180 Z" fill="#BFE6F2"/>
      <rect x="150" y="-322" width="170" height="34" rx="8" fill="#1E222D"/><text x="235" y="-297" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="22" fill="#FFB627" letter-spacing="1">СИЗЫЙ МЫС</text>
      <rect x="348" y="-142" width="30" height="20" rx="6" fill="#FFE27A"/><rect x="-372" y="-150" width="16" height="26" rx="5" fill="#E5484D"/>
      <rect x="-380" y="-84" width="764" height="20" rx="8" fill="#9A9FAB"/>
    </g>
    <g transform="translate(-220 -54)">${wheel(-220)}</g><g transform="translate(232 -54)">${wheel(232)}</g>
  </g>
  <g id="${p}tuft" stroke="#4F8140" stroke-width="6" stroke-linecap="round" fill="none">${tuft(0)}${tuft(1080)}</g>
  <rect x="0" y="1560" width="1080" height="360" fill="url(#${p}fog)"/>
</g>`;
    function bind(c) {
      const layer = (id, sp) => { const el = c.q(`#${p}${id}`); c.track(lt => el.setAttribute('transform', `translate(${(-(((lt + 3) * sp) % 1080)).toFixed(1)} 0)`)); };
      layer('far', 26); layer('wv', 60); layer('near', 150); layer('pole', 220); layer('rail', 620); layer('dash', 760); layer('tuft', 980);
      const cl = c.q(`#${p}cl`); c.track(lt => cl.setAttribute('transform', `translate(${(-(lt * 12) % 1080).toFixed(1)} 0)`));
      const wh = [...c.root.querySelectorAll(`#${p}bus .whl`)];
      c.track(lt => wh.forEach(el => el.setAttribute('transform', `rotate(${((lt * 620) % 360).toFixed(1)})`)));
      const body = c.q(`#${p}busb`); c.track(lt => body.setAttribute('transform', `translate(0 ${(Math.sin(lt * 11) * 2.2 + Math.sin(lt * 4.3) * 2).toFixed(2)})`));
      const puff = c.q(`#${p}puff`);
      for (let i = 0; i < 5; i++) puff.insertAdjacentHTML('beforeend', '<circle r="20"/>');
      const ps = [...puff.children];
      c.track(lt => ps.forEach((el, i) => { const k = ((lt * 1.1 + i / 5) % 1); el.setAttribute('cx', (-390 - k * 190).toFixed(1)); el.setAttribute('cy', (-90 - k * 46).toFixed(1)); el.setAttribute('r', (12 + k * 30).toFixed(1)); el.setAttribute('opacity', ((1 - k) * 0.5).toFixed(2)); }));
      return { bus: c.$(`#${p}bus`, { x: 520, y: 1570 }) };
    }
    return { svg, defs, bind };
  };

  // =====================================================================
  //  ДОМ СМОТРИТЕЛЯ ИЗНУТРИ
  // =====================================================================
  S.cabin = function (p, mode, ded) {
    const night = mode === 'night', r = rng(21);
    let walls = ''; for (let y = 0; y < 1560; y += 120) walls += `<path d="M 0 ${y} H 1080" stroke="#74502F" stroke-width="5"/>`;
    for (let i = 0; i < 16; i++) { const x = r() * 1040, y = Math.floor(r() * 13) * 120 + 30 + r() * 60; walls += `<path d="M ${x} ${y} h ${40 + r() * 80}" stroke="#7E5837" stroke-width="4" stroke-linecap="round" opacity=".7"/>`; }
    let floor = ''; for (let y = 1630; y < 1920; y += 72) floor += `<path d="M 0 ${y} H 1080" stroke="#4B3120" stroke-width="5"/>`;
    let stars = ''; for (let i = 0; i < 22; i++) stars += `<circle cx="${112 + r() * 296}" cy="${540 + r() * 230}" r="${1.5 + r() * 2}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`;
    let books = ''; ['#B5533F', '#2E7C86', '#D8A93F', '#5C7191', '#7B4B7A', '#3F6C8C', '#B5533F', '#8A9A5B'].forEach((col, i) => { const hgt = 78 + ((i * 37) % 40); books += `<rect x="${618 + i * 30}" y="${420 - hgt}" width="26" height="${hgt}" rx="3" fill="${col}"/>`; });
    const tintId = p + 'tint';
    const defs = `
      <radialGradient id="${p}lg"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".75"/><stop offset=".5" stop-color="#FFC96B" stop-opacity=".22"/><stop offset="1" stop-color="#FFC96B" stop-opacity="0"/></radialGradient>
      <linearGradient id="${p}cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".7"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></linearGradient>
      <linearGradient id="${p}nsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1230"/><stop offset="1" stop-color="#2A3B7C"/></linearGradient>
      <linearGradient id="${p}sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF1B0" stop-opacity="0"/><stop offset=".5" stop-color="#FFF1B0" stop-opacity=".85"/><stop offset="1" stop-color="#FFF1B0" stop-opacity="0"/></linearGradient>
      <clipPath id="${p}pc"><rect x="-78" y="-98" width="156" height="196" rx="6"/></clipPath>
      <linearGradient id="${p}fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1020" stop-opacity="0"/><stop offset="1" stop-color="#0b1020" stop-opacity=".4"/></linearGradient>
      ${A.tint(tintId, night ? 0.36 : 0.86, night ? 0.43 : 0.74, night ? 0.72 : 0.62)}`;
    const svg = `
<g id="${p}set">
 <g filter="url(#${tintId})">
  <rect width="1080" height="1560" fill="#8A5F3F"/>${walls}
  <rect y="1560" width="1080" height="360" fill="#5E3F2A"/>${floor}
  <rect y="1544" width="1080" height="22" fill="#4B3120"/>
  <!-- полка -->
  <rect x="596" y="420" width="420" height="18" rx="5" fill="#5E3F2A"/>${books}
  <g transform="translate(934 392)"><ellipse cx="0" cy="0" rx="66" ry="28" fill="#CFE9F2" opacity=".75"/><rect x="62" y="-9" width="26" height="18" rx="4" fill="#CFE9F2" opacity=".75"/><path d="M -30 8 h 60 l -10 10 h -40 z" fill="#7A5236"/><path d="M 0 8 V -18 l 22 20 z" fill="#fff"/></g>
  <!-- портрет деда -->
  <g transform="translate(790 760)"><rect x="-96" y="-116" width="192" height="232" rx="8" fill="#C79A4A"/><rect x="-78" y="-98" width="156" height="196" rx="6" fill="#D9CDB6"/><g clip-path="url(#${p}pc)"><g transform="translate(0 196) scale(.52)">${ded || ''}</g></g></g>
  <!-- часы -->
  <g transform="translate(560 600)"><circle r="78" fill="#5E3F2A"/><circle r="66" fill="#F4ECDA"/><g stroke="#3A2A1E" stroke-width="5" stroke-linecap="round">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `<path d="M 0 -56 V -48" transform="rotate(${i * 30})"/>`).join('')}</g>
    <path id="${p}hh" d="M 0 6 V -32" stroke="#20232E" stroke-width="8" stroke-linecap="round"/><path id="${p}mh" d="M 0 8 V -50" stroke="#20232E" stroke-width="5" stroke-linecap="round"/><circle r="6" fill="#E5484D"/></g>
  <!-- стол -->
  <rect x="600" y="1210" width="26" height="350" fill="#5A3C27"/><rect x="960" y="1210" width="26" height="350" fill="#5A3C27"/>
  <rect x="566" y="1180" width="456" height="34" rx="8" fill="#6F4A30"/><rect x="640" y="1214" width="200" height="70" rx="6" fill="#62412A"/><circle cx="740" cy="1250" r="8" fill="#E8C15A"/>
  <g id="${p}book" transform="translate(716 1160)"><rect x="-70" y="-22" width="140" height="42" rx="6" fill="#22405E"/><rect x="-62" y="-16" width="124" height="8" rx="3" fill="#F1E6D2"/><rect x="-44" y="-4" width="60" height="16" rx="4" fill="#E8C15A" opacity=".8"/></g>
  <g transform="translate(590 1182)"><rect x="0" y="-44" width="44" height="44" rx="8" fill="#E9EDF2"/><path d="M 44 -34 q 22 4 0 26" stroke="#E9EDF2" stroke-width="8" fill="none"/></g>
  <!-- настольная лампа -->
  <g transform="translate(900 1180)"><rect x="-44" y="-12" width="88" height="14" rx="6" fill="#B8923F"/><rect x="-6" y="-110" width="12" height="100" fill="#B8923F"/><path d="M -74 -110 Q -70 -160 0 -164 Q 70 -160 74 -110 Z" fill="#2F7D59"/><rect x="-78" y="-116" width="156" height="12" rx="6" fill="#256649"/></g>
  <!-- диван -->
  <g id="${p}sofa">
    <rect x="40" y="1250" width="520" height="210" rx="34" fill="#4F6F64"/>
    <rect x="20" y="1390" width="560" height="170" rx="30" fill="#5E8275"/>
    <rect x="20" y="1330" width="70" height="230" rx="30" fill="#4F6F64"/><rect x="510" y="1330" width="70" height="230" rx="30" fill="#4F6F64"/>
    <rect x="60" y="1540" width="26" height="34" fill="#3A2A1E"/><rect x="514" y="1540" width="26" height="34" fill="#3A2A1E"/>
  </g>
  <!-- коврик -->
  <ellipse cx="620" cy="1760" rx="330" ry="70" fill="#9B4A3A"/><ellipse cx="620" cy="1760" rx="270" ry="50" fill="none" stroke="#E2C08E" stroke-width="8" stroke-dasharray="26 18"/>
  <!-- окно -->
  <rect x="78" y="506" width="364" height="418" rx="10" fill="#D9C7A6"/>
  <rect x="100" y="528" width="320" height="374" fill="${night ? `url(#${p}nsky)` : '#31406F'}"/>
  ${stars}<circle cx="330" cy="610" r="30" fill="#EEF2FF"/><circle cx="342" cy="602" r="26" fill="${night ? '#141E48' : '#31406F'}"/>
  <path d="M 100 800 Q 200 780 300 796 T 420 790 V 902 H 100 Z" fill="${night ? '#101A44' : '#26345F'}"/>
  <path d="M 260 528 V 902 M 100 716 H 420" stroke="#D9C7A6" stroke-width="16"/>
  <rect x="62" y="916" width="396" height="24" rx="8" fill="#C4B08A"/>
 </g>
 <!-- свет -->
 <g id="${p}lamplight" opacity="${night ? 0 : 1}"><polygon points="826,1076 974,1076 1080,1500 720,1500" fill="url(#${p}cone)" opacity=".5"/><circle cx="900" cy="1090" r="430" fill="url(#${p}lg)"/><ellipse cx="900" cy="1074" rx="60" ry="10" fill="#FFF3C4"/></g>
 <g id="${p}swg" opacity="0"><rect x="100" y="528" width="320" height="374" fill="#FFF1B0" opacity=".8"/><polygon id="${p}swp" points="30,-80 210,-80 420,1560 -160,1560" fill="url(#${p}sweep)"/></g>
</g>`;
    function bind(c) {
      const hh = c.q(`#${p}hh`), mh = c.q(`#${p}mh`);
      const C = {};
      /** время на настенных часах: fn(lt) -> часы (дробные) */
      C.clock = fn => c.track(lt => { const hrs = fn(lt); hh.setAttribute('transform', `rotate(${((hrs % 12) * 30).toFixed(1)})`); mh.setAttribute('transform', `rotate(${(((hrs * 60) % 60) * 6).toFixed(1)})`); });
      C.sweepEl = c.q(`#${p}swg`); C.swp = c.q(`#${p}swp`);
      /** луч маяка ползёт по стене начиная с t */
      C.sweep = (t, period) => c.track(lt => {
        if (lt < t) { C.sweepEl.setAttribute('opacity', 0); return; }
        const k = ((lt - t) % period) / period, x = -500 + k * 2000;
        C.swp.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
        const win = Math.max(0, 1 - Math.abs(k - 0.32) * 5);
        C.sweepEl.setAttribute('opacity', 1);
        C.sweepEl.firstElementChild.setAttribute('opacity', (0.15 + win * 0.75).toFixed(2));
      });
      C.book = c.$(`#${p}book`, { x: 716, y: 1160 });
      return C;
    }
    return { svg, defs, front: `<rect x="0" y="1560" width="1080" height="360" fill="url(#${p}fog)"/>`, bind, tintId };
  };

  // ---- белый джип Лядова ----
  A.prop.suv = id => `
<g id="${id}">
  <ellipse cx="0" cy="6" rx="330" ry="18" fill="#0b1020" opacity=".2"/>
  <g class="carb">
    <path d="M -310 -70 L -310 -170 Q -310 -196 -280 -200 L -180 -214 L -110 -300 Q -96 -318 -70 -318 L 150 -318 Q 180 -318 196 -296 L 250 -214 L 292 -200 Q 316 -192 316 -166 L 316 -70 Z" fill="#F5F6F8"/>
    <path d="M -310 -120 H 316 V -70 H -310 Z" fill="#DDE1E7"/>
    <path d="M -160 -214 L -100 -290 Q -92 -300 -78 -300 L 20 -300 L 20 -214 Z" fill="#26303F"/><path d="M 38 -300 L 144 -300 Q 162 -300 172 -286 L 220 -214 L 38 -214 Z" fill="#26303F"/>
    <path d="M -150 -220 L -100 -284 L -70 -284 L -110 -220 Z" fill="#fff" opacity=".18"/>
    <rect x="-312" y="-178" width="34" height="22" rx="8" fill="#FFE27A"/><rect x="294" y="-180" width="22" height="30" rx="6" fill="#E5484D"/>
    <rect x="-40" y="-190" width="46" height="10" rx="5" fill="#B9C0CC"/><rect x="110" y="-190" width="46" height="10" rx="5" fill="#B9C0CC"/>
    <path d="M 28 -214 V -76" stroke="#C9CED6" stroke-width="4"/>
    <text x="126" y="-140" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="19" fill="#0F8F8F" letter-spacing="1.5">СЕВЕРНЫЙ БЕРЕГ</text>
    <rect x="-320" y="-86" width="644" height="22" rx="9" fill="#8E96A3"/>
  </g>
  <g transform="translate(-196 -56)"><g class="whl"><circle r="62" fill="#1E222D"/><circle r="34" fill="#C9CED6"/><circle r="11" fill="#1E222D"/><path d="M 0 -32 V 32 M -32 0 H 32 M -22 -22 L 22 22 M -22 22 L 22 -22" stroke="#7B8494" stroke-width="6"/></g></g>
  <g transform="translate(206 -56)"><g class="whl"><circle r="62" fill="#1E222D"/><circle r="34" fill="#C9CED6"/><circle r="11" fill="#1E222D"/><path d="M 0 -32 V 32 M -32 0 H 32 M -22 -22 L 22 22 M -22 22 L 22 -22" stroke="#7B8494" stroke-width="6"/></g></g>
</g>`;
})();
