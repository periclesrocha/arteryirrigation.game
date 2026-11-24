/* Artery Irrigation Regions: pick an artery, then every region it irrigates. */
(() => {
  'use strict';

  // ------------------------------------------------------------------
  // Data: arteries in document order, one row per region (the table's rows)
  // ------------------------------------------------------------------
  const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  // Different wording for the same structure (data.js) counts as one region
  const alias = new Map();
  (window.IRRIGATION_SAME || []).forEach(set => set.forEach(label => alias.set(norm(label), norm(set[0]))));
  const keyOf = label => alias.get(norm(label)) || norm(label);
  const groups = [];
  const arteries = [];
  let rowOrder = 0;
  (window.IRRIGATION || []).forEach((g, gi) => {
    const group = { title: g.group, arteries: [] };
    g.arteries.forEach(a => {
      const art = {
        id: 'a' + arteries.length,
        name: a.name,
        branchOf: a.branchOf || '',
        group: gi,
        regions: a.regions.map(label => ({ label, key: keyOf(label), order: rowOrder++ }))
      };
      art.keys = art.regions.map(r => r.key);
      if (new Set(art.keys).size !== art.keys.length) console.warn('Same region listed twice under', a.name);
      art.n = art.regions.length;
      arteries.push(art);
      group.arteries.push(art);
    });
    groups.push(group);
  });
  const TOTAL = rowOrder;
  const arteryById = new Map(arteries.map(a => [a.id, a]));
  const orderIn = (a, key) => { const r = a.regions.find(x => x.key === key); return r ? r.order : 1e9; };
  const labelIn = (a, key, fallback) => { const r = a.regions.find(x => x.key === key); return r ? r.label : fallback; };
  const branchLabel = a => a.branchOf ? a.branchOf.charAt(0).toUpperCase() + a.branchOf.slice(1) + ' branch' : '';

  const $ = id => document.getElementById(id);
  const el = {
    mark: $('mark'), modeLine: $('modeLine'),
    time: $('statTime'), mistakes: $('statMistakes'), hints: $('statHints'), score: $('statScore'),
    btnHint: $('btnHint'), btnCheck: $('btnCheck'), btnReveal: $('btnReveal'), btnBoard: $('btnBoard'), btnNew: $('btnNew'), btnSound: $('btnSound'),
    progress: $('progressFill'),
    arteries: $('arteries'), matchCount: $('matchCount'),
    chipPill: $('chipPill'), chipPillText: $('chipPillText'), chipPillX: $('chipPillX'),
    streak: $('streak'), streakText: $('streakText'),
    toast: $('toast'),
    chips: $('chips'), bankCount: $('bankCount'), bankEmpty: $('bankEmpty'), filter: $('filter'),
    target: $('target'), targetText: $('targetText'), targetX: $('targetX'),
    confetti: $('confetti'),
    intro: $('introDialog'), introForm: $('introForm'), nickInput: $('nickInput'), nickHint: $('nickHint'), btnStudy: $('btnStudy'),
    result: $('resultDialog'), resultTitle: $('resultTitle'), resultText: $('resultText'), resultStats: $('resultStats'), resultBest: $('resultBest'), resultActions: $('resultActions'), mascot: $('mascot'),
    boardDialog: $('boardDialog'), boardBody: $('boardBody'), boardNote: $('boardNote'), boardClose: $('boardClose'),
    tableDialog: $('tableDialog'), tableWrap: $('tableWrap'), tableClose: $('tableClose'), tableDone: $('tableDone'), tablePrint: $('tablePrint'),
    confirm: $('confirmDialog'), confirmTitle: $('confirmTitle'), confirmText: $('confirmText'), confirmYes: $('confirmYes'), confirmNo: $('confirmNo')
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ------------------------------------------------------------------
  // Storage (best effort)
  // ------------------------------------------------------------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('irrigation.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('irrigation.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  // The arterial tree game lives on the same site; reuse its nickname the first time
  function savedNick() {
    const own = store.get('nickname', '');
    if (own) return own;
    try { const v = localStorage.getItem('arteries.nickname'); return v ? JSON.parse(v) : ''; } catch (e) { return ''; }
  }

  // ------------------------------------------------------------------
  // Scoring and nicknames
  // ------------------------------------------------------------------
  // Keep these in step with the score_ms formula in supabase/leaderboard.sql
  const MISTAKE_PENALTY_MS = 10000;
  const HINT_PENALTY_MS = 20000;
  const MIN_TIME_MS = 30000; // the database rejects anything faster
  const scoreOf = (timeMs, mistakes, hints) => timeMs + mistakes * MISTAKE_PENALTY_MS + hints * HINT_PENALTY_MS;
  const cleanNick = v => String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const nickKey = v => cleanNick(v).toLowerCase();
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const boardLabel = mode => (mode === 'test' ? 'Test' : 'Practice');

  // ------------------------------------------------------------------
  // Global leaderboard (Supabase REST). Off until config.js has both values.
  // ------------------------------------------------------------------
  const LBCFG = window.LEADERBOARD || {};
  const lb = {
    on: !!(LBCFG.supabaseUrl && LBCFG.supabaseKey),
    url(path) { return String(LBCFG.supabaseUrl).replace(/\/+$/, '') + '/rest/v1/' + path; },
    headers(extra) {
      const h = Object.assign({ apikey: LBCFG.supabaseKey }, extra || {});
      // Legacy anon keys are JWTs and also go in Authorization; publishable keys must not
      if (/^eyJ/.test(LBCFG.supabaseKey)) h.Authorization = 'Bearer ' + LBCFG.supabaseKey;
      return h;
    },
    async req(path, opts = {}) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 9000);
      try {
        const r = await fetch(this.url(path), Object.assign({}, opts, { headers: this.headers(opts.headers), signal: ctl.signal }));
        const text = await r.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
        if (!r.ok) {
          const err = new Error((body && (body.message || body.msg)) || ('HTTP ' + r.status));
          err.status = r.status; err.code = body && body.code;
          throw err;
        }
        return body;
      } finally { clearTimeout(timer); }
    },
    submit(run) {
      return this.req('irrigation_v2_scores', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(run) });
    },
    board(mode) {
      return this.req(`irrigation_v2_leaderboard?select=nickname,nickname_key,score_ms,time_ms,mistakes,hints,runs,created_at&mode=eq.${mode}&order=score_ms.asc,created_at.asc&limit=500`);
    },
    runs(key) {
      const quoted = '"' + key.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      return this.req(`irrigation_v2_scores?select=nickname,mode,score_ms,time_ms,mistakes,hints,created_at&nickname_key=eq.${encodeURIComponent(quoted)}&order=created_at.desc&limit=200`);
    }
  };
  // The table doesn't exist yet: supabase/leaderboard.sql hasn't been run in the project
  const notSetUp = e => e.status === 404 || e.code === 'PGRST205' || e.code === '42P01';
  // Network trouble, server errors, the 15 s cooldown and a missing table are worth retrying later
  const retryable = e => !e.status || e.status >= 500 || e.code === '42501' || notSetUp(e);

  function queueRun(run) {
    const list = store.get('v2.pending', []);
    list.push(run);
    store.set('v2.pending', list.slice(-50));
  }
  async function flushPending() {
    if (!lb.on) return;
    const list = store.get('v2.pending', []);
    if (!list.length) return;
    const keep = [], seen = new Set();
    for (const run of list) {
      const k = nickKey(run.nickname);
      if (seen.has(k)) { keep.push(run); continue; } // one per nickname per visit (cooldown)
      seen.add(k);
      try { await lb.submit(run); } catch (e) { if (retryable(e)) keep.push(run); }
    }
    store.set('v2.pending', keep);
  }

  // ------------------------------------------------------------------
  // Sound: a heartbeat for a match, a chime for a finished artery, a buzz for a miss
  // ------------------------------------------------------------------
  const sound = {
    ctx: null,
    on: store.get('sound', true),
    ensure() {
      if (!this.on) return null;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { return null; }
      return this.ctx;
    },
    tone(t, { type = 'sine', f0, f1, dur, vol, lp }) {
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
      node.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    beat(at = 0, vol = 0.5) {
      const c = this.ensure(); if (!c) return;
      const t = c.currentTime + at;
      // "lub" then "dub": a low body plus a triangle overtone so laptop speakers carry it
      this.tone(t, { f0: 140, f1: 55, dur: 0.17, vol });
      this.tone(t, { type: 'triangle', f0: 280, f1: 120, dur: 0.09, vol: vol * 0.35 });
      this.tone(t + 0.19, { f0: 120, f1: 50, dur: 0.15, vol: vol * 0.7 });
      this.tone(t + 0.19, { type: 'triangle', f0: 240, f1: 110, dur: 0.08, vol: vol * 0.25 });
    },
    correct() { this.beat(0, 0.42); },
    place() {
      const c = this.ensure(); if (!c) return;
      this.tone(c.currentTime, { type: 'triangle', f0: 520, f1: 380, dur: 0.07, vol: 0.06 });
    },
    wrong() {
      const c = this.ensure(); if (!c) return;
      this.tone(c.currentTime, { type: 'square', f0: 120, f1: 85, dur: 0.16, vol: 0.06, lp: 700 });
    },
    chime() {
      const c = this.ensure(); if (!c) return;
      const t = c.currentTime + 0.32;
      [659.25, 987.77].forEach((f, i) => this.tone(t + i * 0.11, { type: 'triangle', f0: f, dur: 0.55, vol: 0.07 }));
    },
    sparkle() {
      const c = this.ensure(); if (!c) return;
      const t = c.currentTime + 0.3;
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => this.tone(t + i * 0.06, { type: 'sine', f0: f, dur: 0.32, vol: 0.05 }));
    },
    finish() {
      const c = this.ensure(); if (!c) return;
      this.beat(0, 0.5); this.beat(0.85, 0.5);
      const t = c.currentTime + 1.7;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(t + i * 0.09, { type: 'triangle', f0: f, dur: 1.2, vol: 0.06 }));
    }
  };

  // ------------------------------------------------------------------
  // Confetti: hearts, drops of blood and paper bits on a canvas above everything
  // ------------------------------------------------------------------
  const confetti = (() => {
    const cv = el.confetti;
    const ctx = cv.getContext('2d');
    const COLORS = ['#A8132C', '#C8203D', '#E0566C', '#F28C9B', '#FFC2CC', '#F2B33D', '#7A0C1F', '#FFFFFF'];
    const SHAPES = ['heart', 'heart', 'drop', 'paper', 'paper', 'dot'];
    let parts = [], raf = 0, last = 0, dpr = 1;

    function show() {
      try {
        if (cv.showPopover) {
          // Re-opening puts the canvas on top of any dialog that opened after it
          if (cv.matches(':popover-open')) cv.hidePopover();
          cv.showPopover();
          return;
        }
      } catch (e) { /* fall through */ }
      cv.classList.add('live');
    }
    function hide() {
      try { if (cv.hidePopover && cv.matches(':popover-open')) cv.hidePopover(); } catch (e) { /* ignore */ }
      cv.classList.remove('live');
    }
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
    }
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    function spawn(p) {
      parts.push(Object.assign({
        rot: rand(0, Math.PI * 2), vr: rand(-0.15, 0.15),
        size: rand(7, 13), color: pick(COLORS), shape: pick(SHAPES),
        age: 0, life: rand(1.2, 1.9), g: 0.22, drag: 0.985,
        flip: rand(0, Math.PI * 2), vflip: rand(0.08, 0.2), sway: rand(0, Math.PI * 2)
      }, p));
    }
    function run() {
      if (raf) return;
      show(); size();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }

    function drawShape(p) {
      const s = p.size / 10;
      ctx.save();
      ctx.translate(p.x * dpr, p.y * dpr);
      ctx.rotate(p.rot);
      ctx.scale(s * dpr, s * dpr * (p.shape === 'paper' ? Math.cos(p.flip) : 1));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.shape === 'heart') {
        ctx.moveTo(0, 4);
        ctx.bezierCurveTo(-1.2, 3, -5.5, 0.3, -5.5, -2.4);
        ctx.bezierCurveTo(-5.5, -5.4, -2, -6.2, 0, -3.6);
        ctx.bezierCurveTo(2, -6.2, 5.5, -5.4, 5.5, -2.4);
        ctx.bezierCurveTo(5.5, 0.3, 1.2, 3, 0, 4);
      } else if (p.shape === 'drop') {
        ctx.moveTo(0, -6);
        ctx.quadraticCurveTo(4.6, -0.5, 4, 2.2);
        ctx.arc(0, 2.2, 4, 0, Math.PI);
        ctx.quadraticCurveTo(-4.6, -0.5, 0, -6);
      } else if (p.shape === 'dot') {
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
      } else {
        ctx.rect(-5, -2.6, 10, 5.2);
      }
      ctx.fill();
      ctx.restore();
    }

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const f = dt * 60;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const h = window.innerHeight + 40;
      parts = parts.filter(p => {
        p.age += dt;
        if (p.age > p.life || p.y > h) return false;
        p.vy += p.g * f;
        p.vx *= Math.pow(p.drag, f); p.vy *= Math.pow(p.drag, f);
        p.sway += 0.08 * f;
        p.x += (p.vx + (p.swayAmp || 0) * Math.sin(p.sway)) * f;
        p.y += p.vy * f;
        p.rot += p.vr * f;
        p.flip += p.vflip * f;
        const fade = Math.min(1, (p.life - p.age) / 0.35);
        ctx.globalAlpha = Math.max(0, fade);
        drawShape(p);
        return true;
      });
      ctx.globalAlpha = 1;
      if (parts.length) raf = requestAnimationFrame(tick);
      else { raf = 0; ctx.clearRect(0, 0, cv.width, cv.height); hide(); }
    }

    return {
      // A little splash where something lands
      burst(x, y, n = 24, power = 1, shapes) {
        if (reduceMotion.matches) return;
        for (let i = 0; i < n; i++) {
          const a = rand(-Math.PI, 0) + rand(-0.5, 0.5);
          const sp = rand(2.2, 6.5) * power;
          spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5 * power, size: rand(6, 11) * Math.max(0.7, power), life: rand(0.8, 1.4), shape: shapes ? pick(shapes) : pick(SHAPES), g: 0.2 });
        }
        run();
      },
      // The big finish: confetti falls from the top of the screen
      rain(n = 190) {
        if (reduceMotion.matches) return;
        const w = window.innerWidth;
        for (let i = 0; i < n; i++) {
          spawn({ x: rand(0, w), y: rand(-window.innerHeight * 0.6, -10), vx: rand(-1.5, 1.5), vy: rand(1, 4), g: 0.05, drag: 0.992, life: rand(3.2, 5.2), swayAmp: rand(0.3, 1.2), size: rand(8, 15) });
        }
        // and two cannons from the bottom corners
        [[0, 1], [w, -1]].forEach(([x0, dir]) => {
          for (let i = 0; i < 40; i++) {
            const th = rand(0.2, 0.62); // angle away from straight up, toward the middle
            const sp = rand(10, 17) * Math.min(1.25, Math.max(0.8, window.innerHeight / 800));
            spawn({ x: x0, y: window.innerHeight + 5, vx: dir * sp * Math.sin(th), vy: -sp * Math.cos(th), g: 0.22, life: rand(2.2, 3.4), size: rand(8, 14) });
          }
        });
        run();
      },
      raise() { if (raf) show(); },
      resize() { if (raf) size(); }
    };
  })();
  window.addEventListener('resize', () => confetti.resize());

  // ------------------------------------------------------------------
  // Building the arteries panel
  // ------------------------------------------------------------------
  const CHECK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  const groupEls = [];

  function buildArteries() {
    el.arteries.innerHTML = '';
    groups.forEach(g => {
      const sec = document.createElement('section');
      sec.className = 'group';
      const h = document.createElement('h3');
      h.className = 'group-title';
      h.textContent = g.title;
      const cols = document.createElement('div');
      cols.className = 'cols';
      sec.append(h, cols);
      el.arteries.appendChild(sec);
      groupEls.push({ group: g, cols });
    });
    arteries.forEach(a => {
      const card = document.createElement('div');
      card.className = 'artery';
      card.dataset.artery = a.id;

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'artery-pick';
      const title = document.createElement('span');
      title.className = 'artery-title';
      if (a.branchOf) {
        const of = document.createElement('span');
        of.className = 'artery-of';
        of.textContent = branchLabel(a);
        title.appendChild(of);
      }
      const name = document.createElement('span');
      name.className = 'artery-name';
      name.textContent = a.name;
      title.appendChild(name);
      const count = document.createElement('span');
      count.className = 'artery-count';
      count.innerHTML = CHECK_SVG;
      const countText = document.createElement('span');
      count.appendChild(countText);
      pick.append(title, count);

      const vessel = document.createElement('div');
      vessel.className = 'vessel';
      vessel.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      vessel.appendChild(fill);

      const rows = document.createElement('div');
      rows.className = 'rows';
      rows.setAttribute('role', 'list');
      a.slotEls = [];
      for (let i = 0; i < a.n; i++) {
        const s = document.createElement('button');
        s.type = 'button';
        s.className = 'slot empty';
        s.tabIndex = -1;
        s.setAttribute('role', 'listitem');
        const l = document.createElement('span');
        l.className = 'slot-label';
        l.textContent = ' ';
        s.appendChild(l);
        s.labelEl = l;
        rows.appendChild(s);
        a.slotEls.push(s);
      }
      card.append(pick, vessel, rows);
      Object.assign(a, { el: card, pickEl: pick, countText, fillEl: fill });
    });
    colCount = 0;
    layoutColumns();
  }

  // Cards flow down balanced columns, in document order (a masonry without CSS columns)
  let colCount = 0;
  function partition(weights, k) {
    const n = weights.length;
    k = Math.max(1, Math.min(k, n));
    const pre = [0];
    weights.forEach((w, i) => pre.push(pre[i] + w));
    const dp = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
    const cut = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
    dp[0][0] = 0;
    for (let j = 1; j <= k; j++) {
      for (let i = j; i <= n; i++) {
        for (let p = j - 1; p < i; p++) {
          const v = Math.max(dp[j - 1][p], pre[i] - pre[p]);
          if (v < dp[j][i]) { dp[j][i] = v; cut[j][i] = p; }
        }
      }
    }
    const out = [];
    let i = n;
    for (let j = k; j >= 1; j--) { const p = cut[j][i]; out.unshift([p, i]); i = p; }
    return out;
  }
  function layoutColumns() {
    const cs = getComputedStyle(el.arteries);
    const w = el.arteries.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (w <= 0) return;
    const small = window.innerWidth <= 760;
    const gap = small ? 9 : 14;
    const minCol = small ? 150 : 265;
    const n = Math.max(1, Math.min(4, Math.floor((w + gap) / (minCol + gap))));
    if (n === colCount) return;
    colCount = n;
    groupEls.forEach(({ group, cols }) => {
      cols.innerHTML = '';
      const weights = group.arteries.map(a => 2.3 + a.n * 1.05);
      partition(weights, n).forEach(([from, to]) => {
        const col = document.createElement('div');
        col.className = 'col';
        group.arteries.slice(from, to).forEach(a => col.appendChild(a.el));
        cols.appendChild(col);
      });
    });
  }
  if (window.ResizeObserver) new ResizeObserver(() => layoutColumns()).observe(el.arteries);
  else window.addEventListener('resize', layoutColumns);

  // ------------------------------------------------------------------
  // The full table (study view and the finish line)
  // ------------------------------------------------------------------
  function buildTable() {
    const t = document.createElement('table');
    t.className = 'irr';
    const hr = t.createTHead().insertRow();
    ['Artery', 'Region irrigated'].forEach(x => { const th = document.createElement('th'); th.textContent = x; hr.appendChild(th); });
    groups.forEach(g => {
      const gb = t.createTBody();
      gb.className = 'grp';
      const th = document.createElement('th');
      th.colSpan = 2;
      th.textContent = g.title;
      gb.insertRow().appendChild(th);
      g.arteries.forEach((a, i) => {
        const tb = t.createTBody();
        if (i % 2) tb.className = 'band';
        a.regions.forEach((r, j) => {
          const tr = tb.insertRow();
          if (j === 0) {
            tr.className = 'first';
            const td = tr.insertCell();
            td.className = 'art';
            td.rowSpan = a.n;
            td.textContent = a.name;
            if (a.branchOf) {
              const of = document.createElement('span');
              of.className = 'art-of';
              of.textContent = branchLabel(a);
              td.appendChild(of);
            }
          }
          tr.insertCell().textContent = r.label;
        });
      });
    });
    el.tableWrap.innerHTML = '';
    el.tableWrap.appendChild(t);
  }
  function openTable() {
    if (!el.tableDialog.open) el.tableDialog.showModal();
    el.tableWrap.scrollTop = 0;
  }
  el.tableClose.addEventListener('click', () => el.tableDialog.close());
  el.tableDone.addEventListener('click', () => el.tableDialog.close());
  el.tablePrint.addEventListener('click', () => window.print());
  el.btnStudy.addEventListener('click', openTable);

  // ------------------------------------------------------------------
  // Game state
  // ------------------------------------------------------------------
  let S = null;
  let seq = 0;
  const chipEls = new Map();
  const slotOfChip = new Map();

  function newState(mode) {
    const chips = [];
    arteries.forEach(a => a.regions.forEach(r => chips.push({ id: 'c' + chips.length, label: r.label, key: r.key, rand: Math.random(), artery: null, locked: false, wrong: false, seq: 0 })));
    return {
      mode,
      nick: cleanNick(savedNick()),
      chips, chipById: new Map(chips.map(c => [c.id, c])),
      selArtery: null, selChip: null,
      incoming: new Set(),
      revealed: new Map(),   // arteryId -> regions shown by "Show answers"
      mistakes: 0, hints: 0, streak: 0, bestStreak: 0,
      startedAt: 0, elapsed: 0, running: false, finished: false,
      checks: 0, firstScore: null,
      sort: store.get('sort', 'shuffle'),
      filter: ''
    };
  }

  const chipsIn = a => S.chips.filter(c => c.artery === a.id);
  const lockedIn = a => S.chips.filter(c => c.artery === a.id && c.locked);
  const free = a => a.n - chipsIn(a).length;
  const lockedTotal = () => S.chips.filter(c => c.locked).length;
  const isComplete = a => lockedIn(a).length === a.n;

  // Practice: can this region still go to this artery?
  function acceptable(chip, a) {
    if (!a.keys.includes(chip.key)) return false;
    return !lockedIn(a).some(c => c.key === chip.key);
  }

  // Test: grade everything that's placed but not confirmed yet
  function grade() {
    const correct = [], wrong = [];
    arteries.forEach(a => {
      const used = new Set(lockedIn(a).map(c => c.key));
      chipsIn(a).filter(c => !c.locked).sort((x, y) => x.seq - y.seq).forEach(c => {
        if (a.keys.includes(c.key) && !used.has(c.key)) { used.add(c.key); correct.push(c); }
        else wrong.push(c);
      });
    });
    return { correct, wrong };
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  }
  const elapsed = () => S.running ? Date.now() - S.startedAt : S.elapsed;

  function renderArteries() {
    slotOfChip.clear();
    arteries.forEach(a => {
      const inA = chipsIn(a);
      const locked = inA.filter(c => c.locked);
      const loose = inA.filter(c => !c.locked).sort((x, y) => x.seq - y.seq);
      const rev = S.revealed.get(a.id) || [];
      let items;
      if (rev.length) {
        items = locked.map(c => ({ chip: c, order: orderIn(a, c.key) })).concat(rev.map(r => ({ rev: r.label, order: r.order })));
        items.sort((x, y) => x.order - y.order);
      } else {
        // Confirmed rows sit in the table's order; unconfirmed ones follow in the order placed
        items = locked.sort((x, y) => orderIn(a, x.key) - orderIn(a, y.key)).map(c => ({ chip: c })).concat(loose.map(c => ({ chip: c })));
      }
      const selected = S.selArtery === a.id;
      let nextMarked = false;
      a.slotEls.forEach((s, i) => {
        const it = items[i];
        const chip = it && it.chip;
        const label = chip ? (chip.locked ? labelIn(a, chip.key, chip.label) : chip.label) : (it && it.rev) || ' ';
        if (s.labelEl.textContent !== label) s.labelEl.textContent = label;
        const empty = !it;
        const movable = !!chip && !chip.locked && S.running;
        s.classList.toggle('empty', empty);
        s.classList.toggle('correct', !!chip && chip.locked);
        s.classList.toggle('placed', !!chip && !chip.locked && !chip.wrong && S.running);
        s.classList.toggle('wrong', !!chip && chip.wrong);
        s.classList.toggle('revealed', !!(it && it.rev));
        s.classList.toggle('incoming', !!chip && S.incoming.has(chip.id));
        const isNext = empty && !nextMarked && selected;
        if (isNext) nextMarked = true;
        s.classList.toggle('next', isNext);
        s.tabIndex = movable ? 0 : -1;
        if (chip) { s.dataset.chip = chip.id; slotOfChip.set(chip.id, s); } else delete s.dataset.chip;
        let aria;
        if (chip && chip.locked) aria = `${label}, correct.`;
        else if (chip && chip.wrong) aria = `${chip.label}, wrong artery. Press to send it back.`;
        else if (chip) aria = `${chip.label}, placed. Press to send it back.`;
        else if (it && it.rev) aria = `${it.rev}, answer shown.`;
        else aria = 'Empty row.';
        s.setAttribute('aria-label', aria);
      });
      const filled = S.mode === 'test' ? inA.length : locked.length;
      const complete = locked.length === a.n;
      a.countText.textContent = complete ? (a.n === 1 ? 'Done' : `All ${a.n}`) : `${filled}/${a.n}`;
      a.fillEl.style.width = (locked.length / a.n * 100) + '%';
      a.el.classList.toggle('selected', selected);
      a.el.classList.toggle('complete', complete);
      a.el.classList.toggle('revealed-art', rev.length > 0);
      a.pickEl.setAttribute('aria-pressed', selected ? 'true' : 'false');
      a.pickEl.setAttribute('aria-label', `${a.name}: ${complete ? 'complete' : `${filled} of ${plural(a.n, 'region')}`}${selected ? ', selected' : ''}`);
    });
  }

  function sortedChips() {
    const list = S.chips.slice();
    if (S.sort === 'az') list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
    else list.sort((a, b) => a.rand - b.rand);
    return list;
  }

  function buildChips() {
    el.chips.innerHTML = '';
    chipEls.clear();
    S.chips.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.chip = c.id;
      b.textContent = c.label;
      chipEls.set(c.id, b);
    });
    bankOrderKey = '';
  }

  let bankOrderKey = '';
  function renderBank() {
    const q = S.filter.trim().toLowerCase();
    let left = 0, visible = 0;
    const order = sortedChips();
    const key = order.map(c => c.id).join(',');
    if (key !== bankOrderKey) { order.forEach(c => el.chips.appendChild(chipEls.get(c.id))); bankOrderKey = key; }
    order.forEach(c => {
      const b = chipEls.get(c.id);
      const inBank = !c.artery && !S.finished;
      if (inBank) left++;
      const show = inBank && (!q || c.label.toLowerCase().includes(q));
      if (show) visible++;
      b.hidden = !show;
      b.classList.toggle('selected', S.selChip === c.id);
      b.setAttribute('aria-pressed', S.selChip === c.id ? 'true' : 'false');
    });
    el.bankCount.textContent = S.finished ? 'All matched' : `${left} left`;
    let msg = '';
    if (S.finished && S.revealed.size) msg = 'The answers are filled in on the left. Start a new game to try again.';
    else if (S.finished) msg = 'Every region is matched. The table on the left is complete.';
    else if (left === 0 && S.mode === 'test') msg = 'Every region is placed. Check your answers when you’re ready.';
    else if (left > 0 && visible === 0) msg = `No regions match “${S.filter.trim()}”.`;
    el.bankEmpty.textContent = msg;
    el.bankEmpty.hidden = !msg;
    document.querySelectorAll('.bank .seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.sort === S.sort ? 'true' : 'false'));

    // What's selected, shown next to the list it's waiting on
    const a = S.selArtery && arteryById.get(S.selArtery);
    el.target.hidden = !a;
    if (a) {
      const togo = S.mode === 'test' ? free(a) : a.n - lockedIn(a).length;
      el.targetText.innerHTML = '';
      el.targetText.append('Regions for ', Object.assign(document.createElement('b'), { textContent: a.name }), ` · ${togo} to go`);
    }
    const c = S.selChip && S.chipById.get(S.selChip);
    el.chipPill.hidden = !c;
    if (c) {
      el.chipPillText.innerHTML = '';
      el.chipPillText.append(Object.assign(document.createElement('b'), { textContent: c.label }), ' → now pick its artery');
    }
  }

  function renderStats() {
    const done = lockedTotal();
    el.time.textContent = fmtTime(elapsed());
    el.score.textContent = fmtTime(scoreOf(elapsed(), S.mistakes, S.hints));
    el.mistakes.textContent = S.mode === 'test' && S.checks === 0 ? '–' : S.mistakes;
    el.hints.textContent = S.hints;
    el.progress.style.width = (done / TOTAL * 100) + '%';
    el.matchCount.textContent = S.mode === 'test' && !S.finished
      ? `${S.chips.filter(c => c.artery).length} of ${TOTAL} placed`
      : `${done} of ${TOTAL} matched`;
    el.modeLine.textContent = (S.nick ? S.nick + ' playing ' : '') + (S.mode === 'practice' ? 'Practice' : 'Test') + ' · head and neck';
    el.btnCheck.hidden = S.mode !== 'test';
    el.btnCheck.disabled = !S.running || !S.chips.some(c => c.artery && !c.locked);
    el.btnHint.disabled = !S.running;
    el.btnReveal.disabled = !S.running;
    const showStreak = S.mode === 'practice' && S.running && S.streak >= 2;
    el.streak.hidden = !showStreak;
    if (showStreak) {
      el.streakText.textContent = `${S.streak} in a row`;
      el.streak.classList.toggle('hot', S.streak >= 5);
    }
    document.body.classList.toggle('placing-artery', !!S.selArtery);
    document.body.classList.toggle('placing-chip', !!S.selChip);
  }

  function render() { renderArteries(); renderBank(); renderStats(); }

  setInterval(() => {
    if (!S || !S.running) return;
    el.time.textContent = fmtTime(elapsed());
    el.score.textContent = fmtTime(scoreOf(elapsed(), S.mistakes, S.hints));
  }, 250);

  // ------------------------------------------------------------------
  // Feedback helpers
  // ------------------------------------------------------------------
  let toastTimer = 0;
  function toast(msg, ms = 2400, good = false) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('good', !!good);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }
  function flash(node, cls, safety = 4000) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth; // restart the animation
    node.classList.add(cls);
    const off = () => { node.classList.remove(cls); node.removeEventListener('animationend', onEnd); clearTimeout(t); };
    const onEnd = e => { if (e.target === node) off(); };
    node.addEventListener('animationend', onEnd);
    const t = setTimeout(off, safety);
  }
  let thumpTimer = 0;
  function thump() {
    el.mark.classList.remove('thump');
    void el.mark.getBoundingClientRect();
    el.mark.classList.add('thump');
    clearTimeout(thumpTimer);
    thumpTimer = setTimeout(() => el.mark.classList.remove('thump'), 700);
  }
  const centerOf = node => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  // Keep a row in view inside the arteries panel before something flies to it
  function revealInPanel(node) {
    const pr = el.arteries.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    if (r.top < pr.top + 6 || r.bottom > pr.bottom - 6) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // The region flies from the list into its row; then blood rushes in
  function land(chip, fromRect, blood, after) {
    const slot = slotOfChip.get(chip.id);
    const done = () => {
      S.incoming.delete(chip.id);
      const s = slotOfChip.get(chip.id);
      if (s) {
        s.classList.remove('incoming');
        if (blood) {
          flash(s, 'flow');
          const [x, y] = centerOf(s);
          confetti.burst(x, y, 7, 0.55, ['drop', 'dot']);
        }
      }
      if (after) after();
    };
    if (!slot || !fromRect || reduceMotion.matches) { done(); return; }
    revealInPanel(slot);
    const to = slot.getBoundingClientRect();
    S.incoming.add(chip.id);
    slot.classList.add('incoming');
    const f = document.createElement('div');
    f.className = 'chip flyer';
    f.textContent = chip.label;
    f.style.width = fromRect.width + 'px';
    f.style.height = fromRect.height + 'px';
    document.body.appendChild(f);
    // Fly to the row's left edge, vertically centred on it, then melt into the row
    const x0 = fromRect.left, y0 = fromRect.top;
    const x1 = to.left + 2, y1 = to.top + (to.height - fromRect.height) / 2;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const lift = Math.min(90, 30 + dist * 0.12);
    const anim = f.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(1.08)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) scale(.97)`, opacity: 1, offset: 0.88 },
      { transform: `translate(${x1}px, ${y1}px) scale(.97)`, opacity: 0 }
    ], { duration: Math.max(420, Math.min(720, 300 + dist * 0.45)), easing: 'cubic-bezier(.45,.05,.3,1)' });
    let finished = false;
    const end = () => { if (finished) return; finished = true; f.remove(); done(); };
    anim.onfinish = end;
    anim.oncancel = end;
    setTimeout(end, 1200);
  }

  const STREAK_LINES = {
    3: 'Three in a row!',
    5: 'Five in a row! The blood is really flowing.',
    10: 'Ten in a row! Textbook anatomy.',
    15: 'Fifteen in a row! You could teach this.',
    20: 'Twenty in a row! Unstoppable.',
    25: 'Twenty-five in a row! Is this even fair?',
    30: 'Thirty in a row! Legendary.',
    35: 'Thirty-five in a row!',
    40: 'Forty in a row! Almost a perfect game.'
  };

  // ------------------------------------------------------------------
  // Matching
  // ------------------------------------------------------------------
  // Returns 'correct' | 'wrong' | 'placed' | 'full' | 'ignored'
  function place(chipId, arteryId, { fromEl, fromRect } = {}) {
    if (!S.running) return 'ignored';
    const chip = S.chipById.get(chipId);
    const a = arteryById.get(arteryId);
    if (!chip || !a || chip.artery) return 'ignored';
    if (free(a) <= 0) {
      toast(S.mode === 'practice' ? `The ${a.name} is already complete.` : `Every row of the ${a.name} is filled. Tap a row to send it back.`);
      flash(a.el, 'shake');
      S.selChip = null;
      render();
      return 'full';
    }
    const from = fromRect || (fromEl && fromEl.getBoundingClientRect());

    if (S.mode === 'practice') {
      if (!acceptable(chip, a)) {
        S.mistakes++; S.streak = 0;
        sound.wrong();
        flash(a.el, 'shake');
        flash(chipEls.get(chipId), 'shake');
        toast(a.keys.includes(chip.key)
          ? `The ${a.name} already has “${chip.label}”. This one belongs to another artery.`
          : `In this table, “${chip.label}” doesn’t go with the ${a.name}.`, 2800);
        S.selChip = null;
        render();
        return 'wrong';
      }
      chip.artery = a.id; chip.locked = true; chip.seq = ++seq;
      S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      S.selChip = null;
      const complete = isComplete(a);
      if (complete && S.selArtery === a.id) S.selArtery = null;
      const allDone = lockedTotal() === TOTAL;
      sound.correct();
      thump();
      render();
      if (S.streak >= 2 && !el.streak.hidden) flash(el.streak, 'bump');

      const lines = [];
      if (complete) lines.push(a.n === 1 ? `${a.name}: matched!` : `${a.name}: all ${a.n} regions found!`);
      const sline = STREAK_LINES[S.streak] || (S.streak > 40 && S.streak % 5 === 0 ? `${S.streak} in a row!` : '');
      if (sline && !allDone) lines.push(sline);
      if (complete) sound.chime();
      else if (sline) sound.sparkle();

      land(chip, from, true, () => {
        if (complete) {
          flash(a.el, 'beat');
          const [x, y] = centerOf(a.el);
          confetti.burst(x, y - 10, 30, 1.05, ['heart', 'heart', 'drop', 'paper']);
        } else if (sline) {
          const [x, y] = centerOf(el.streak.hidden ? a.el : el.streak);
          confetti.burst(x, y, 16, 0.8, ['paper', 'dot', 'heart']);
        }
        if (allDone) setTimeout(finish, 350);
      });
      if (lines.length && !allDone) toast(lines.join(' '), 2600, true);
      return 'correct';
    }

    // Test mode: anything goes until you check
    chip.artery = a.id; chip.wrong = false; chip.seq = ++seq;
    S.selChip = null;
    if (free(a) === 0 && S.selArtery === a.id) S.selArtery = null;
    sound.place();
    render();
    land(chip, from, false, () => flash(a.el, 'pop'));
    return 'placed';
  }

  function returnToBank(chipId) {
    const c = S.chipById.get(chipId);
    if (!c || c.locked || !S.running) return;
    c.artery = null; c.wrong = false;
    S.incoming.delete(c.id);
    render();
    flash(chipEls.get(c.id), 'hinted', 1200);
  }

  function onArtery(a) {
    if (!S || !S.running) return;
    if (S.selChip) { const id = S.selChip; place(id, a.id, { fromEl: chipEls.get(id) }); return; }
    if (free(a) <= 0) {
      toast(S.mode === 'practice' ? `The ${a.name} is complete.` : `Every row of the ${a.name} is filled. Tap a row to send it back.`);
      return;
    }
    S.selArtery = S.selArtery === a.id ? null : a.id;
    render();
  }

  el.arteries.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) return;
    const card = e.target.closest('.artery');
    if (!card || !S) return;
    const slot = e.target.closest('.slot');
    if (slot && slot.dataset.chip) {
      const c = S.chipById.get(slot.dataset.chip);
      if (c && !c.locked && S.running) { returnToBank(c.id); return; }
    }
    onArtery(arteryById.get(card.dataset.artery));
  });

  el.chips.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) return;
    const b = e.target.closest('.chip');
    if (!b || !S || !S.running) return;
    const id = b.dataset.chip;
    if (S.selArtery) { place(id, S.selArtery, { fromEl: b }); return; }
    S.selChip = S.selChip === id ? null : id;
    render();
  });

  el.targetX.addEventListener('click', () => { S.selArtery = null; render(); });
  el.chipPillX.addEventListener('click', () => { S.selChip = null; render(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !S || document.querySelector('dialog[open]')) return;
    if (S.selArtery || S.selChip) { S.selArtery = null; S.selChip = null; render(); }
  });

  // ------------------------------------------------------------------
  // Drag a region onto an artery (mouse; touch uses tap, tap)
  // ------------------------------------------------------------------
  let drag = null;
  let suppressClickUntil = 0;
  el.chips.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const b = e.target.closest('.chip');
    if (!b || !S || !S.running) return;
    e.preventDefault(); // no text selection while dragging (the click still fires)
    drag = { id: b.dataset.chip, el: b, x0: e.clientX, y0: e.clientY, active: false, over: null, ghost: null, dx: 0, dy: 0 };
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      const r = drag.el.getBoundingClientRect();
      drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
      const g = drag.el.cloneNode(true);
      g.classList.remove('selected', 'hinted', 'shake');
      g.classList.add('ghost');
      g.style.width = r.width + 'px';
      document.body.appendChild(g);
      drag.ghost = g;
      drag.el.classList.add('origin');
      document.body.classList.add('dragging');
      drag.active = true;
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-1.5deg)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const card = under && under.closest('.artery');
    if (card !== drag.over) {
      if (drag.over) drag.over.classList.remove('over');
      drag.over = card;
      if (card) card.classList.add('over');
    }
    const pr = el.arteries.getBoundingClientRect();
    if (e.clientX < pr.right) {
      if (e.clientY < pr.top + 50) el.arteries.scrollTop -= 14;
      else if (e.clientY > pr.bottom - 50) el.arteries.scrollTop += 14;
    }
  });
  function endDrag(drop) {
    const d = drag; drag = null;
    if (!d || !d.active) return;
    suppressClickUntil = Date.now() + 250;
    const gr = d.ghost.getBoundingClientRect();
    d.ghost.remove();
    d.el.classList.remove('origin');
    document.body.classList.remove('dragging');
    if (d.over) d.over.classList.remove('over');
    if (drop && d.over) place(d.id, d.over.dataset.artery, { fromRect: gr });
  }
  window.addEventListener('pointerup', () => endDrag(true));
  window.addEventListener('pointercancel', () => endDrag(false));

  // ------------------------------------------------------------------
  // Hints
  // ------------------------------------------------------------------
  el.btnHint.addEventListener('click', () => {
    if (!S.running) return;
    const bank = S.chips.filter(c => !c.artery);
    if (!bank.length) { toast(S.mode === 'test' ? 'Every region is placed. Check your answers.' : 'Nothing left to match.'); return; }
    let cands = arteries.filter(a => free(a) > 0);
    if (S.selArtery) cands = cands.sort((x, y) => (y.id === S.selArtery) - (x.id === S.selArtery));
    let pick = null;
    for (const a of cands) {
      const have = new Set(chipsIn(a).map(c => c.key));
      const need = a.keys.filter(k => !have.has(k));
      const chip = (S.selChip && need.includes(S.chipById.get(S.selChip).key) && S.chipById.get(S.selChip)) || bank.find(c => need.includes(c.key));
      if (chip) { pick = { a, chip }; break; }
    }
    if (!pick) { toast('Some regions are under the wrong artery. Check your answers to find them.', 3200); return; }
    S.hints++;
    S.selArtery = pick.a.id;
    S.selChip = null;
    if (S.filter && !pick.chip.label.toLowerCase().includes(S.filter.trim().toLowerCase())) { S.filter = ''; el.filter.value = ''; }
    render();
    const smooth = reduceMotion.matches ? 'auto' : 'smooth';
    pick.a.el.scrollIntoView({ block: 'nearest', behavior: smooth });
    const cb = chipEls.get(pick.chip.id);
    cb.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: smooth });
    flash(pick.a.el, 'hinted');
    flash(cb, 'hinted');
    toast(`“${pick.chip.label}” is irrigated by the ${pick.a.name}. Tap the pulsing region to match it.`, 3600);
  });

  // ------------------------------------------------------------------
  // Check answers (test mode)
  // ------------------------------------------------------------------
  el.btnCheck.addEventListener('click', () => {
    if (!S.running) return;
    const { correct, wrong } = grade();
    correct.forEach(c => { c.locked = true; c.wrong = false; });
    wrong.forEach(c => { c.wrong = true; });
    S.checks++;
    S.mistakes += wrong.length;
    if (S.firstScore == null) S.firstScore = correct.length;
    S.selArtery = null; S.selChip = null;
    render();
    correct.forEach((c, i) => setTimeout(() => flash(slotOfChip.get(c.id), 'flow'), i * 45));
    arteries.filter(a => isComplete(a) && correct.some(c => c.artery === a.id)).forEach((a, i) => setTimeout(() => flash(a.el, 'beat'), 300 + i * 90));
    if (lockedTotal() === TOTAL) { setTimeout(finish, 600); return; }
    if (correct.length) sound.correct(); else sound.wrong();

    const done = lockedTotal();
    const unplaced = S.chips.filter(c => !c.artery).length;
    const pct = Math.round(done / TOTAL * 100);
    const parts = [];
    if (wrong.length) parts.push(`${wrong.length} ${wrong.length === 1 ? 'region is' : 'regions are'} under the wrong artery (marked in amber).`);
    if (unplaced) parts.push(`${unplaced} ${unplaced === 1 ? 'region is' : 'regions are'} still in the list.`);
    setTimeout(() => showResult({
      title: `${done} of ${TOTAL} correct`,
      text: `That’s ${pct}%. Correct rows now fill with blood. ${parts.join(' ')}`,
      stats: [['Correct', done], ['Wrong', wrong.length], ['Not placed', unplaced], ['Time', fmtTime(elapsed())]],
      best: '',
      actions: [
        { label: 'Show answers', cls: 'btn', fn: () => askReveal() },
        {
          label: wrong.length ? 'Try the wrong ones again' : 'Keep going', cls: 'btn btn-primary', fn: () => {
            S.chips.forEach(c => { if (c.wrong) { c.wrong = false; c.artery = null; } });
            render();
          }
        }
      ]
    }), 450);
  });

  // ------------------------------------------------------------------
  // Reveal, finish, results
  // ------------------------------------------------------------------
  function askReveal() {
    confirmBox({
      title: 'Show the answers?',
      text: 'This ends the round without a score. Every row you haven’t got right yet will be filled in for you.',
      yes: 'Show answers', no: 'Keep playing',
      onYes: reveal
    });
  }
  el.btnReveal.addEventListener('click', () => { if (S.running) askReveal(); });

  function reveal() {
    S.chips.forEach(c => { if (!c.locked) { c.artery = null; c.wrong = false; } });
    S.incoming.clear();
    arteries.forEach(a => {
      const have = new Set(lockedIn(a).map(c => c.key));
      const missing = a.regions.filter(r => !have.has(r.key));
      if (missing.length) S.revealed.set(a.id, missing);
    });
    stopClock();
    S.finished = true;
    S.selArtery = null; S.selChip = null;
    render();
    toast('Answers shown in gray italics. Start a new game to try again.', 3400);
  }

  function stopClock() {
    if (S.running) { S.elapsed = Date.now() - S.startedAt; S.running = false; }
  }

  function finish() {
    if (S.finished) return;
    stopClock();
    S.finished = true;
    S.selArtery = null; S.selChip = null;
    render();
    const time = Math.round(S.elapsed);
    const score = scoreOf(time, S.mistakes, S.hints);
    const run = { nickname: S.nick, mode: S.mode, time_ms: time, mistakes: S.mistakes, hints: S.hints };

    // Every finished run is kept on this device too (and powers the offline leaderboard)
    const key = nickKey(S.nick);
    const local = store.get('v2.runs', []);
    const prevBest = local
      .filter(r => nickKey(r.nickname) === key && r.mode === run.mode)
      .reduce((m, r) => Math.min(m, r.score_ms), Infinity);
    local.push(Object.assign({}, run, { score_ms: score, at: new Date().toISOString() }));
    store.set('v2.runs', local.slice(-300));

    const extras = [];
    if (S.mistakes) extras.push(`${S.mistakes * MISTAKE_PENALTY_MS / 1000} seconds for ${plural(S.mistakes, 'mistake')}`);
    if (S.hints) extras.push(`${S.hints * HINT_PENALTY_MS / 1000} seconds for ${plural(S.hints, 'hint')}`);
    const breakdown = extras.length
      ? `Your score is ${fmtTime(score)}: ${fmtTime(time)} on the clock, plus ${extras.join(' and ')}.`
      : `Your score is ${fmtTime(score)}, with no mistakes and no hints.`;
    let lead;
    if (S.mode === 'practice') {
      lead = S.mistakes === 0
        ? `A perfect game${S.nick ? ', ' + S.nick : ''}! All ${TOTAL} regions matched without a single mistake.`
        : `Brilliant work${S.nick ? ', ' + S.nick : ''}. All ${TOTAL} regions are matched to their arteries, and your longest streak was ${S.bestStreak} in a row.`;
    } else {
      lead = S.firstScore === TOTAL
        ? `Every region was right on the first check${S.nick ? ', ' + S.nick : ''}!`
        : `All ${TOTAL} regions are right${S.nick ? ', ' + S.nick : ''}; ${S.firstScore} were right on the first check.`;
    }

    const show = () => {
      showResult({
        mascot: true,
        title: 'Every region is irrigated!',
        text: `${lead} ${breakdown}`,
        stats: [['Score', fmtTime(score)], ['Time', fmtTime(time)], ['Mistakes', S.mistakes], ['Hints', S.hints]],
        best: lb.on ? 'Saving your score to the leaderboard…' : localBestLine(prevBest, score),
        actions: [
          { label: 'See the full table', cls: 'btn', fn: openTable },
          { label: 'Leaderboard', cls: 'btn', fn: () => openBoard(run.mode) },
          { label: 'Play again', cls: 'btn btn-primary', fn: () => openIntro() }
        ]
      });
      confetti.raise();
      if (lb.on) submitRun(run, score, prevBest);
    };
    celebrate(show);
  }

  // A heartbeat runs across every artery, then the confetti falls
  function celebrate(done) {
    sound.finish();
    if (reduceMotion.matches) { done(); return; }
    const cards = arteries.map(a => ({ a, r: a.el.getBoundingClientRect() }))
      .sort((x, y) => (x.r.left - y.r.left) || (x.r.top - y.r.top));
    [0, 850].forEach(b0 => cards.forEach(({ a }, i) => setTimeout(() => flash(a.el, 'beat'), b0 + i * 38)));
    setTimeout(() => confetti.rain(), 500);
    setTimeout(done, 1900);
  }

  function localBestLine(prevBest, score) {
    if (!isFinite(prevBest)) return 'Your first finished table on this board. That’s the score to beat.';
    if (score < prevBest) return `Your best score yet on this board. Previous best: ${fmtTime(prevBest)}.`;
    return `Your best on this board is ${fmtTime(prevBest)}.`;
  }

  async function submitRun(run, score, prevLocalBest) {
    const line = el.resultBest;
    if (run.time_ms < MIN_TIME_MS) { line.textContent = localBestLine(prevLocalBest, score); return; }
    try {
      const board = await lb.board(run.mode) || [];
      await lb.submit(run);
      const key = nickKey(run.nickname);
      const mine = board.find(r => r.nickname_key === key);
      const others = board.filter(r => r.nickname_key !== key);
      const best = mine ? Math.min(mine.score_ms, score) : score;
      const rank = 1 + others.filter(r => r.score_ms < best).length;
      const where = `#${rank} of ${others.length + 1} on the ${boardLabel(run.mode)} leaderboard`;
      if (!mine) line.textContent = `Saved. You’re on the board at ${where}.`;
      else if (score < mine.score_ms) line.textContent = `New personal best. You’re ${where}.`;
      else line.textContent = `Saved. Your best is still ${fmtTime(mine.score_ms)}, ${where}.`;
    } catch (e) {
      if (retryable(e)) {
        queueRun(run);
        line.textContent = notSetUp(e)
          ? `${localBestLine(prevLocalBest, score)} The global leaderboard isn’t switched on yet; your score is saved and will be sent once it is.`
          : 'Couldn’t reach the leaderboard. Your score is saved on this device and will be sent the next time you open the game.';
      } else {
        line.textContent = `The leaderboard didn’t accept this score (${e.message}).`;
      }
    }
  }

  function showResult({ title, text, stats, best, actions, mascot }) {
    el.mascot.hidden = !mascot;
    el.resultTitle.textContent = title;
    el.resultText.textContent = text;
    el.resultStats.innerHTML = '';
    stats.forEach(([k, v]) => {
      const d = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      d.append(dt, dd);
      el.resultStats.appendChild(d);
    });
    el.resultBest.textContent = best || '';
    el.resultActions.innerHTML = '';
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = a.cls; b.textContent = a.label;
      b.addEventListener('click', () => {
        // "See the full table" opens on top, so the result stays underneath
        if (a.fn !== openTable) el.result.close();
        a.fn();
      });
      el.resultActions.appendChild(b);
    });
    if (el.result.open) el.result.close();
    el.result.showModal();
    const primary = el.resultActions.querySelector('.btn-primary');
    if (primary) primary.focus();
  }

  let confirmHandler = null;
  function confirmBox({ title, text, yes, no, onYes }) {
    el.confirmTitle.textContent = title;
    el.confirmText.textContent = text;
    el.confirmYes.textContent = yes;
    el.confirmNo.textContent = no;
    confirmHandler = onYes;
    el.confirm.showModal();
    el.confirmNo.focus();
  }
  el.confirmYes.addEventListener('click', () => { el.confirm.close(); const f = confirmHandler; confirmHandler = null; if (f) f(); });
  el.confirmNo.addEventListener('click', () => { el.confirm.close(); confirmHandler = null; });

  // ------------------------------------------------------------------
  // New game / intro
  // ------------------------------------------------------------------
  const NICK_HINT = 'Use the same nickname every time to keep all your scores together.';
  function openIntro() {
    const prefs = store.get('prefs', { mode: 'practice' });
    el.introForm.elements.mode.value = prefs.mode === 'test' ? 'test' : 'practice';
    el.nickInput.value = cleanNick(savedNick());
    el.nickHint.textContent = NICK_HINT;
    el.nickHint.classList.remove('error');
    if (!el.intro.open) el.intro.showModal();
    (el.nickInput.value ? document.getElementById('btnStart') : el.nickInput).focus();
  }
  el.nickInput.addEventListener('input', () => { el.nickHint.textContent = NICK_HINT; el.nickHint.classList.remove('error'); });
  el.intro.addEventListener('cancel', e => { if (!S || !S.running) e.preventDefault(); });
  el.introForm.addEventListener('submit', e => {
    e.preventDefault();
    const nick = cleanNick(el.nickInput.value);
    if (!nick) {
      el.nickHint.textContent = 'Enter a nickname to start. It’s how your scores show up on the leaderboard.';
      el.nickHint.classList.add('error');
      el.nickInput.focus();
      return;
    }
    const mode = el.introForm.elements.mode.value === 'test' ? 'test' : 'practice';
    store.set('prefs', { mode });
    store.set('nickname', nick);
    el.intro.close();
    startGame(mode);
  });

  el.btnNew.addEventListener('click', () => {
    const inProgress = S && S.running && (S.chips.some(c => c.artery) || elapsed() > 15000);
    const go = () => { if (S.running) stopClock(); openIntro(); };
    if (inProgress) confirmBox({ title: 'Start a new game?', text: 'You’ll lose your progress on this table.', yes: 'New game', no: 'Keep playing', onYes: go });
    else go();
  });

  function startGame(mode) {
    const sortPref = S ? S.sort : store.get('sort', 'shuffle');
    S = newState(mode);
    S.sort = sortPref;
    el.filter.value = '';
    buildChips();
    S.running = true;
    S.startedAt = Date.now();
    render();
    el.arteries.scrollTop = 0;
    el.chips.scrollTop = 0; el.chips.scrollLeft = 0;
    sound.ensure(); // unlock audio on this user gesture
    toast(mode === 'practice' ? 'Pick an artery, then tap every region it irrigates.' : 'Fill every artery’s rows, then press Check answers.', 3200);
  }

  // Bank tools
  el.filter.addEventListener('input', () => { S.filter = el.filter.value; renderBank(); });
  document.querySelectorAll('.bank .seg button').forEach(b => b.addEventListener('click', () => {
    S.sort = b.dataset.sort; store.set('sort', S.sort);
    if (S.sort === 'shuffle') S.chips.forEach(c => { c.rand = Math.random(); });
    renderBank();
  }));

  // Sound toggle
  function renderSound() {
    el.btnSound.setAttribute('aria-pressed', sound.on ? 'true' : 'false');
    el.btnSound.setAttribute('aria-label', sound.on ? 'Sound on' : 'Sound off');
    el.btnSound.title = sound.on ? 'Sound on' : 'Sound off';
  }
  el.btnSound.addEventListener('click', () => { sound.on = !sound.on; store.set('sound', sound.on); renderSound(); if (sound.on) sound.correct(); });

  // ------------------------------------------------------------------
  // Leaderboard dialog
  // ------------------------------------------------------------------
  const boardView = { mode: 'practice', token: 0 };

  function fmtWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' }) +
      ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function localBoard(mode) {
    const best = new Map();
    store.get('v2.runs', []).filter(r => r.mode === mode).forEach(r => {
      const k = nickKey(r.nickname);
      const cur = best.get(k);
      if (!cur) best.set(k, Object.assign({}, r, { nickname_key: k, runs: 1, created_at: r.at }));
      else {
        cur.runs++;
        if (r.score_ms < cur.score_ms) Object.assign(cur, r, { nickname_key: k, runs: cur.runs, created_at: r.at });
      }
    });
    return [...best.values()].sort((a, b) => a.score_ms - b.score_ms || String(a.created_at).localeCompare(String(b.created_at)));
  }

  function openBoard(mode) {
    boardView.mode = mode || (S ? S.mode : 'practice');
    if (!el.boardDialog.open) el.boardDialog.showModal();
    loadBoard();
  }

  async function loadBoard() {
    const token = ++boardView.token;
    el.boardDialog.querySelectorAll('[data-bmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bmode === boardView.mode)));
    el.boardBody.innerHTML = '<p class="board-msg">Loading scores…</p>';
    let rows = null, note = '';
    if (lb.on) {
      try { rows = await lb.board(boardView.mode) || []; }
      catch (e) {
        note = notSetUp(e)
          ? 'The global leaderboard for this game isn’t switched on yet, so this shows scores from this device only.'
          : 'Couldn’t reach the leaderboard right now, so this shows scores from this device only.';
      }
    } else {
      note = 'The global leaderboard isn’t connected yet, so this shows scores from this device only.';
    }
    if (token !== boardView.token) return; // a newer tab was chosen meanwhile
    const global = !!rows;
    if (!rows) rows = localBoard(boardView.mode);
    el.boardNote.textContent = note;
    el.boardNote.hidden = !note;
    renderBoard(rows, global);
  }

  function cell(tag, text, cls) {
    const c = document.createElement(tag);
    if (text != null) c.textContent = text;
    if (cls) c.className = cls;
    return c;
  }

  function renderBoard(rows, global) {
    el.boardBody.innerHTML = '';
    if (!rows.length) {
      el.boardBody.appendChild(cell('p', `No scores on the ${boardLabel(boardView.mode)} board yet. Finish a game to be the first.`, 'board-msg'));
      return;
    }
    const me = nickKey(savedNick());
    const table = cell('table', null, 'lb');
    const head = table.createTHead().insertRow();
    [['#', 'num'], ['Player', ''], ['Score', 'num'], ['Time', 'num opt'], ['Mistakes', 'num opt'], ['Hints', 'num opt'], ['Runs', 'num']]
      .forEach(([t, c]) => head.appendChild(cell('th', t, c)));
    const tbody = table.createTBody();
    let rank = 0, prev = null;
    rows.forEach((r, i) => {
      if (r.score_ms !== prev) { rank = i + 1; prev = r.score_ms; }
      const tr = tbody.insertRow();
      if (r.nickname_key === me) tr.className = 'me';
      tr.appendChild(cell('td', rank, 'num rank'));
      const who = cell('td', null, 'who');
      const btn = cell('button', r.nickname, 'player');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => togglePlayer(tr, r, global, btn));
      who.appendChild(btn);
      tr.appendChild(who);
      tr.appendChild(cell('td', fmtTime(r.score_ms), 'num score'));
      tr.appendChild(cell('td', fmtTime(r.time_ms), 'num opt'));
      tr.appendChild(cell('td', r.mistakes, 'num opt'));
      tr.appendChild(cell('td', r.hints, 'num opt'));
      tr.appendChild(cell('td', r.runs, 'num'));
    });
    el.boardBody.appendChild(table);
    const mine = el.boardBody.querySelector('tr.me');
    if (mine) mine.scrollIntoView({ block: 'nearest' });
  }

  async function togglePlayer(tr, r, global, btn) {
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('runs-row')) {
      next.remove();
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    btn.setAttribute('aria-expanded', 'true');
    const row = document.createElement('tr');
    row.className = 'runs-row';
    const td = cell('td', 'Loading runs…');
    td.colSpan = 7;
    row.appendChild(td);
    tr.after(row);
    let runs;
    try {
      runs = global ? (await lb.runs(r.nickname_key) || [])
        : store.get('v2.runs', []).filter(x => nickKey(x.nickname) === r.nickname_key).map(x => Object.assign({}, x, { created_at: x.at })).reverse();
    } catch (e) {
      td.textContent = 'Couldn’t load this player’s runs. Try again in a moment.';
      return;
    }
    td.textContent = '';
    td.appendChild(cell('p', `${plural(runs.length, 'run')} by ${r.nickname}${global ? '' : ' on this device'}`, 'runs-title'));
    const t = cell('table', null, 'runs');
    const h = t.createTHead().insertRow();
    [['When', ''], ['Mode', ''], ['Score', 'num'], ['Time', 'num'], ['Mistakes', 'num opt'], ['Hints', 'num opt']].forEach(([x, c]) => h.appendChild(cell('th', x, c)));
    const b = t.createTBody();
    runs.forEach(x => {
      const rr = b.insertRow();
      rr.appendChild(cell('td', fmtWhen(x.created_at)));
      rr.appendChild(cell('td', boardLabel(x.mode)));
      rr.appendChild(cell('td', fmtTime(x.score_ms), 'num score'));
      rr.appendChild(cell('td', fmtTime(x.time_ms), 'num'));
      rr.appendChild(cell('td', x.mistakes, 'num opt'));
      rr.appendChild(cell('td', x.hints, 'num opt'));
    });
    td.appendChild(t);
  }

  el.btnBoard.addEventListener('click', () => openBoard());
  el.boardClose.addEventListener('click', () => el.boardDialog.close());
  el.boardDialog.addEventListener('click', e => { if (e.target === el.boardDialog) el.boardDialog.close(); });
  el.boardDialog.querySelectorAll('[data-bmode]').forEach(b => b.addEventListener('click', () => { boardView.mode = b.dataset.bmode; loadBoard(); }));

  // ------------------------------------------------------------------
  // About
  // ------------------------------------------------------------------
  const aboutDialog = document.getElementById('aboutDialog');
  document.getElementById('btnAbout').addEventListener('click', () => { if (!aboutDialog.open) aboutDialog.showModal(); });
  ['aboutClose', 'aboutDone'].forEach(id => document.getElementById(id).addEventListener('click', () => aboutDialog.close()));
  aboutDialog.addEventListener('click', e => { if (e.target === aboutDialog) aboutDialog.close(); });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  function boot() {
    buildArteries();
    buildTable();
    S = newState('practice');
    S.running = false;
    buildChips();
    render();
    renderSound();
    openIntro();
    flushPending();
  }

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]).then(boot);
})();