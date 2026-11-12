/* Персонажи: шароголовые человечки из простых фигур.
   A.person(kind) -> { svg, bind(ctx, {x,y,s}) } ; bind возвращает «куклу» с узлами
   (root, body, head, armL, armR, legL, legR) и методами face/talk/walk/look. */
(function () {
  'use strict';
  const A = (window.A = {});
  const INK = '#20232E', SKIN = '#FFF7EE';
  A.INK = INK;
  const { clamp, ease, hash } = E;

  // ---- лица -----------------------------------------------------------------
  const MOUTH = {
    neutral: ['M -10 0 L 10 0', 0], smile: ['M -15 -4 Q 0 13 15 -4', 0], sad: ['M -13 6 Q 0 -7 13 6', 0],
    tight: ['M -13 1 L 13 1', 0], smirk: ['M -12 3 Q 4 8 15 -5', 0],
    grin: ['M -19 -5 Q 0 22 19 -5 Z', 2], o: ['M -7 1 a 7 9 0 1 0 14 0 a 7 9 0 1 0 -14 0', 1],
    open1: ['M -8 0 a 8 5 0 1 0 16 0 a 8 5 0 1 0 -16 0', 1], open2: ['M -9 1 a 9 10 0 1 0 18 0 a 9 10 0 1 0 -18 0', 1],
    sleep: ['M -6 2 a 6 5 0 1 0 12 0 a 6 5 0 1 0 -12 0', 1],
  };
  // брови: [поворотЛ, поворотП, dy]; глаза: 'dot' | 'wide' | 'closed' | 'happy'
  const FACE = {
    neutral: { b: [0, 0, 0], e: 'dot', m: 'neutral' },
    smile: { b: [-4, 4, -2], e: 'dot', m: 'smile' },
    happy: { b: [-6, 6, -4], e: 'happy', m: 'grin' },
    grin: { b: [8, -12, -1], e: 'dot', m: 'grin' },
    sly: { b: [10, -14, 1], e: 'dot', m: 'smirk' },
    sad: { b: [-16, 16, 0], e: 'dot', m: 'sad' },
    worry: { b: [-18, 18, -4], e: 'dot', m: 'tight' },
    angry: { b: [18, -18, 5], e: 'dot', m: 'tight' },
    wow: { b: [0, 0, -13], e: 'wide', m: 'o' },
    think: { b: [4, -12, -6], e: 'dot', m: 'smirk' },
    sleep: { b: [-4, 4, 2], e: 'closed', m: 'sleep' },
    tired: { b: [-12, 12, 2], e: 'closed', m: 'tight' },
    hush: { b: [-10, 10, -2], e: 'dot', m: 'open1' },
  };

  // ---- одежда/причёски --------------------------------------------------------
  const KINDS = {
    hero: {
      top: '#F2B01E', arm: '#DE9E12', pants: '#2A3148', shoe: '#5B3A29', tw: 150,
      back: `<circle cx="0" cy="-398" r="86" fill="#D2930F"/>`,   // капюшон
      torso: `<path d="M 0 -366 L 0 -175" stroke="#B9800A" stroke-width="5"/>
              <path d="M -52 -362 L -44 -180 M 52 -362 L 44 -180" stroke="#3A4058" stroke-width="13" stroke-linecap="round" opacity=".95"/>
              <rect x="-62" y="-250" width="40" height="9" rx="4" fill="#B9800A"/><rect x="22" y="-250" width="40" height="9" rx="4" fill="#B9800A"/>`,
      hat: `<path d="M -73 -446 Q -76 -528 0 -530 Q 76 -528 73 -446 Z" fill="#12908F"/>
            <rect x="-78" y="-468" width="156" height="30" rx="13" fill="#0B6F70"/>
            <path d="M -40 -468 v 28 M -13 -468 v 28 M 14 -468 v 28 M 41 -468 v 28" stroke="#095a5b" stroke-width="4" opacity=".7"/>`,
    },
    notary: {
      top: '#5C7191', arm: '#4D6181', pants: '#333C50', shoe: '#1F2330', tw: 144,
      back: `<path d="M -80 -430 Q -84 -512 0 -514 Q 84 -512 80 -430 L 82 -372 Q 60 -356 44 -368 L 40 -420 L -40 -420 L -44 -368 Q -60 -356 -82 -372 Z" fill="#7B6258"/>`,
      torso: `<path d="M -26 -366 L 0 -300 L 26 -366 Z" fill="#fff"/>
              <path d="M -26 -366 L 0 -300 L -4 -240 M 26 -366 L 0 -300" stroke="#465a78" stroke-width="5" fill="none"/>
              <circle cx="-2" cy="-262" r="5" fill="#2B3549"/><circle cx="-2" cy="-226" r="5" fill="#2B3549"/>`,
      hat: `<path d="M -72 -452 Q -66 -512 0 -508 Q 60 -506 72 -448 Q 30 -486 -30 -476 Q -58 -470 -72 -452 Z" fill="#7B6258"/>`,
      glasses: true,
    },
    lyadov: {
      top: '#C9A27A', arm: '#B8916A', pants: '#3A3D48', shoe: '#15161C', tw: 160, coat: 70,
      back: '',
      torso: `<path d="M -30 -366 L 0 -290 L 30 -366 Z" fill="#2A2E3A"/>
              <path d="M -34 -366 L -4 -286 L -10 -105 M 34 -366 L 4 -286" stroke="#A8845F" stroke-width="6" fill="none"/>
              <circle cx="12" cy="-240" r="6" fill="#8A6B4C"/><circle cx="12" cy="-190" r="6" fill="#8A6B4C"/>`,
      hat: `<path d="M -73 -444 Q -80 -520 -8 -512 Q 62 -516 73 -446 Q 52 -486 4 -484 Q -44 -482 -73 -444 Z" fill="#2B2422"/>
            <path d="M -30 -505 Q 10 -500 44 -488" stroke="#51443F" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      watch: true,
    },
    nyura: {
      top: '#7B4B7A', arm: '#6A3F69', pants: '#5E6B4A', shoe: '#8C8F99', tw: 184, skirt: true,
      back: `<circle cx="0" cy="-428" r="88" fill="#C4453A"/>`,
      torso: `<path d="M -52 -330 L 52 -330 L 60 -120 L -60 -120 Z" fill="#F1E6D2"/>
              <rect x="-30" y="-230" width="60" height="46" rx="8" fill="#E3D4B8"/>
              <path d="M -52 -330 L -20 -366 M 52 -330 L 20 -366" stroke="#F1E6D2" stroke-width="10" stroke-linecap="round"/>`,
      hat: `<path d="M -76 -438 Q -84 -524 0 -524 Q 84 -524 76 -438 Q 40 -488 0 -488 Q -40 -488 -76 -438 Z" fill="#C4453A"/>
            <g fill="#fff" opacity=".85"><circle cx="-38" cy="-496" r="5"/><circle cx="0" cy="-508" r="5"/><circle cx="38" cy="-496" r="5"/><circle cx="-62" cy="-470" r="4"/><circle cx="62" cy="-470" r="4"/></g>
            <path d="M -10 -364 L -34 -338 L -6 -346 Z M 10 -364 L 34 -338 L 6 -346 Z" fill="#A9372E"/><circle cx="0" cy="-364" r="10" fill="#C4453A"/>`,
      cheeks: 0.8,
    },
    ded: {   // дед Захар (для портрета)
      top: '#2C3E57', arm: '#24344a', pants: '#2A3148', shoe: '#1F2330', tw: 156,
      back: '',
      torso: `<path d="M -28 -366 L 0 -306 L 28 -366 Z" fill="#E9E2D2"/><circle cx="-30" cy="-300" r="6" fill="#D8B45A"/><circle cx="30" cy="-300" r="6" fill="#D8B45A"/>`,
      hat: `<path d="M -70 -468 Q -72 -520 0 -524 Q 72 -520 70 -468 Z" fill="#22324A"/>
            <path d="M -82 -462 Q 0 -486 82 -462 L 78 -446 Q 0 -468 -78 -446 Z" fill="#162236"/>
            <circle cx="0" cy="-494" r="11" fill="#D8B45A"/>
            <path d="M -62 -412 Q -64 -352 0 -344 Q 64 -352 62 -412 Q 40 -384 0 -388 Q -40 -384 -62 -412 Z" fill="#ECEFF2"/>`,
      beard: true,
    },
  };

  A.person = function (kind, id) {
    const K = KINDS[kind]; id = id || E.uid(kind);
    const hw = K.tw / 2, bot = K.coat ? -175 + K.coat : -175, sh = hw - 9;
    const arm = side => {
      const sx = side * sh, hx = side * (sh + 10);
      return `<g class="arm arm${side < 0 ? 'L' : 'R'}"><path d="M ${sx} -338 L ${hx} -205" stroke="${K.arm}" stroke-width="36" stroke-linecap="round" fill="none"/>
        ${K.watch && side < 0 ? `<rect x="${hx - 19}" y="-232" width="38" height="14" rx="5" fill="#E8C15A" transform="rotate(${-4 * side} ${hx} -225)"/>` : ''}
        <g class="held"></g><circle cx="${hx}" cy="-198" r="18" fill="${SKIN}" stroke="${INK}" stroke-width="3.5"/></g>`;
    };
    const leg = side => `<g class="leg leg${side < 0 ? 'L' : 'R'}"><rect x="${side * 27 - 17}" y="-188" width="34" height="172" rx="7" fill="${K.pants}"/>
        <path d="M ${side * 27 - 21} -2 q 0 -22 21 -22 q ${side > 0 ? 30 : 21} 0 ${side > 0 ? 30 : 21} 22 q 0 4 -4 4 l ${side > 0 ? -43 : -34} 0 q -4 0 -4 -4 z" fill="${K.shoe}" transform="translate(${side < 0 ? -9 : 0} 0)"/></g>`;
    const svg = `
<g id="${id}" class="person">
  <ellipse class="shadow" cx="0" cy="4" rx="${hw + 16}" ry="12" fill="#0b1020" opacity=".15"/>
  <g class="body">
    ${leg(-1)}${leg(1)}
    ${K.skirt ? `<path d="M ${-hw + 6} -200 L ${hw - 6} -200 L ${hw + 12} -70 L ${-hw - 12} -70 Z" fill="${K.pants}"/>` : ''}
    <g class="upper">
      <g class="backhead">${K.back}</g>
      <path class="torso" d="M ${-hw} ${bot} L ${-hw} -318 Q ${-hw} -366 ${-hw + 48} -366 L ${hw - 48} -366 Q ${hw} -366 ${hw} -318 L ${hw} ${bot} Q ${hw} ${bot + 10} ${hw - 10} ${bot + 10} L ${-hw + 10} ${bot + 10} Q ${-hw} ${bot + 10} ${-hw} ${bot} Z" fill="${K.top}"/>
      ${K.torso}
      <g class="front"></g>
      ${arm(-1)}${arm(1)}
      <g class="head">
        <circle cx="0" cy="-432" r="72" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>
        <g class="face">
          <circle cx="-45" cy="-416" r="12" fill="#FF8F8F" opacity="${K.cheeks || 0.42}"/><circle cx="45" cy="-416" r="12" fill="#FF8F8F" opacity="${K.cheeks || 0.42}"/>
          <g class="eye eyeL" transform="translate(-25 -440)"><ellipse class="dot" rx="6.6" ry="7.4" fill="${INK}"/><circle class="hl" cx="2.4" cy="-3" r="2.6" fill="#fff" opacity="0"/><path class="lid" d="M -9 0 Q 0 7 9 0" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round" opacity="0"/></g>
          <g class="eye eyeR" transform="translate(25 -440)"><ellipse class="dot" rx="6.6" ry="7.4" fill="${INK}"/><circle class="hl" cx="2.4" cy="-3" r="2.6" fill="#fff" opacity="0"/><path class="lid" d="M -9 0 Q 0 7 9 0" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round" opacity="0"/></g>
          <path class="brow browL" d="M -13 0 L 13 0" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>
          <path class="brow browR" d="M -13 0 L 13 0" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>
          ${K.glasses ? `<g fill="none" stroke="${INK}" stroke-width="4.5"><circle cx="-26" cy="-440" r="19" fill="#fff" fill-opacity=".35"/><circle cx="26" cy="-440" r="19" fill="#fff" fill-opacity=".35"/><path d="M -7 -442 Q 0 -447 7 -442"/></g>` : ''}
          <path class="mouth" transform="translate(0 -403)" d="M -10 0 L 10 0" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          ${K.beard ? '' : ''}
        </g>
        <g class="hat">${K.hat}</g>
      </g>
    </g>
  </g>
</g>`;

    function bind(c, pos) {
      pos = Object.assign({ x: 540, y: 1700, s: 1 }, pos);
      const g = c.q('#' + id), $ = s => g.querySelector(s);
      const P = { id, el: g, kind };
      P.root = c.nd(g, { x: pos.x, y: pos.y, s: pos.s, o: pos.o == null ? 1 : pos.o });
      P.body = c.nd($('.body'));
      P.upper = c.nd($('.upper'), {}, { px: 0, py: -180 });
      P.head = c.nd($('.head'), {}, { px: 0, py: -372 });
      P.armL = c.nd($('.armL'), {}, { px: -sh, py: -338 });
      P.armR = c.nd($('.armR'), {}, { px: sh, py: -338 });
      P.legL = c.nd($('.legL'), {}, { px: -27, py: -186 });
      P.legR = c.nd($('.legR'), {}, { px: 27, py: -186 });
      P.faceN = c.nd($('.face'));
      P.shadow = c.nd($('.shadow'));
      P.heldL = $('.armL .held'); P.heldR = $('.armR .held'); P.front = $('.front');
      const faces = [[-1e9, pos.face || 'neutral']], talks = [], walks = [];
      const phase = hash(id.length * 7.3 + id.charCodeAt(0)) * 5;
      const el = { m: $('.mouth'), bL: $('.browL'), bR: $('.browR'), eL: $('.eyeL'), eR: $('.eyeR') };
      /** сменить выражение лица в момент t */
      P.face = (t, name) => { faces.push([t, name]); faces.sort((a, b) => a[0] - b[0]); return P; };
      /** персонаж говорит с t0 до t1 (рот двигается) */
      P.talk = (t0, t1) => { talks.push([t0, t1]); return P; };
      /** идти из x0 в x1 */
      P.walk = (t0, t1, x0, x1, o) => { walks.push([t0, t1, (o && o.rate) || 2.4]); P.root.set(t0, { x: x0 }).to(t0, t1 - t0, { x: x1 }, (o && o.ease) || ease.io2); return P; };
      /** сдвиг взгляда: v от -1 (влево) до 1 (вправо) */
      P.look = (t, d, v) => { P.faceN.to(t, d, { x: v * 13 }, ease.io2); P.head.to(t, d, { r: v * 3 }, ease.io2); return P; };
      /** поднять руку: side 'L' | 'R', deg — на сколько градусов от тела наружу */
      P.raise = (side, t, d, deg, e) => { (side === 'L' ? P.armL : P.armR).to(t, d, { r: side === 'L' ? deg : -deg }, e || ease.back); return P; };
      P.breathe = true;
      let key = '';
      c.track(lt => {
        // лицо
        let name = 'neutral'; for (const [t, n] of faces) if (lt >= t) name = n;
        const F = FACE[name] || FACE.neutral;
        let mouth = F.m, talking = false;
        for (const [a, b] of talks) if (lt >= a && lt < b) talking = true;
        if (talking) { const k = hash(Math.floor(lt * 9.5) * 1.37 + phase); mouth = k < 0.3 ? F.m : k < 0.68 ? 'open1' : 'open2'; }
        const bt = (lt + phase) % 3.4, blink = F.e === 'dot' || F.e === 'wide' ? (bt < 0.13 ? 0.12 : 1) : 1;
        const k2 = name + mouth + blink;
        if (k2 !== key) {
          key = k2;
          const [d, mode] = MOUTH[mouth];
          el.m.setAttribute('d', d);
          el.m.setAttribute('fill', mode === 1 ? INK : mode === 2 ? '#fff' : 'none');
          el.m.setAttribute('stroke-width', mode === 1 ? 0 : 5);
          el.bL.setAttribute('transform', `translate(-26 ${-463 + F.b[2]}) rotate(${F.b[0]})`);
          el.bR.setAttribute('transform', `translate(26 ${-463 + F.b[2]}) rotate(${F.b[1]})`);
          for (const e of [el.eL, el.eR]) {
            const dot = e.querySelector('.dot'), lid = e.querySelector('.lid'), hl = e.querySelector('.hl');
            const closed = F.e === 'closed' || F.e === 'happy';
            dot.setAttribute('opacity', closed ? 0 : 1); lid.setAttribute('opacity', closed ? 1 : 0);
            lid.setAttribute('d', F.e === 'happy' ? 'M -9 3 Q 0 -8 9 3' : 'M -9 0 Q 0 7 9 0');
            dot.setAttribute('rx', F.e === 'wide' ? 9.5 : 6.6); dot.setAttribute('ry', (F.e === 'wide' ? 10.5 : 7.4) * blink);
            hl.setAttribute('opacity', F.e === 'wide' ? 1 : 0);
          }
        }
      });
      // дыхание, ходьба
      P.body.fn((lt, st) => {
        let w = 0; for (const [a, b, r] of walks) if (lt >= a && lt < b) w = r;
        P._w = w; P._ph = lt * w * Math.PI * 2;
        if (w) st.y += -Math.abs(Math.sin(P._ph)) * 9;
      });
      P.upper.fn((lt, st) => { if (P.breathe) { st.sy *= 1 + 0.008 * Math.sin(lt * 2.1 + phase); } if (P._w) st.r += Math.sin(P._ph) * 1.6; });
      P.head.fn((lt, st) => { st.y += Math.sin(lt * 2.1 + phase + 0.6) * 1.6; });
      P.legL.fn((lt, st) => { if (P._w) st.r += Math.sin(P._ph) * 24; });
      P.legR.fn((lt, st) => { if (P._w) st.r -= Math.sin(P._ph) * 24; });
      P.armL.fn((lt, st) => { st.r += P._w ? -Math.sin(P._ph) * 20 : Math.sin(lt * 1.3 + phase) * 1.2; });
      P.armR.fn((lt, st) => { st.r += P._w ? Math.sin(P._ph) * 20 : -Math.sin(lt * 1.3 + phase) * 1.2; });
      return P;
    }
    return { id, svg, bind };
  };

  // ---- мелкий реквизит --------------------------------------------------------
  A.prop = {
    phone: (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r || 0})"><rect x="-17" y="-32" width="34" height="62" rx="7" fill="#1B1E2A"/><rect x="-13" y="-26" width="26" height="48" rx="3" fill="#7FD3F7"/></g>`,
    folder: (x, y) => `<g transform="translate(${x} ${y})"><rect x="-34" y="-46" width="68" height="92" rx="6" fill="#B9853F"/><rect x="-28" y="-40" width="56" height="80" rx="4" fill="#D7A85C"/><rect x="-18" y="-22" width="36" height="8" rx="3" fill="#fff" opacity=".8"/></g>`,
    keys: (x, y) => `<g transform="translate(${x} ${y})"><circle r="15" fill="none" stroke="#C9CED6" stroke-width="5"/><path d="M 0 15 L 0 58 M 0 44 L 12 44 M 0 54 L 9 54" stroke="#E8C15A" stroke-width="7" stroke-linecap="round"/><path d="M 6 14 L 20 50" stroke="#C9CED6" stroke-width="6" stroke-linecap="round"/></g>`,
    paper: (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r || 0})"><rect x="-30" y="-40" width="60" height="80" rx="4" fill="#fff" stroke="#D5D8E0" stroke-width="3"/><path d="M -18 -20 h 36 M -18 -6 h 36 M -18 8 h 24" stroke="#B9BECC" stroke-width="5" stroke-linecap="round"/><circle cx="14" cy="24" r="8" fill="#E5484D" opacity=".8"/></g>`,
    bowl: (x, y) => `<g transform="translate(${x} ${y})"><g fill="#E0A44A" stroke="#B87A2A" stroke-width="3"><ellipse cx="-30" cy="-16" rx="26" ry="15" transform="rotate(-18 -30 -16)"/><ellipse cx="26" cy="-18" rx="26" ry="15" transform="rotate(16 26 -18)"/><ellipse cx="-2" cy="-28" rx="27" ry="15"/></g><path d="M -62 -6 Q -56 44 0 44 Q 56 44 62 -6 Z" fill="#F4F1EA"/><path d="M -62 -6 L 62 -6" stroke="#3C78C8" stroke-width="7" stroke-linecap="round"/><path d="M -50 14 Q 0 30 50 14" stroke="#3C78C8" stroke-width="4" fill="none" opacity=".6"/></g>`,
    backpack: () => `<g><rect x="-66" y="-352" width="132" height="150" rx="34" fill="#3A4058"/></g>`,
  };
})();
