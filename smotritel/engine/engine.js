/* Движок сериала: детерминированная анимация «по времени».
   Любой кадр вычисляется только из t (секунды) — поэтому видео можно
   рендерить покадрово, кусками и в любом порядке. */
(function () {
  'use strict';
  const E = (window.E = {
    W: 1080, H: 1920, t: 0, defs: [], scenes: [], globals: [],
    cues: { sfx: [], music: [], amb: [] }, timing: null,
  });

  // ---------- математика ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = {
    lin: k => k,
    in2: k => k * k, out2: k => 1 - (1 - k) * (1 - k),
    io2: k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
    in3: k => k * k * k, out3: k => 1 - Math.pow(1 - k, 3),
    io3: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    out5: k => 1 - Math.pow(1 - k, 5),
    back: k => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
    back2: k => { const c = 2.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
    elastic: k => (k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  };
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  let uidN = 0;
  const uid = p => `${p || 'u'}${++uidN}`;
  Object.assign(E, { clamp, lerp, ease, rng, hash, uid });

  // ---------- анимируемый узел ----------
  const PROPS = ['x', 'y', 's', 'sx', 'sy', 'r', 'o'];
  class Nd {
    constructor(el, base, opts) {
      this.el = el;
      this.b = Object.assign({ x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, o: 1 }, base || {});
      this.seg = {}; this.fns = [];
      this.svg = el instanceof SVGElement;
      this.px = (opts && opts.px) || 0; this.py = (opts && opts.py) || 0;
      this._tr = null; this._o = null;
    }
    val(p, lt) {
      let v = this.b[p]; const a = this.seg[p];
      if (a) for (const g of a) {
        if (lt >= g.t1 || (g.step && lt >= g.t0)) v = g.v1;
        else if (lt >= g.t0) { v = lerp(g.v0, g.v1, g.e((lt - g.t0) / (g.t1 - g.t0))); break; }
        else break;
      }
      return v;
    }
    end(p) { const a = this.seg[p]; return a && a.length ? a[a.length - 1].v1 : this.b[p]; }
    /** плавно изменить свойства: начиная с t за d секунд */
    to(t, d, props, e) {
      for (const p in props) {
        const a = (this.seg[p] = this.seg[p] || []);
        if (a.length && t < a[a.length - 1].t0) console.warn('твин не по порядку', p, t);
        a.push({ t0: t, t1: t + Math.max(d, 1e-4), v0: this.end(p), v1: props[p], e: e || ease.out3, step: d <= 0 });
      }
      return this;
    }
    set(t, props) { return this.to(t, 0, props, ease.lin); }
    fn(f) { this.fns.push(f); return this; }
    apply(lt) {
      const st = {}; for (const p of PROPS) st[p] = this.val(p, lt);
      for (const f of this.fns) f(lt, st);
      const sx = st.s * st.sx, sy = st.s * st.sy, f2 = n => Math.round(n * 100) / 100;
      let tr;
      if (this.svg) {
        tr = `translate(${f2(st.x + this.px)} ${f2(st.y + this.py)}) rotate(${f2(st.r)}) scale(${f2(sx * 1000) / 1000} ${f2(sy * 1000) / 1000}) translate(${-this.px} ${-this.py})`;
        if (tr !== this._tr) { this.el.setAttribute('transform', tr); this._tr = tr; }
      } else {
        tr = `translate(${f2(st.x)}px,${f2(st.y)}px) rotate(${f2(st.r)}deg) scale(${f2(sx * 1000) / 1000},${f2(sy * 1000) / 1000})`;
        if (tr !== this._tr) { this.el.style.transform = tr; this._tr = tr; }
      }
      const o = st.o <= 0.001 ? 0 : Math.min(1, st.o);
      if (o !== this._o) {
        this.el.style.opacity = o;
        this.el.style.visibility = o === 0 ? 'hidden' : 'visible';
        this._o = o;
      }
    }
  }
  E.Nd = Nd;

  // ---------- контекст сцены ----------
  function h(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  E.h = h;
  const norm = s => s.toLowerCase().replace(/[.,!?:;«»"()—–-]/g, '');

  class Ctx {
    constructor(def, tim, root) {
      this.def = def; this.id = tim.id; this.start = tim.start; this.end = tim.end;
      this.dur = tim.end - tim.start; this.tim = tim; this.root = root;
      this.world = root.querySelector('.world'); this.ui = root.querySelector('.ui');
      this.nodes = []; this.tracks = [];
      this.cam = new Nd(this.world, { x: 540, y: 960, s: 1 });   // x,y — точка мира в центре кадра
      this.cam.apply = lt => {
        const z = this.cam.val('s', lt);
        let cx = this.cam.val('x', lt), cy = this.cam.val('y', lt);
        const st = { x: cx, y: cy, s: z, r: 0 }; for (const f of this.cam.fns) f(lt, st);
        cx = clamp(st.x, 540 / st.s, 1080 - 540 / st.s); cy = clamp(st.y, 960 / st.s, 1920 - 960 / st.s);
        this.world.style.transform = `translate(${(540 - cx * st.s).toFixed(2)}px,${(960 - cy * st.s).toFixed(2)}px) scale(${st.s.toFixed(4)}) rotate(${(st.r || 0).toFixed(3)}deg)`;
      };
    }
    line(id) {
      for (const sc of E.timing.scenes) for (const l of sc.lines) if (l.id === id) return l;
      throw new Error('нет реплики ' + id);
    }
    /** локальное время: начало реплики + доля её длительности */
    T(id, frac) { const l = this.line(id); return l.start + (l.end - l.start) * (frac || 0) - this.start; }
    /** локальное время начала слова в реплике (по первым буквам) */
    Wd(id, word, nth) {
      const l = this.line(id), q = norm(word); let k = nth || 0;
      for (const w of l.words) if (norm(w.w).startsWith(q) && k-- === 0) return w.t - this.start;
      console.warn(`слово «${word}» не найдено в ${id}`); return l.start - this.start;
    }
    nd(el, base, opts) { const n = new Nd(el, base, opts); this.nodes.push(n); return n; }
    q(sel) { const el = this.root.querySelector(sel); if (!el) console.warn('нет элемента', sel, 'в', this.id); return el; }
    /** узел по селектору (SVG-группа и т.п.) */
    $(sel, base, opts) { return this.nd(this.q(sel), base, opts); }
    track(fn) { this.tracks.push(fn); return this; }
    art(svgInner, defs) {
      this.world.insertAdjacentHTML('beforeend',
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;left:0;top:0;overflow:visible"><defs>${defs || ''}</defs>${svgInner}</svg>`);
      return this.world.lastElementChild;
    }
    sfx(name, lt, gain, pan) { E.cues.sfx.push({ t: +(this.start + lt).toFixed(3), name, gain: gain == null ? 1 : gain, pan: pan || 0 }); return this; }
    music(mood, lt) { E.cues.music.push({ t: +(this.start + (lt || 0)).toFixed(3), mood }); return this; }
    amb(name, lt0, lt1, gain) { E.cues.amb.push({ t0: +(this.start + lt0).toFixed(3), t1: +(this.start + lt1).toFixed(3), name, gain: gain == null ? 1 : gain }); return this; }
    update(lt) {
      this.cam.apply(lt);
      for (const n of this.nodes) n.apply(lt);
      for (const f of this.tracks) f(lt);
    }
  }
  E.Ctx = Ctx;

  // ---------- регистрация ----------
  E.scene = def => E.defs.push(def);
  E.global = fn => E.globals.push(fn);

  const ENTER_D = { cut: 0, fade: 0.45, dip: 0.5, flash: 0.35, pushL: 0.4, pushU: 0.42 };

  E.init = async function (timing) {
    E.timing = timing;
    const stage = document.getElementById('stage');
    for (const tim of timing.scenes) {
      const def = E.defs.find(d => d.id === tim.id);
      if (!def) { console.warn('нет сцены', tim.id); continue; }
      const root = h(`<div class="scene" id="sc-${tim.id}"><div class="world"></div><div class="ui"></div></div>`);
      stage.appendChild(root);
      const c = new Ctx(def, tim, root);
      c.enter = def.enter || 'cut';
      def.build(c);
      E.scenes.push(c);
    }
    // глобальный слой (HUD, виньетка, вспышки переходов)
    const g = h(`<div class="scene global" id="sc-global"><div class="world"></div><div class="ui"></div></div>`);
    stage.appendChild(g);
    E.gctx = new Ctx({ id: 'global' }, { id: 'global', start: 0, end: timing.duration, lines: [] }, g);
    E.dip = h('<div class="dip"></div>'); g.appendChild(E.dip);
    E.flashEl = h('<div class="flash"></div>'); g.appendChild(E.flashEl);
    for (const fn of E.globals) fn(E.gctx);
    // звук переходов
    E.scenes.forEach((c, i) => { if (i > 0 && c.enter !== 'cut' && !c.def.quiet) c.sfx('whoosh', -0.12, 0.8); });
    E.cues.sfx.sort((a, b) => a.t - b.t); E.cues.music.sort((a, b) => a.t - b.t);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    E.seek(0);
    E.ready = true;
  };

  E.seek = function (t) {
    E.t = t;
    let dip = 0, flash = 0;
    const n = E.scenes.length;
    let cur = n - 1;
    for (let i = 0; i < n; i++) if (t < E.scenes[i].end) { cur = i; break; }
    for (let i = 0; i < n; i++) {
      const c = E.scenes[i];
      let vis = i === cur, op = 1, tx = 0, ty = 0;
      const lt = t - c.start;
      if (i === cur && i > 0) {
        const d = ENTER_D[c.enter] || 0, k = d ? clamp(lt / d) : 1;
        if (c.enter === 'fade') op = ease.io2(k);
        else if (c.enter === 'dip') dip = Math.max(dip, 1 - ease.out2(k));
        else if (c.enter === 'flash') flash = Math.max(flash, (1 - ease.out2(k)) * 0.9);
        else if (c.enter === 'pushL') tx = (1 - ease.out5(k)) * 1080;
        else if (c.enter === 'pushU') ty = (1 - ease.out5(k)) * 1920;
      }
      if (i === cur - 1) {   // уходящая сцена под входящей
        const nx = E.scenes[cur], d = ENTER_D[nx.enter] || 0, k = d ? clamp((t - nx.start) / d) : 1;
        if (k < 1 && (nx.enter === 'fade' || nx.enter === 'pushL' || nx.enter === 'pushU')) {
          vis = true;
          if (nx.enter === 'pushL') tx = -ease.out5(k) * 1080;
          if (nx.enter === 'pushU') ty = -ease.out5(k) * 1920;
        }
      }
      if (i === cur && i < n - 1) {  // затемнение перед «dip»-входом следующей
        const nx = E.scenes[i + 1];
        if (nx.enter === 'dip') dip = Math.max(dip, ease.in2(clamp(1 - (c.end - t) / 0.22)));
      }
      c.root.style.display = vis ? 'block' : 'none';
      if (vis) {
        c.root.style.opacity = op;
        c.root.style.transform = tx || ty ? `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)` : '';
        c.root.style.zIndex = i === cur ? 2 : 1;
        c.update(Math.min(lt, c.dur + 1));
      }
    }
    E.dip.style.opacity = dip; E.flashEl.style.opacity = flash;
    E.gctx.update(t);
  };

  // ---------- UI-компоненты ----------
  const COLORS = {
    red: ['#E5484D', '#fff'], navy: ['#152238', '#fff'], green: ['#23A566', '#fff'],
    blue: ['#2D6CDF', '#fff'], amber: ['#FFB627', '#1A1B22'], white: ['#FFFFFF', '#1A1B22'],
    teal: ['#0F8F8F', '#fff'], dark: ['#0A0E18', '#fff'], violet: ['#6B4FD8', '#fff'],
  };
  E.COLORS = COLORS;
  const P = Ctx.prototype;

  /** наклонная плашка-слово */
  P.label = function (text, o) {
    o = Object.assign({ x: 540, y: 600, at: 0, color: 'red', rot: -3, size: 50, anim: 'pop', sfx: true }, o);
    const [bg, fg] = COLORS[o.color] || COLORS.red;
    const el = h(`<div class="anc"><div class="label" style="background:${bg};color:${fg};font-size:${o.size}px;${o.w ? `width:${o.w}px;white-space:normal;` : ''}">${text}</div></div>`);
    (o.layer || this.ui).appendChild(el);
    const n = this.nd(el, { x: o.x, y: o.y, r: o.rot, o: 0, s: 1 });
    const t = o.at;
    if (o.anim === 'pop') { n.set(t, { o: 1, s: 0.35, r: o.rot + 9 }).to(t, 0.34, { s: 1, r: o.rot }, ease.back2); }
    else if (o.anim === 'slideL') { n.set(t, { o: 1, x: o.x - 520 }).to(t, 0.36, { x: o.x }, ease.back); }
    else if (o.anim === 'slideR') { n.set(t, { o: 1, x: o.x + 520 }).to(t, 0.36, { x: o.x }, ease.back); }
    else if (o.anim === 'drop') { n.set(t, { o: 1, y: o.y - 160, s: 1.25 }).to(t, 0.3, { y: o.y, s: 1 }, ease.back); }
    else if (o.anim === 'stamp') { n.set(t, { o: 1, s: 2.2 }).to(t, 0.22, { s: 1 }, ease.in3); }
    else n.set(t, { o: 1 });
    if (o.out != null) n.to(o.out, 0.16, { o: 0, s: 0.8 }, ease.in2);
    if (o.sfx) this.sfx(o.sfx === true ? 'pop' : o.sfx, t, o.gain == null ? 1 : o.gain, clamp((o.x - 540) / 700, -0.6, 0.6));
    return n;
  };

  /** реплика персонажа: белый «пузырь» с хвостиком */
  P.bubble = function (text, o) {
    o = Object.assign({ x: 540, y: 520, w: 760, at: 0, size: 42, tail: 'bl' }, o);
    const tails = { bl: 'left:16%;bottom:-34px;', br: 'right:16%;bottom:-34px;transform:scaleX(-1);', bc: 'left:46%;bottom:-34px;', none: 'display:none;' };
    const el = h(`<div class="anc"><div class="bubble" style="width:${o.w}px;font-size:${o.size}px">${o.who ? `<div class="who" style="color:${o.whoColor || '#E5484D'}">${o.who}</div>` : ''}<span>${text}</span><svg class="tail" style="${tails[o.tail]}" width="54" height="40" viewBox="0 0 54 40"><path d="M2 0 L50 0 L6 38 Z" fill="#fff"/></svg></div></div>`);
    this.ui.appendChild(el);
    const n = this.nd(el, { x: o.x, y: o.y, o: 0, s: 1 });
    n.set(o.at, { o: 1, s: 0.6, y: o.y + 30 }).to(o.at, 0.3, { s: 1, y: o.y }, ease.back);
    if (o.out != null) n.to(o.out, 0.16, { o: 0, s: 0.9 }, ease.in2);
    this.sfx('pop2', o.at, 0.9);
    return n;
  };

  /** произвольная карточка (HTML) с появлением */
  P.card = function (html, o) {
    o = Object.assign({ x: 540, y: 700, at: 0, anim: 'up', cls: '' }, o);
    const el = h(`<div class="anc"><div class="card ${o.cls}" style="${o.w ? `width:${o.w}px;` : ''}${o.style || ''}">${html}</div></div>`);
    (o.layer || this.ui).appendChild(el);
    const n = this.nd(el, { x: o.x, y: o.y, o: 0, s: 1, r: o.rot || 0 });
    if (o.anim === 'up') n.set(o.at, { o: 1, y: o.y + 90, s: 0.92 }).to(o.at, 0.36, { y: o.y, s: 1 }, ease.back);
    else if (o.anim === 'pop') n.set(o.at, { o: 1, s: 0.5 }).to(o.at, 0.32, { s: 1 }, ease.back);
    else if (o.anim === 'left') n.set(o.at, { o: 1, x: o.x - 900 }).to(o.at, 0.42, { x: o.x }, ease.out5);
    else if (o.anim === 'right') n.set(o.at, { o: 1, x: o.x + 900 }).to(o.at, 0.42, { x: o.x }, ease.out5);
    else n.set(o.at, { o: 1 });
    if (o.out != null) n.to(o.out, 0.18, { o: 0, s: 0.92 }, ease.in2);
    if (o.sfx !== false) this.sfx(o.sfx || 'pop2', o.at, 0.9);
    n.card = el.firstElementChild;
    return n;
  };

  /** появление вложенного элемента карточки (строки чека и т.п.) */
  P.reveal = function (el, at, o) {
    o = o || {};
    const n = this.nd(el, { o: 0, y: 0 });
    n.set(at, { o: 1, y: o.dy == null ? 18 : o.dy }).to(at, 0.26, { y: 0 }, ease.out3);
    if (o.sfx) this.sfx(o.sfx, at, o.gain || 0.8);
    return n;
  };

  /** жёлтое кольцо-выделение */
  P.ring = function (o) {
    o = Object.assign({ x: 540, y: 900, r: 90, at: 0, color: '#FFC83A', wide: 8 }, o);
    const R = o.r, C = 2 * Math.PI * R, sz = R * 2 + 40;
    const el = h(`<div class="anc"><svg width="${sz}" height="${sz}" viewBox="${-sz / 2} ${-sz / 2} ${sz} ${sz}" style="position:absolute;left:${-sz / 2}px;top:${-sz / 2}px;overflow:visible"><circle r="${R}" fill="none" stroke="${o.color}" stroke-width="${o.wide}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90)"/></svg></div>`);
    (o.layer || this.ui).appendChild(el);
    const circ = el.querySelector('circle');
    const n = this.nd(el, { x: o.x, y: o.y, o: 1 });
    this.track(lt => {
      const k = ease.out3(clamp((lt - o.at) / 0.45));
      circ.setAttribute('stroke-dashoffset', (C * (1 - k)).toFixed(1));
      const pulse = lt > o.at + 0.45 ? 1 + 0.04 * Math.sin((lt - o.at) * 5) : 1;
      circ.setAttribute('r', (R * pulse).toFixed(2));
    });
    if (o.out != null) n.to(o.out, 0.2, { o: 0 });
    if (o.sfx !== false) this.sfx('tick', o.at, 0.9);
    return n;
  };

  /** число, плавно меняющееся во времени */
  P.counter = function (el, o) {
    const fmt = o.fmt || (v => Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' '));
    let last = null;
    this.track(lt => {
      const k = (o.ease || ease.out3)(clamp((lt - o.t0) / o.d));
      const s = fmt(lerp(o.from, o.to, lt < o.t0 ? 0 : k));
      if (s !== last) { el.textContent = s; last = s; }
    });
    if (o.sfx !== false) for (let i = 0; i < Math.min(10, Math.floor(o.d / 0.07)); i++) this.sfx('tick', o.t0 + i * 0.07, 0.5);
  };

  /** текст с переключением по времени: [[t, 'текст'], ...] */
  P.swap = function (el, list) {
    let last = null;
    this.track(lt => { let s = list[0][1]; for (const [t, v] of list) if (lt >= t) s = v; if (s !== last) { el.innerHTML = s; last = s; } });
  };
})();
